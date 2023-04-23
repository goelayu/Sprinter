/**
 * @fileoverview compare two different recorded traces
 * to measure the resource overlap
 * Note that some difference could be due to some sites being 403
 * due to execessive crawling
 *
 * identifies what pages won't be able to reuse signatures from prior traces
 * either because they contain a new resource or because
 * they fetch a resource that was not fetched in the prior traces
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");
const dag = require("../lib/nw-dag.js");

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

/**
 *
 * @param {array[array]} prevFetches
 * @param {array} curFetches
 * @param {int} type 0 - exact match, 1 - remove query params
 */
var sameFileFetches = function (prevFetches, curFetches, type) {
  if (type == 1) {
    curFetches = curFetches.map((f) => f.split("?")[0]);
    var _prevFetches = [];
    for (var f of prevFetches) {
      _prevFetches.push(f.map((f) => f.split("?")[0]));
    }
    prevFetches = _prevFetches;
  }
  for (var f of prevFetches) {
    if (f.length != curFetches.length) continue;
    if (JSON.stringify(f.sort()) == JSON.stringify(curFetches.sort()))
      return true;
  }
  return false;
};

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

var getAllNets = function (tracedir, pages) {
  var nets = [];
  for (var p of pages) {
    if (p.length == 0) continue;
    var [site, page] = p.split(" ");
    try {
      var net = getNet(`${tracedir}/${site}/${page}/network.json`);
      net = net.filter(filternet);
      nets.push(net);
    } catch (e) {
      //
    }
  }
  return nets;
};

var unionJS = function (nets) {
  var js = [];
  for (var n of nets) {
    js = js.concat(
      n
        .filter((n) => n.type.indexOf("script") != -1)
        .map((n) => n.url.split("?")[0])
    );
  }
  program.verbose && console.log("UNION", js.length);
  return [...new Set(js)];
};

var processFirstTrace = function (nets) {
  var fileMem = {};
  for (var net of nets) {
    var graph = new dag.Graph(net);
    graph.createTransitiveEdges();
    var fetches = graph.transitiveEdges;
    var jss = net.filter((n) => n.type && n.type.indexOf("script") != -1);
    for (var n of jss) {
      var key = n.url.split("?")[0];

      if (fileMem[key]) {
        var fPrev = fileMem[key]["fetches"];
        var fCurr = fetches[n.url],
          execFound = null;
        if (fCurr && fCurr.length) {
          execFound = sameFileFetches(fPrev, fCurr, 1);
          // localtotal++;
          if (!execFound) {
            fileMem[key]["fetches"].push(fCurr);
          }
        }
      } else {
        fileMem[key] = {};
        var f = (fileMem[key]["fetches"] = []),
          _f = fetches[n.url];
        _f && _f.length && f.push(_f);
      }
    }
  }
  return fileMem;
};

var main = function () {
  var pages = fs.readFileSync(program.pages, "utf-8").split("\n");
  var nets1 = getAllNets(program.trace1, pages);
  var js1 = unionJS(nets1);
  var fileMem = processFirstTrace(nets1);
  var nets2 = getAllNets(program.trace2, pages);
  var js2 = unionJS(nets2);
  var summary = {
    total: 0,
    newfile: 0,
    newfetch: 0,
    newjs: js2.filter((j) => !js1.includes(j)).length,
  };

  for (var net of nets2) {
    var graph = new dag.Graph(net);
    graph.createTransitiveEdges();
    var fetches = graph.transitiveEdges;
    var jss = net.filter((n) => n.type && n.type.indexOf("script") != -1);
    summary.total++;
    for (var n of jss) {
      var key = n.url.split("?")[0];
      if (fileMem[key]) {
        var fPrev = fileMem[key]["fetches"];
        var fCurr = fetches[n.url],
          execFound = null;
        if (fCurr && fCurr.length) {
          execFound = sameFileFetches(fPrev, fCurr, 1);
          // localtotal++;
          if (!execFound) {
            fileMem[key]["fetches"].push(fCurr);
            summary.newfetch++;
            break;
          }
        }
      } else {
        fileMem[key] = {};
        var f = (fileMem[key]["fetches"] = []),
          _f = fetches[n.url];
        _f && _f.length && f.push(_f);
        summary.newfile++;
        break;
      }
    }
  }
  console.log(summary);
};

main();
