/**
 * @fileoverview Instead of computing set cover
 * with is NP hard, how about we simply identify
 * the set of files which each contain a unique resource
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");

program
  .option("-b, --basedir <dir>", "dir containing network.json files")
  .option("-p, --pages <pages>", " file containing list of pages")
  .parse(process.argv);

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

var accJs = function (nets) {
  var jsCount = {};
  for (var net of nets) {
    var js = net.filter((n) => n.type.indexOf("script") != -1);
    for (var j of js) {
      var url = j.url.split("?")[0];
      if (!jsCount[url]) jsCount[url] = 0;
      jsCount[url]++;
    }
  }
  return jsCount;
};

var main = function () {
  var nets = traversePages();
  var jsCount = accJs(nets);
  var uniquePages = 0;
  for (var net of nets) {
    if (net.length == 0) continue;
    var pageurl = net[0].documentURL;
    var js = net.filter((n) => n.type.indexOf("script") != -1);
    for (var j of js) {
      var url = j.url.split("?")[0];
      if (jsCount[url] == 1) {
        uniquePages++;
        break;
      }
    }
  }
  console.log(uniquePages);
};

main();
