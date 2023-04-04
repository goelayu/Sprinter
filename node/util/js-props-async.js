/**
 * @fileoverview A simple script to extract the JavaScript properties from a given workload
 * specifically outputs the total number of JS files and the number of unique files
 * also outputs the corresponding sizes
 *
 * First draft: Only considers file names for uniqueness
 * Second draft: Need to incorporate sizes as well (with a small margin of error)
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");
var fsp = require("fs-promise");

const DYNDOMAINS = [
  "fundingchoicesmessages.google.com",
  "tr.hit.gemius.pl",
  "gemhu.adocean.pl",
];

program
  .option("-b, --basedir <dir>", "dir containing network.json files")
  .option("-p, --pages <pages>", " file containing list of pages")
  .option("-o, --output <output>", "output file")
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
    // !DYNDOMAINS.some((d) => n.url.includes(d)) &&
    n.type &&
    n.size &&
    // n.size > 100 &&
    n.response.status == 200
  );
};

var traversePages = async function () {
  var store = {
    type: {
      image: { total: 0, unique: 0 },
      script: { total: 0, unique: 0 },
      css: { total: 0, unique: 0 },
      html: { total: 0, unique: 0 },
      other: { total: 0, unique: 0 },
    },
    tsize: {
      script: 0,
      css: 0,
      image: 0,
      html: 0,
      other: 0,
      sum: 0,
      sumstatic: 0,
    },
    usize: {
      script: 0,
      css: 0,
      image: 0,
      html: 0,
      other: 0,
      sum: 0,
      sumstatic: 0,
    },
    urls: {},
  };

  var getType = function (n) {
    var t = Object.keys(store.type).find((t) => n.type.indexOf(t) != -1);
    if (!t) t = "other";
    return t;
  };

  var pages = fs.readFileSync(program.pages, "utf-8").split("\n");
  await Promise.all(
    pages.map(async (p) => {
      if (p.length == 0) return;
      try {
        var net = getNet(`${program.basedir}/${p}/network.json`);
        var fnet = net.filter(filternet);
        var js = fnet.filter((n) => n.type.indexOf("script") != -1);
        console.log(p, js.length);
        for (var n of fnet) {
          var type = getType(n);
          if (!type) continue;
          console.log(n.url, n.type, n.size, n.initiator.type);
          store.type[type].total++;
          store.tsize.sum += n.size;
          store.tsize[type] += n.size;
          if (n.initiator.type == "parser") store.tsize.sumstatic += n.size;
          var url = n.url.split("?")[0];
          if (!store.urls[url]) {
            store.urls[url] = 1;
            store.type[type].unique++;
            store.usize.sum += n.size;
            if (n.initiator.type == "parser") store.usize.sumstatic += n.size;
            store.usize[type] += n.size;
          } else store.urls[url]++;
        }
      } catch (e) {
        // console.log(e);
      }
    })
  );
  console.log(
    JSON.stringify(store, (k, v) => (k == "urls" ? undefined : v), 2)
  );
  // fs.writeFileSync(
  //   `${program.output}/js-props.json`,
  //   JSON.stringify(store.urls, null, 2)
  // );
  // console.log("size", store.size.total, store.size.unique, store.size.alltotal);
};

traversePages();
