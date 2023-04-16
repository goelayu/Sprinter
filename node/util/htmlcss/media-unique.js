const fs = require("fs");
const program = require("commander");
const htmlparser = require("node-html-parser");
const css = require("css");
const netParser = require("../../lib/network.js");

program
  .option("-b, --base <base>", "payload file")
  .option("-p, --pages <pages>", " file containing list of pages")
  .option("--payload <payload>", "payload file")
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

var sumSize = function (net, urls) {
  var size = 0;
  for (var u of urls) {
    u = u.replace(/\.\./g, "");
    for (var n of net) {
      if (n.initiator.type == "parser") continue;
      if (n.url.split("?")[0].includes(u.split("?")[0])) {
        size += n.size;
        break;
      }
    }
  }
  return size;
};

var parseHTML = function (html) {
  if (!html) return [];
  var medias = new Set();
  var root = htmlparser.parse(html);
  var elems = root.querySelectorAll("*");
  for (var e of elems) {
    if (!e.attributes) continue;
    var srcset = e.attributes.srcset;
    if (srcset) {
      var m = srcset.split(",").map((u) => u.trim().split(" ")[1]);
      for (var mm of m) {
        if (mm) medias.add(mm);
      }
    }
    if (e.attributes.media) medias.add(e.attributes.media);
  }
  return [...medias];
};

var parseCSS = function (cstring) {
  if (!css) return [];
  var medias = new Set();
  var obj = css.parse(cstring);
  var rules = obj.stylesheet.rules;
  for (var r of rules) {
    if (!r.type || !r.type.media) continue;
    var s = JSON.stringify(r);
    var urls = s.match(/url\((.*?)\)/g);
    if (urls) {
      medias.add(r.media);
    }
  }
  return [...medias];
};

var traversePages = function () {
  var total = (unique = 0);
  var allmedias = [];
  var pages = fs
    .readFileSync(program.pages, "utf-8")
    .split("\n")
    .filter((p) => p.length > 0);
  for (var p of pages) {
    try {
      var murls = [],
        surls = [];
      var payload = JSON.parse(
        fs.readFileSync(`${program.base}/${p}/payload.json`, "utf-8")
      );
      // var net = getNet(`${program.base}/${p}/network.json`);
      var html = payload.filter(
        (p) =>
          p.headers["content-type"] &&
          p.headers["content-type"].includes("html")
      )[0].data;
      var medias = parseHTML(html);
      // var cssfiles = payload.filter(
      //   (p) =>
      //     p.headers["content-type"] && p.headers["content-type"].includes("css")
      // );
      // for (var c of cssfiles) {
      //   medias = medias.concat(parseCSS(c.data));
      // }
      total += medias.length;
      for (var m of medias) {
        if (!allmedias.includes(m)) {
          unique++;
          allmedias.push(m);
        }
      }
    } catch (e) {
      // console.log(e);
    }
    // var msize = sumSize(net, murls);
    // var ssize = sumSize(net, surls);
    // console.log(p, murls.length, surls.length);
  }
  console.log(total, unique);
};

traversePages();
