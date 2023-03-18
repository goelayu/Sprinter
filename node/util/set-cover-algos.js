/**
 *
 * Perform set cover analysis on JS files fetched by a set of pages
 * Use different heuristics to determine set cover
 * and compare against truly random pages
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");
const URL = require("url");

program
  .option("-b, --basedir <dir>", "dir containing network.json files")
  .option("-p, --pages <pages>", " file containing list of pages")
  .option("-s, --scheduler <scheduler>", "scheduler to use")
  .option("-v, --verbose", "verbose output")
  .parse(process.argv);

const DYNDOMAINS = [
  "fundingchoicesmessages.google.com",
  "tr.hit.gemius.pl",
  "gemhu.adocean.pl",
];

var shuffle = function (arr) {
  var array = arr.slice(0);
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
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

var customSched = function (net, union) {
  var nPages = 0;
  var js = [],
    urltoNet = {},
    dirtoUrl = {};
  for (var n of net) {
    if (!n.length) continue;
    var url = n[0].documentURL;
    urltoNet[url] = n;
    var pUrl = URL.parse(url);
    var paths = pUrl.pathname.split("/");
    var dir = paths.splice(0, paths.length - 1).join("/");
    if (!dirtoUrl[dir]) dirtoUrl[dir] = [];
    dirtoUrl[dir].push(url);
  }
  var dirOrder = Object.keys(dirtoUrl).sort((a, b) => a.length - b.length);
  var entireloop = 0;
  while (js.length < union.length) {
    if (entireloop > 3) return nPages;
    for (var dir of dirOrder) {
      var pages = dirtoUrl[dir];
      var UNCHANGEDLIM = 2;
      unchanged = 0;
      while (pages.length > 0) {
        var url = pages.shift();
        if (!url) continue;
        var n = urltoNet[url];
        var beforeLen = js.length;
        n.filter((n) => n.type.indexOf("script") != -1)
          .map((n) => n.url.split("?")[0])
          .forEach((u) => {
            if (js.indexOf(u) == -1) js.push(u);
          });
        if (js.length == beforeLen) unchanged++;
        else unchanged = 0;
        if (unchanged >= UNCHANGEDLIM) {
          program.verbose &&
            console.log(`unchanged for ${UNCHANGEDLIM} pages in ${dir}`);
          nPages++;
          break;
        }
        program.verbose &&
          console.log(
            `page: ${nPages} ${url} from dir: ${dir} js: ${js.length}`
          );
        nPages++;
        if (js.length >= union.length) return nPages;
      }
    }
    entireloop++;
  }
  return nPages;
};

var randomSched = function (net, union) {
  var nPages = 0;
  var net = shuffle(net);
  var js = [];
  for (var n of net) {
    n.filter((n) => n.type.indexOf("script") != -1)
      .map((n) => n.url.split("?")[0])
      .forEach((u) => {
        if (js.indexOf(u) == -1) js.push(u);
      });
    nPages++;
    if (js.length >= union.length) break;
  }
  return nPages;
};

var greedySched = function (nets, union) {
  var nPages = [];
  var js = [];
  var nettoUrl = {};

  class JSNet {
    constructor(net) {
      this.jss = net
        .filter((n) => n.type.indexOf("script") != -1)
        .map((n) => n.url.split("?")[0]);
      this.url = net.length > 0 ? net[0].documentURL : "";
    }
  }

  nets = nets.map((n) => new JSNet(n));

  var largestUncovered = function (nets, union) {
    var largest = nets[0],
      largestLen = 0,
      largestUrl = "";
    for (var net of nets) {
      var uncovered = net.jss.filter((n) => union.includes(n));
      if (uncovered.length > largestLen) {
        largest = uncovered;
        largestLen = uncovered.length;
        largestUrl = net.url;
      }
    }
    program.verbose && console.log(`Picking next: ${largestUrl}`);
    return [largest, largestUrl];
  };

  var iter = 0;
  var unioncp = union.slice();
  while (js.length < unioncp.length) {
    var [net, u] = largestUncovered(nets, union);
    program.verbose && console.log(`largest uncovered: ${net.length}`);
    for (var n of net) {
      if (js.indexOf(n) == -1) js.push(n);
    }
    nPages.push(u);
    union = union.filter((n) => !net.includes(n));
    program.verbose && console.log(`js: ${js.length}, union: ${union.length}`);
    // remove net from nets
    var netindex = nets.indexOf(net);
    netindex != -1 && nets.splice(netindex, 1);
  }

  return nPages;
};

var main = function () {
  var nets = traversePages();
  var js = unionJS(nets);
  program.verbose &&
    console.log(`Total pages: ${nets.length}, Total JS: ${js.length}`);

  switch (program.scheduler) {
    case "random":
      var nPages = randomSched(nets, js);
      break;
    case "greedy":
      var nPages = greedySched(nets, js);
      break;
    case "custom":
      var nPages = customSched(nets, js);
  }
  for (var p of nPages) console.log(p);
};

main();
