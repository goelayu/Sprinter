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
  if (!urltype) return false;
  // console.log(
  //   `checking adblock with args ${n.url}, ${urltype}, ${engine.sourceUrl}`
  // );
  return engine.check(n.url, urltype, engine.sourceUrl);
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

var compareFidelity = function (bnet, onet, engine) {
  var bnet = bnet.map((n) => {
    n.url = n.url.split("?")[0];
    return n;
  });
  var onet = onet.map((n) => {
    n.url = n.url.split("?")[0];
    return n;
  });

  var missing = [],
    admissing = [];
  bnet.forEach((bn) => {
    if (!onet.map((n) => n.url).includes(bn.url)) {
      missing.push(bn);
      if (checkBlockUrl(bn, engine)) admissing.push(bn);
    }
  });
  return [missing, admissing];
};

var summarynet = function (net, store) {
  net.forEach((n) => {
    var url = n.url.split("?")[0];
    if (!store[url]) store[url] = n;
  });
};

var CompareSites = function () {
  var bstore = {},
    ostore = {};
  var pages = fs.readFileSync(program.pages, "utf8").split("\n");
  var engineSet = false;
  for (var p of pages) {
    if (p == "") continue;
    var path = `${program.dir}/${p}/network.json`;
    try {
      var bpath = `${program.basedir}/${p}/network.json`;
      var opath = `${program.optdir}/${p}/network.json`;
      var bnet = getNet(bpath);
      var onet = getNet(opath);
      if (!engineSet) {
        ENGINE = initAdBlock(bnet[0].url);
        engineSet = true;
      }
      var missres = compareFidelity(bnet, onet, ENGINE);
      console.log(p, missres[0].length, missres[1].length);
      summarynet(bnet, bstore);
      summarynet(onet, ostore);
    } catch (e) {
      console.log(e);
    }
  }
  console.log("total requests", Object.keys(bstore).length);
  console.log("total opt requests", Object.keys(ostore).length);
  var totalmisres = compareFidelity(
    Object.values(bstore),
    Object.values(ostore),
    ENGINE
  );
  console.log("total missing", totalmisres[0].length, totalmisres[1].length);
};

CompareSites();
