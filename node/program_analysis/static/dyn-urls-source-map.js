/**
 *
 * Extracts all dynamic URLs, i.e., URLs fetched via JavaScript.
 * Then for every string in the source code of the body,
 * we construct a mapping from string literals to the URL.
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../../lib/network.js");
const URL = require("url");
const extractStrings = require("./extract-info.js");
const { extractFromScripts, extractFromHTML } = require("./extract-info.js");

program
  .version("0.0.1")
  .option(
    "-i, --input [dir]",
    "Input directory containing all the relevant JSONs"
  )
  .option("-o, --output [file]", "Output file")
  .option("-v, --verbose", "Verbose output")
  .parse(process.argv);

if (!program.input) {
  console.log("Please specify an input file");
  process.exit(1);
}

var ignoreUrl = function (n) {
  var type = n.type;
  return (
    n.request.method != "GET" ||
    n.url.indexOf("data") == 0 ||
    !n.type ||
    !n.size ||
    n.response.status != 200
  );
};

var extractDynamicURLs = function (input) {
  var input = JSON.parse(fs.readFileSync(input, "utf8"));
  var netObj = netParser.parseNetworkLogs(input);

  var dynamicURLs = [];

  for (var n of netObj) {
    if (ignoreUrl(n)) continue;
    if (n.initiator.type != "script") continue;
    var reqUrl = n.redirects.length ? n.redirects[0].url : n.url;
    var reqUrlObj = URL.parse(reqUrl);
    dynamicURLs.push(reqUrlObj);
  }

  return dynamicURLs;
};

var extractStrLiterals = function (input) {
  var input = JSON.parse(fs.readFileSync(input, "utf8"));
  var res = [];
  for (var r of input) {
    if (!r.data) continue;
    var type = r.headers["content-type"];
    var literals;
    if (type && type.includes("script")) {
      program.verbose && console.log("Extracting from script", r.url);
      literals = extractFromScripts(r.data);
    } else if (type && type.includes("html")) {
      program.verbose && console.log("Extracting from HTML", r.url);
      literals = extractFromHTML(r.data);
    } else continue;
    res.push({
      url: r.url,
      literals: literals,
      date: new Date(r.headers["date"]),
    });
  }
  // return res.sort((a, b) => a.date - b.date);
  return res;
};

var mapper = function () {
  var dynamicURLs = extractDynamicURLs(`${program.input}/network.json`);
  var strLiterals = extractStrLiterals(`${program.input}/payload.json`);

  var res = {};
  for (var u of dynamicURLs) {
    path = u.href;
    href = u.href;
    res[href] = [];
    for (var o of strLiterals) {
      if (u.href == o.url) break;
      for (var l of o.literals) {
        if (path.includes(l)) {
          if (res[href].map((x) => x.literal).includes(l)) continue;
          res[href].push({
            url: o.url,
            literal: l,
          });
        }
      }
    }
  }
  return res;
};

var topStringMatches = function (resMap) {
  var res = {};
  Object.keys(resMap).forEach(function (url) {
    var matches = resMap[url].sort(
      (a, b) => b.literal.length - a.literal.length
    );
    var topMatches = [];
    var parsedUrl = URL.parse(url);
    var path = parsedUrl.href;
    for (var m of matches) {
      if (path.includes(m.literal)) {
        topMatches.push(m);
        path = path.replace(m.literal, "");
      }
    }
    res[url] = topMatches;
  });
  return res;
};

var fractionMatched = function (matches, url) {
  // mmap: map from URL to list of matches

  var parsedUrl = URL.parse(url);
  var path = parsedUrl.href;
  var ranges = [];
  for (var m of matches) {
    var start = path.indexOf(m.literal);
    var end = start + m.literal.length;
    ranges.push([start, end]);
    var dummyfill = "\u03A9".repeat(m.literal.length);
    path = path.replace(m.literal, dummyfill);
  }
  var total = parsedUrl.path.length,
    matched = 0;
  var pathInd = parsedUrl.href.indexOf(parsedUrl.path);
  for (var r of ranges) {
    if (r[0] >= pathInd) matched += r[1] - r[0];
    if (r[0] < pathInd && r[1] >= pathInd) matched += r[1] - pathInd ;
  }
  return matched / total;
};

var totalFraction = function (mmap) {
  var total = 0;
  Object.keys(mmap).forEach(function (url) {
    var t = fractionMatched(mmap[url], url);
    // console.log(url, mmap[url], t);
    total += t;
  });
  return total / Object.keys(mmap).length;
};

var urlMap = mapper();
var topMatches = topStringMatches(urlMap);
var fraction = totalFraction(topMatches);
console.log("Fraction of URL matched by string literals", fraction);
// fs.writeFileSync(program.output, JSON.stringify(topMatches, null, 2), "utf8");
