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
  else if (type == 1) return source.split("?")[0] == destination.split("?")[0]
};

var ignoreUrl = function (n) {
  var type = n.type;
  return (
    n.request.method != "GET" ||
    n.url.indexOf("data") == 0 ||
    n.type.indexOf('script') < 0 ||
    !n.size ||
    n.response.status != 200
  );
};

var dynamicResources = function (netobj) {
  // extracts all resources fetched via javascript and 
  // its children

  var dynResources = [], dynUrls = [];
  for (var n of netobj) {
    if (ignoreUrl(n)) continue;

    var init = n.initiator;
    if (init.type == "script") {
      dynResources.push(n);
      var reqUrl = n.redirects.length > 0 ? n.redirects[0].url : n.url;
      dynUrls.push(reqUrl);
    } else if (init.type == "parser") {
      if (dynUrls.indexOf(n.initiator.url) >= 0) {
        dynResources.push(n); 
        var reqUrl = n.redirects.length > 0 ? n.redirects[0].url : n.url;
        dynUrls.push(reqUrl);
      }
    }

  }
  
  return dynResources;
};

var occursOnlyOnce = function (arr) {
  arr = arr.map((a) => a.url.split("?")[0]);
  var counts = {};
  for (var i = 0; i < arr.length; i++) {
    var num = arr[i];
    counts[num] = counts[num] ? counts[num] + 1 : 1;
  }
  return Object.keys(counts).filter((k) => counts[k] == 1);
}

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
      pathNets[path] = dynamicResources(pathLog);
    });

  // now let's compute intersection and total bytes
  var intBytes = (totalBytes = 0),
    unionnets = [], uniqUrls = [], allnets = [];
  Object.values(pathNets).forEach(function (net) {
    for (var n of net) {
      if (unionnets.some((a) => matchURLs(a.url, n.url, 1) && a.size == n.size )) {
        console.log("duplicate", n.url);
        intBytes += n.size;
      } else {
        unionnets.push(n);
      }
      totalBytes += n.size;
    }
    allnets = allnets.concat(net);
  });
  console.log(intBytes / totalBytes, intBytes, totalBytes);
  allnetsUrls = allnets.map((n) => n.url);
  console.log(occursOnlyOnce(allnets), allnets.length);
  // console.log(
  //   `${intBytes/(1000)} ${totalBytes/1000} ${
  //     intBytes / totalBytes
  //   }`
  // );
};

computeOverlap();
