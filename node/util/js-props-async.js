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

program
  .option("-b, --basedir <dir>", "dir containing network.json files")
  .option("-p, --pages <pages>", " file containing list of pages")
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
    n.type &&
    n.size &&
    n.size > 100 &&
    n.response.status == 200
  );
};

var traversePages = async function () {
  var store = {
    n: { total: 0, unique: 0 },
    size: { total: 0, unique: 0 },
    urls: {},
  };
  var pages = fs.readFileSync(program.pages, "utf-8").split("\n");
  await Promise.all(
    pages.map(async (p) => {
      if (p.length == 0) return;
      try {
        var netpath = `${program.basedir}/${p}/network.json`;
        var _net = await fsp.readFile(netpath, "utf-8");
        var net = netParser.parseNetworkLogs(JSON.parse(_net));
        var js = net
          .filter(filternet)
          .filter((n) => n.type.indexOf("script") != -1);
        for (var j of js) {
          store.n.total++;
          store.size.total += j.size;
          if (!store.urls[j.url]) {
            store.urls[j.url] = true;
            store.n.unique++;
            store.size.unique += j.size;
          }
        }
      } catch (e) {
        console.log(e);
      }
    })
  );
  // print n and size
  // print n and size
  console.log("n", store.n.total, store.n.unique);
  console.log("size", store.size.total, store.size.unique);
};

traversePages();
