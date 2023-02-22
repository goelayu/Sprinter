/**
 *
 * Computes fidelity per site
 * i.e., sum total of all fetches made by all pages in a site
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");

program
  .option("-b, --basedir <dir>", "dir containing network.json files")
  .option("-o, --optdir <dir>", "dir containing opt network.json files")
  .option("-p, --pages <pages>", " file containing list of pages")
  .parse(process.argv);

// if (!program.dir || !program.pages) {
//   console.log("missing arguments");
//   process.exit(1);
// }

var filternet = function (n) {
  return (
    n.request &&
    n.request.method == "GET" &&
    n.url.indexOf("data") != 0 &&
    n.type &&
    n.size &&
    n.size > 100 &&
    n.response.status == 200
  );
};

var getNet = function (path) {
  var data = fs.readFileSync(path, "utf-8");
  var net = netParser.parseNetworkLogs(JSON.parse(data));
  net = net.filter(filternet);
  return net;
};

var compareFidelity = function (bnet, onet) {
  var burls = bnet.map((n) => n.url.split("?")[0]);
  var ourls = onet.map((n) => n.url.split("?")[0]);
  var missing = burls.filter((u) => !ourls.includes(u));
  return missing.length;
};

var summarynet = function (net, store) {
  net.forEach((n) => {
    var url = n.url.split("?")[0];
    if (!store[url]) store[url] = 1;
  });
};

var CompareSites = function () {
  var bstore = {},
    ostore = {};
  var pages = fs.readFileSync(program.pages, "utf8").split("\n");
  for (var p of pages) {
    if (p == "") continue;
    var path = `${program.dir}/${p}/network.json`;
    try {
      var bpath = `${program.basedir}/${p}/network.json`;
      var opath = `${program.optdir}/${p}/network.json`;
      var bnet = getNet(bpath);
      var onet = getNet(opath);
      var missing = compareFidelity(bnet, onet);
      console.log(p, missing);
      summarynet(bnet, bstore);
      summarynet(onet, ostore);
    } catch (e) {
      console.log(e);
    }
  }
  console.log("total requests", Object.keys(bstore).length);
  console.log("total opt requests", Object.keys(ostore).length);
};

CompareSites();
