/**
 * @fileoverview Similar to the resource-matcher.js script, this script
 * identifies what fraction of resource bytes overlap across different pages of the same site.
 *
 *
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("./lib/network.js");

program.version("0.0.1").option("-p, --paths [paths]").parse(process.argv);

if (!program.paths) {
  console.log("Please specify a path to the site");
  process.exit(1);
}

var matchURLs = function (source, destination, type) {
  if (type == 0) return source == destination;
  else if (type == 1) return source.split("?")[0] == destination.split("?")[0];
};

var ignoreUrl = function (n) {
  var type = n.type;
  return (
    n.request.method != "GET" ||
    n.url.indexOf("data") == 0 ||
    !n.type ||
    !n.size ||
    n.response.status != 200
  );
};

var computeOverlap = function () {
  // let's extract network bytes for each path
  var pathNets = {};
  fs.readFileSync(program.paths, "utf8")
    .split("\n")
    .filter((f) => f)
    .forEach(function (path) {
      var pathLog = netParser.parseNetworkLogs(
        JSON.parse(fs.readFileSync(path, "utf8"))
      );
      var validN = [];
      for (var n of pathLog) {
        if (!ignoreUrl(n)) {
          validN.push(n);
        }
      }
      pathNets[path] = validN;
    });

  // now let's compute intersection and total bytes
  var intBytes = (totalBytes = 0),
    allnets = [];
  Object.values(pathNets).forEach(function (net) {
    for (var n of net) {
      if (allnets.some((n) => matchURLs(n.url, net[0].url, 1))) {
        intBytes += net[0].size;
      }
      totalBytes += net[0].size;
    }
    allnets = allnets.concat(net);
  });

  console.log(
    `${intBytes/(1000)} ${totalBytes/1000} ${
      intBytes / totalBytes
    }`
  );
};

computeOverlap();
