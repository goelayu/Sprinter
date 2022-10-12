/**
 * This module contains common js utility functions
 */

const fs = require("fs"),
  program = require("commander"),
  netParser = require("../lib/network.js");

program
  .option("-i, --input [input]", "path to the input file")
  .option("-a, --anotherin [anotherin]", "path to the second input file")
  .option("-t, --type [type]", "type of run")
  .option("--site-type [value]", " type of sites, live or archive")
  .option("-o, --output [output]", "path to output file")
  .parse(process.argv);

var parse = function (f) {
  return JSON.parse(fs.readFileSync(f));
};

var firstNonNegative = function (a, b, c) {
  return a >= 0 ? a : b >= 0 ? b : c;
};

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

var matchURLs = function (source, destination, type) {
  if (type == 0) return source == destination;
  else if (type == 1) return source.split("?")[0] == destination.split("?")[0];
};

var getResourceDLTime = function (input) {
  var net = netParser.parseNetworkLogs(parse(input));
  var resourceDLTime = 0;
  for (var n of net) {
    var lastReq = n.redirects.length ? n.redirects[n.redirects.length - 1] : n;
    if (!lastReq.response || !lastReq.endTime) continue;
    var timing = n.timing;
    var stalled = firstNonNegative(
      timing.dnsStart,
      timing.connectStart,
      timing.sendStart
    );
    var wait = timing.receiveHeadersEnd - timing.sendEnd;
    if (stalled == -1) stalled = 0;
    // console.log((lastReq.endTime - lastReq.requestStart_o)*1000); // total fetch time
    // console.log((lastReq.requestStart - lastReq.requestStart_o)*1000 + stalled); // total fetch time
    // console.log(stalled);
    var tKey = 'sslStart';
    // (timing[tKey] != -1) && (console.log(timing.sslEnd - timing[tKey]));
    // console.log(lastReq.endTime - (lastReq.requestStart + lastReq.timing.receiveHeadersEnd/1000) ); // total time to download
      console.log(lastReq.timing.sendStart); // ttfb time
  }
};

var totalSize = function(input){
  var net = netParser.parseNetworkLogs(parse(input));
  var totalsize = 0;
  for (var n of net) {
    if (!n.size) continue;
    // console.log(n.url)
    totalsize += n.size;
  }
  console.log(totalsize);
}

var getMatchingResources = function (input, anotherin) {
  var net = netParser.parseNetworkLogs(parse(input));
  var anotherNet = netParser.parseNetworkLogs(parse(anotherin));
  var matching = 0;
  var mainURL = net[0].request.url;

  for (var n of net) {
    if (ignoreUrl(n)) continue;
    // if (n.type.indexOf("script") < 0) continue;
    var matchFound = false;
    for (var a of anotherNet) {
      if (ignoreUrl(a)) continue;
      if (matchURLs(n.url, a.url, 1)) {
        console.log(`found: ${n.url}`);
        matching++;
        matchFound = true;
        break;
      }
    }
    if (!matchFound) {
      console.log(`no match ${n.url}`);
    }
  }
  console.log(matching);
};


if (program.type == "dl") return getResourceDLTime(program.input);
if (program.type == "size") return totalSize(program.input);
if (program.type == "match") return getMatchingResources(program.anotherin, program.input);


var add = function(a,b){
  return a+b;
}