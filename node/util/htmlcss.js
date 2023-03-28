const fs = require("fs");
const program = require("commander");
const htmlparser = require("node-html-parser");
const css = require("css");

program
  .option("-b, --base <base>", "payload file")
  .option("-p, --pages <pages>", " file containing list of pages")
  .option("--payload <payload>", "payload file")
  .parse(process.argv);

// var payload = JSON.parse(fs.readFileSync(program.payload, "utf-8"));

var getMediaWithUrls = function (payload, mwithurls) {
  for (var p of payload) {
    if (p.headers["content-type"].includes("css")) {
      var obj = css.parse(p.data);
      // console.log(JSON.stringify(obj, null, 2));
      var rules = obj.stylesheet.rules;
      for (var r of rules) {
        if (r.type != "media") continue;
        var media = r.media;
        var s = JSON.stringify(r);
        var urls = s.match(/url\((.*?)\)/g);
        if (urls) {
          mwithurls[media] = 1;
        }
      }
    }
  }
};

var pages = fs
  .readFileSync(program.pages, "utf-8")
  .split("\n")
  .filter((p) => p.length > 0);

var initm = {};
for (var p of pages.slice(10)) {
  try {
    var payload = JSON.parse(
      fs.readFileSync(`${program.base}/${p}/payload.json`, "utf-8")
    );
    getMediaWithUrls(payload, initm);
  } catch (e) {}
}

var remm = {};
for (var p of pages.slice(10, 50)) {
  try {
    var payload = JSON.parse(
      fs.readFileSync(`${program.base}/${p}/payload.json`, "utf-8")
    );
    getMediaWithUrls(payload, remm);
  } catch (e) {}
}

var t = (n = 0);
for (var m in remm) {
  t++;
  if (initm[m]) n++;
}
console.log(t, n);
