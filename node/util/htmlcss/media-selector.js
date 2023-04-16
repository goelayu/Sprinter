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
  var urls = [];
  var root = htmlparser.parse(html);
  var elems = root.querySelectorAll("*");
  for (var e of elems) {
    if (!e.attributes) continue;
    // if (!e.attributes.media) continue;
    // var media = e.attributes.media;
    // console.log(media);
    var srcset = e.attributes.srcset;
    if (srcset) {
      var u = srcset.split(",").map((u) => u.trim().split(" ")[0]);
      urls = urls.concat(u);
      continue;
    }
    // var src = e.attributes.src;
    // if (src) {
    //   urls.push(src);
    //   continue;
    // }
  }
  return urls;
};

var parseCSS = function (cstring) {
  if (!css) return { murls: [], surls: [] };
  var murls = [],
    surls = [];
  var obj = css.parse(cstring);
  var rules = obj.stylesheet.rules;
  for (var r of rules) {
    var s = JSON.stringify(r);
    var re = /url\(["']([^\s\)]*)["']\)/g;
    var urls = s.matchAll(re);
    for (var u of urls) {
      if (r.type == "media") {
        murls.push(u[1]);
      } else {
        surls.push(u[1]);
      }
    }
  }
  return { murls, surls };
};

var traversePages = function () {
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
      var net = getNet(`${program.base}/${p}/network.json`);
      var html = payload.filter(
        (p) =>
          p.headers["content-type"] &&
          p.headers["content-type"].includes("html")
      )[0].data;
      var urls = parseHTML(html);
      murls = murls.concat(urls);
      var cssfiles = payload.filter(
        (p) =>
          p.headers["content-type"] && p.headers["content-type"].includes("css")
      );
      for (var c of cssfiles) {
        var { murls: mu, surls: su } = parseCSS(c.data);
        murls = murls.concat(mu);
        surls = surls.concat(su);
      }
    } catch (e) {
      // console.log(e);
    }
    var msize = sumSize(net, murls);
    var ssize = sumSize(net, surls);
    console.log(p, murls.length, msize, surls.length, ssize);
  }
};

traversePages();
