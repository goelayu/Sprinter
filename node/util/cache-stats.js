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
var promisify = require("util").promisify;

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

var traversePages = function () {
  var hits = (misses = errors = firsts = 0);
  var pages = fs.readFileSync(program.pages, "utf-8").split("\n");
  for (var p of pages) {
    if (p.length == 0) continue;
    try {
      var p = `${program.basedir}/${p}/cache.json`;
      var cs = JSON.parse(fs.readFileSync(p, "utf-8"));
      if (cs.error) {
        console.log("ERROR", p, cs.error);
        continue;
      }
      hits += cs.hits;
      misses += cs.misses;
      errors += cs.errors;
      firsts += cs.firsts;
      var total = cs.hits + cs.misses + cs.errors + cs.firsts;
      if (total == cs.hits) console.log("PERFECT", p, cs.hits);
      else
        console.log(
          "NOT PERFECT",
          p,
          total,
          cs.hits,
          cs.misses,
          cs.errors,
          cs.firsts
        );
    } catch (e) {
      // console.log(e);
    }
  }
  console.log("HITS", hits);
  console.log("MISSES", misses);
  console.log("ERRORS", errors);
  console.log("FIRSTS", firsts);
};

traversePages();
