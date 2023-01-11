/**
 * @fileoverview
 * This script identifies what JavaScript files are unique to a given page
 * across all pages on that site
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");
const crypto = require("crypto");

program.version("0.0.1").option("-p, --paths [paths]").parse(process.argv);

if (!program.paths) {
  console.log("Please specify a path to the site");
  process.exit(1);
}

var ignoreUrl = function (n) {
  var type = n.type;
  return (
    n.request.method != "GET" ||
    n.url.indexOf("data") == 0 ||
    n.type.indexOf("script") < 0 ||
    !n.size ||
    n.response.status != 200
  );
};

var visitPage = function (netObj, payload, jsStore) {
  for (var n of netObj) {
    if (ignoreUrl(n)) continue;

    var payloadObj = payload.filter((p) => p.url == n.url)[0];
    // console.log(payloadObj.data)
    var hash;
    if (!payloadObj || !payloadObj.data) hash = n.size;
    else hash = crypto.createHash("md5").update(payloadObj.data).digest("hex");
    var key = n.url + hash;
    if (!jsStore[key]) jsStore[key] = 0;
    jsStore[key]++;
  }
};

var countJS = function () {
  var jsStore = {};
  var pageObjs = [],
    pagePayloads = [];
  fs.readFileSync(program.paths, "utf8")
    .split("\n")
    .filter((f) => f)
    .forEach(function (path) {
      var netObj = netParser.parseNetworkLogs(
        JSON.parse(fs.readFileSync(`${path}/network.json`, "utf8"))
      );
      pageObjs.push(netObj);
      var payLoad = JSON.parse(fs.readFileSync(`${path}/payload.json`, "utf8"));
      pagePayloads.push(payLoad);
      visitPage(netObj, payLoad, jsStore);
    });

  // count unique JavaScript resources per page
  pageObjs.forEach((p, i) => {
    var unique = (total = 0);
    var payload = pagePayloads[i];
    for (var n of p) {
      if (ignoreUrl(n)) continue;
      total++;
      var payloadObj = payload.filter((p) => p.url == n.url)[0];
      var hash;
      if (!payloadObj || !payloadObj.data) hash = n.size;
      else
        hash = crypto.createHash("md5").update(payloadObj.data).digest("hex");
      var key = n.url + hash;
      if (jsStore[key] == 1) unique++;
    }
    console.log(`${i}: ${unique} ${total}`);
  });
};

countJS();
