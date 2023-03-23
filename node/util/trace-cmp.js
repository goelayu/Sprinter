/**
 * @fileoverview compare two different recorded traces
 * to measure the resource overlap
 * Note that some difference could be due to some sites being 403
 * due to execessive crawling
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");

program
  .option("-p, --pages <pages>", "first trace files")
  .option("-t, --trace1 <trace1>", "first trace dir")
  .option("-u, --trace2 <trace2>", "second trace dir")
  .option("-v, --verbose", "verbose")
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

var unique = function (arr) {
  return [...new Set(arr)];
};

var traversePages = function () {
  var store = {
    trace1: [],
    trace2: [],
    common: [],
  };
  var pages = fs.readFileSync(program.pages, "utf-8").split("\n");
  for (var p of pages) {
    if (p.length == 0) continue;
    var [site, page] = p.split(" ");
    try {
      var net1 = getNet(`${program.trace1}/${site}/${page}/network.json`);
      var net2 = getNet(`${program.trace2}/${site}/${page}/network.json`);
      net1 = net1.filter(filternet).map((n) => n.url.split("?")[0]);
      net2 = net2.filter(filternet).map((n) => n.url.split("?")[0]);

      for (var r of net1) {
        store.trace1.push(r);
      }
      for (var r of net2) {
        store.trace2.push(r);
      }
      var overlap = net1.filter((r) => net2.includes(r));
      console.log(
        `${site} ${page} ${overlap.length} ${net1.length} ${net2.length}`
      );
    } catch (e) {
      program.verbose && console.log(e);
    }
  }

  store.trace1 = unique(store.trace1);
  store.trace2 = unique(store.trace2);

  for (var r of store.trace1) {
    if (store.trace2.includes(r)) {
      store.common.push(r);
    }
  }

  console.log(
    `trace1: ${store.trace1.length}, trace2: ${store.trace2.length}, common: ${store.common.length}`
  );
};

traversePages();
