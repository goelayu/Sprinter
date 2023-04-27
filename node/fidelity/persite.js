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
  .option("--preprocess", "first processes all the opt files together")
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
  var burls = bnet.map((n) => {
    n.url = n.url.replace(/https?:\/\//, "").split("?")[0];
    return n;
  });

  var missing = [],
    missingSize = 0,
    admissing = [];
  burls.forEach((bn, idx) => {
    if (!ourls[bn.url]) {
      missing.push(bn.url);
      missingSize += bnet[idx].size;
      program.verbose && console.log(`missing: ${bn.url}`);
      // if (!checkBlockUrl(bn, engine)) admissing.push(bn);
    }
  });
  return [missing, missingSize];
};

var saveUrls = function (path, store, page) {
  var net = getNet(path).filter(filternet);
  net.forEach((n) => {
    var url = n.url.replace(/https?:\/\//, "").split("?")[0];
    if (!store.urls[url]) store.urls[url] = n;
  });
  store.nets[page] = net;
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
      saveUrls(ppath, store, p);
      procpages.push(p);
    } catch (e) {
      program.verbose && console.log(`[preprocessing] error in ${p}: ${e}`);
    }
  }
  var tsize = 0,
    msize = 0;
  for (var p of procpages) {
    if (p.length == 0) continue;
    try {
      var ppath = `${program.basedir}/${p}/network.json`;
      var bnet = getNet(ppath);
      bnet = bnet.filter(filternet);
      var curls = store.urls;
      if (!program.preprocess) {
        var cnet = store.nets[p];
        curls = {};
        cnet.forEach((n) => {
          var url = n.url.replace(/https?:\/\//, "").split("?")[0];
          if (!curls[url]) curls[url] = n;
        });
      }
      var [missing, missingsize] = compareFidelity(bnet, curls);
      console.log(`${p}: total: ${bnet.length} missing: ${missing.length}`);
      t += bnet.length;
      missing.forEach((e) => {
        m[e] = 1;
      });
      tsize += bnet.reduce((a, b) => a + b.size, 0);
      msize += missingsize;
    } catch (e) {
      program.verbose && console.log(`error in ${p}: ${e}`);
    }
  }
  console.log(
    `total: ${Object.keys(store.urls).length} missing: ${Object.keys(m).length}`
  );
  console.log(`total size: ${tsize} missing size: ${msize}`);
};

CompareSites();
