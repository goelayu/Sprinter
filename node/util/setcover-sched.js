/**
 * @fileoverview
 * Take in a set of pages with their correponding network json logs
 * Leverages the set-cover library to identify the minimum set of pages that
 * cover JS files fetched by all pages.
 * And constructs a schedule of pages to fetch.
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");
const SC = require("../lib/set-cover.js");

program
  .option("-b, --basedir <dir>", "dir containing network.json files")
  .option("-p, --pages <pages>", " file containing list of pages")
  .option("-o, --output <output>", "output directory")
  .parse(process.argv);

const DYNDOMAINS = [
  "fundingchoicesmessages.google.com",
  "tr.hit.gemius.pl",
  "gemhu.adocean.pl",
];

var getNet = function (path) {
  var data = fs.readFileSync(path, "utf-8");
  var net = netParser.parseNetworkLogs(JSON.parse(data));
  net = net.filter(filternet);
  return net;
};

var filternet = function (n) {
  return (
    n.request &&
    n.request.method == "GET" &&
    n.url.indexOf("data") != 0 &&
    !DYNDOMAINS.some((d) => n.url.includes(d)) &&
    n.type &&
    n.size &&
    n.size > 100 &&
    n.response.status == 200
  );
};

var traversePages = function () {
  var nets = [];
  var pages = fs.readFileSync(program.pages, "utf-8").split("\n");
  for (var p of pages) {
    if (p.length == 0) continue;
    try {
      var net = getNet(`${program.basedir}/${p}/network.json`);
      net = net.filter(filternet);
      nets.push(net);
    } catch (e) {
      program.verbose && console.log(e);
    }
  }
  return nets;
};

var _allPages = function (nets) {
  var p = [];
  for (var net of nets) {
    net.length && p.push(net[0].documentURL);
  }
  return p;
};

var addRemainingPages = function (all, sc) {
  var res = all.filter((p) => !sc.includes(p));
  return res;
};

var schedPages = function () {
  var nets = traversePages();
  var allpages = _allPages(nets);
  // var scpages = SC.setCover(nets);
  var scpages = SC.setCoverStatic(nets);
  var res = addRemainingPages(allpages, scpages);
  for (var p of scpages) {
    console.log(p);
  }
  for (var p of res) {
    console.error(p);
  }
};

schedPages();
