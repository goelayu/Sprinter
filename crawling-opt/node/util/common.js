/**
 * This module contains common js utility functions
 */

const fs = require("fs"),
  program = require("commander"),
  netParser = require("../parser/network.js");

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
    console.log((lastReq.endTime - lastReq.requestStart_o)*1000); //in ms
    // console.log(wait);
  }
};

if (program.type == "dl") return getResourceDLTime(program.input);
