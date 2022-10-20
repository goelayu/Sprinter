/**
 *
 * Extracts all dynamic URLs, i.e., URLs fetched via JavaScript.
 * Then for every string in the source code of the body,
 * we construct a mapping from string literals to the URL.
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../../node/lib/network.js");
const URL = require("url");
const extractStrings = require('./extract-info.js');
const { extractFromScripts, extractFromHTML } = require("./extract-info.js");

program
  .version("0.0.1")
  .option(
    "-i, --input [dir]",
    "Input directory containing all the relevant JSONs"
  )
  .option("-o, --output [file]", "Output file")
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
    if (type && type.includes("script"))
      literals = extractFromScripts(r.data);
    else if (type && type.includes("html"))
      literals = extractFromHTML(r.data);
    else continue;
    res.push({
      url: r.url,
      literals: literals,
    });
  }
  return res;
};

var mapper = function () {
  var dynamicURLs = extractDynamicURLs(`${program.input}/network.json`);
  var strLiterals = extractStrLiterals(`${program.input}/payload.json`);

  var res = {};

  for (var o of strLiterals) {
    for (var l of o.literals) {
      for (var u of dynamicURLs) {
        var path = u.path;
        var href = u.href;
        if (href == o.url) continue;
        if (!(href in res)) res[href] = [];
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
    var path = parsedUrl.path;
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

var urlMap = mapper();
var topMatches = topStringMatches(urlMap);
fs.writeFileSync(program.output, JSON.stringify(topMatches, null, 2), "utf8");
