/**
 *
 * Computes fidelity per site
 * i.e., sum total of all fetches made by all pages in a site
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");
const adblockRust = require("adblock-rs");

const EASYLIST = `${__dirname}/easylist.txt`;
var ENGINE;

program
  .option("-b, --basedir <dir>", "dir containing network.json files")
  .option("-o, --optdir <dir>", "dir containing opt network.json files")
  .option("-p, --pages <pages>", " file containing list of pages")
  .option("-v, --verbose", "verbose output")
  .parse(process.argv);

var initAdBlock = function (sourceUrl) {
  var filterSet = new adblockRust.FilterSet(true);
  var easylistFilters = fs.readFileSync(EASYLIST, "utf-8").split("\n");
  filterSet.addFilters(easylistFilters);

  var engine = new adblockRust.Engine(filterSet, true);
  engine.sourceUrl = sourceUrl;
  return engine;
};

var checkBlockUrl = function (n, engine) {
  var types = ["image", "script", "stylesheet", "document"];
  var urltype = types.find((t) => n.type.indexOf(t) != -1);
  console.log(n.type);
  if (!urltype) urltype = "other";

  var u = n.url;
  if (u.indexOf("http") != 0) u = "http" + u;
  console.log(
    `checking adblock with args ${u}, ${urltype}, ${engine.sourceUrl}`
  );
  return engine.check(u, urltype, engine.sourceUrl);
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

var getNet = function (path) {
  var data = fs.readFileSync(path, "utf-8");
  var net = netParser.parseNetworkLogs(JSON.parse(data));
  net = net.filter(filternet);
  return net;
};

var compareFidelity = function (bnet, ourls, engine) {
  var bnet = bnet.map((n) => {
    n.url = n.url.replace(/https?:\/\//, "").split("?")[0];
    return n;
  });

  var missing = [],
    admissing = [];
  bnet.forEach((bn) => {
    if (!ourls[bn.url]) {
      missing.push(bn);
      program.verbose && console.log(`missing: ${bn.url}`);
      // if (!checkBlockUrl(bn, engine)) admissing.push(bn);
    }
  });
  return [missing, admissing];
};

var saveUrls = function (path, store) {
  var net = getNet(path);
  net.forEach((n) => {
    var url = n.url.replace(/https?:\/\//, "").split("?")[0];
    if (!store.urls[url]) store.urls[url] = n;
  });
};

var CompareSites = function () {
  var store = {
      urls: {},
      nets: {},
    },
    t = 0,
    m = {};
  var pages = fs.readFileSync(program.pages, "utf8").split("\n");
  var procpages = [];
  var engineSet = false;
  for (var p of pages) {
    if (p.length == 0) continue;
    try {
      var ppath = `${program.optdir}/${p}/network.json`;
      saveUrls(ppath, store);
      procpages.push(p);
    } catch (e) {
      program.verbose && console.log(`[preprocessing] error in ${p}: ${e}`);
    }
  }
  for (var p of procpages) {
    if (p.length == 0) continue;
    try {
      var ppath = `${program.basedir}/${p}/network.json`;
      var bnet = getNet(ppath);
      bnet = bnet.filter(filternet);
      var [missing, admissing] = compareFidelity(bnet, store.urls);
      console.log(`${p}: total: ${bnet.length} missing: ${missing.length}`);
      t += bnet.length;
      missing.forEach((e) => {
        m[e.url] = 1;
      });
    } catch (e) {
      program.verbose && console.log(`error in ${p}: ${e}`);
    }
  }
  console.log(`total: ${t} missing: ${Object.keys(m).length}`);
};

CompareSites();
