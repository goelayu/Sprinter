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
const { GlobSync } = require("glob");
const crypto = require("crypto");

const DYNDOMAINS = [
  "fundingchoicesmessages.google.com",
  "tr.hit.gemius.pl",
  "gemhu.adocean.pl",
];

program
  .option("-b, --basedir <dir>", "dir containing network.json files")
  .option("-p, --pages <pages>", " file containing list of pages")
  .option("-o, --output <output>", "output file")
  .option("--glob", "glob pattern for pages")
  .option("--payload", "enable payload parsing")
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
        script: { total: 0, unique: 0, hashunique: 0, urls: {}, hashes: {} },
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
    },
    durls = [];

  var getType = function (n) {
    var t = Object.keys(store.type).find((t) => n.type.indexOf(t) != -1);
    if (!t) t = "other";
    return t;
  };
  var pages = [];
  if (program.glob) {
    var f = GlobSync(program.basedir);
    pages = f.found;
  } else {
    dirs = fs
      .readFileSync(program.pages, "utf-8")
      .split("\n")
      .filter((d) => d);
    pages = dirs.map((d) => `${program.basedir}/${d}`);
  }
  await Promise.all(
    pages.map(async (p) => {
      var static = (total = 0);
      try {
        var net = getNet(`${p}/network.json`);
        if (program.payload) {
          var pl = JSON.parse(fs.readFileSync(`${p}/payload.json`, "utf8"));
        }
        var fnet = net.filter(filternet);
        var js = fnet.filter((n) => n.type.indexOf("script") != -1);
        console.log(p, js.length);
        for (var n of fnet) {
          var type = getType(n);
          if (!type) continue;
          if (type == "script" && program.payload) {
            var plobj = pl.filter((p) => p.url == n.url)[0];
            var hash = crypto
              .createHash("md5")
              .update(plobj.data)
              .digest("hex");
          }
          console.log(n.url, n.type, n.size, n.initiator.type);
          store.type[type].total++;
          store.tsize.sum += n.size;
          store.tsize[type] += n.size;
          total += n.size;
          if (
            n.initiator.type != "script" &&
            durls.indexOf(n.initiator.url) == -1
          ) {
            static += n.size;
            store.tsize.sumstatic += n.size;
          } else durls.push(n.url);
          var url = n.url.split("?")[0];
          if (!store.urls[url]) {
            store.urls[url] = 1;
            store.type[type].unique++;
            store.usize.sum += n.size;
            if (
              n.initiator.type != "script" &&
              durls.indexOf(n.initiator.url) == -1
            )
              store.usize.sumstatic += n.size;
            store.usize[type] += n.size;
            type == "script" && (store.type[type].urls[url] = 1);
          } else {
            store.urls[url]++;
            type == "script" && store.type[type].urls[url]++;
          }
          if (type == "script" && program.payload) {
            if (!store.type[type].hashes[hash]) {
              store.type[type].hashes[hash] = [url];
              store.type[type].hashunique++;
            } else store.type[type].hashes[hash].push(url);
          }
        }
      } catch (e) {
        console.log(e);
      }
      // console.log(`per page ${p} ${total} ${static}`);
    })
  );
  console.log(
    JSON.stringify(
      store,
      (k, v) => (k == "urls" || k == "hashes" ? undefined : v),
      2
    )
  );
  fs.writeFileSync(
    `${program.output}/js-props.json`,
    JSON.stringify(store.type["script"], null, 2)
  );
  // console.log("size", store.size.total, store.size.unique, store.size.alltotal);
};

traversePages();
