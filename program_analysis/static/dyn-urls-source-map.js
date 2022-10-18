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
const extractStrings = require("./extract-info.js");

program
  .version("0.0.1")
  .option("-i, --input [dir]", "Input directory containing all the relevant JSONs")
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

var extractDynamicURLs = function(input) {
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
}

var extractStrLiterals = function(input){
  var input = JSON.parse(fs.readFileSync(input, "utf8"));
  var res = [];
  for (var r of input){
    if (!r.data) continue;
    if (!r.headers["content-type"] || !r.headers["content-type"].includes("script")) continue;
    var literals = extractStrings(r.data);
    res.push({
      url: r.url,
      literals: literals
    });
  }
  return res;
}

var mapper = function(){
  var dynamicURLs = extractDynamicURLs(`${program.input}/network.json`);
  var strLiterals = extractStrLiterals(`${program.input}/payload.json`);

  var res = {};

  for (var o of strLiterals){
    for (var l of o.literals){
      for (var u of dynamicURLs){
        var path = u.path;
        var href = u.href;
        if (!(href in res)) res[href] = [];
        if (path.includes(l)){
          res[href].push({
            url: o.url,
            literal: l
          })
        }
      }
    }
  }

  return res;
}

var res = mapper();
fs.writeFileSync(program.output, JSON.stringify(res, null, 2), "utf8");