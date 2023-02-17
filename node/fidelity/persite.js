/**
 *
 * Computes fidelity per site
 * i.e., sum total of all fetches made by all pages in a site
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");

program
  .option("-d, --dir <dir>", "dir containing network.json files")
  .option("-p, --pages <pages>", " file containing list of pages")
  .parse(process.argv);

if (!program.dir || !program.pages) {
  console.log("missing arguments");
  process.exit(1);
}

var filternet = function (n) {
  return n.request.method === "GET" && n.type && n.size;
};

var getTotalRequests = function () {
  var total = 0,
    jsCount = 0;
  var resources = {};
  var pages = fs.readFileSync(program.pages, "utf8").split("\n");
  for (var p of pages) {
    if (p == "") continue;
    var path = `${program.dir}/${p}/network.json`;
    try {
      data = fs.readFileSync(path, "utf-8");
      var net = netParser.parseNetworkLogs(JSON.parse(data));
      net = net.filter(filternet);
      for (var n of net) {
        resources[n.url] = 1;
        if (n.type && n.type.indexOf("script") > -1 && n.size > 0) jsCount++;
      }
      total += net.length;
      console.log(p, net.length);
    } catch (e) {
      // console.log(e);
    }
  }
  console.log("js count", jsCount);
  return resources;
};

console.log(Object.keys(getTotalRequests()).length);
