/**
 * Compares the fetches of JS files, and reports what fraction of
 * files fetched the same files across pages.
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");
const dag = require("../lib/nw-dag.js");
const traceParser = require("../lib/trace-parser.js");

program
  .option("-b, --base <dir>", "dir containing network.json files")
  .option("-p, --pages <pages>", " file containing list of pages")
  .option("-v, --verbose", "verbose")
  .parse(process.argv);

var getNet = function (path) {
  var data = fs.readFileSync(path, "utf-8");
  var net = netParser.parseNetworkLogs(JSON.parse(data));
  net = net.filter(filternet);
  return net;
};

/**
 *
 * @param {array[array]} prevFetches
 * @param {array} curFetches
 * @param {int} type 0 - exact match, 1 - remove query params
 */
var sameFileFetches = function (prevFetches, curFetches, type) {
  if (type == 1) {
    curFetches = curFetches.map((f) => f.split("?")[0]);
    var _prevFetches = [];
    for (var f of prevFetches) {
      _prevFetches.push(f.map((f) => f.split("?")[0]));
    }
    prevFetches = _prevFetches;
  }
  for (var f of prevFetches) {
    if (f.length != curFetches.length) continue;
    if (JSON.stringify(f.sort()) == JSON.stringify(curFetches.sort()))
      return true;
  }
  return false;
};

var filternet = function (n) {
  return (
    n.request &&
    n.request.method == "GET" &&
    n.url.indexOf("data") != 0 &&
    // !DYNDOMAINS.some((d) => n.url.includes(d)) &&
    n.type &&
    n.size &&
    n.size > 100 &&
    n.response.status == 200
  );
};

var addTimings = function (t) {
  return Object.values(t).reduce((a, b) => a + b, 0);
};

var traversePages = function () {
  var pages = fs
    .readFileSync(program.pages, "utf-8")
    .split("\n")
    .filter((p) => p.length > 0);
  var summary = {
      all: {
        totalScripts: 0,
        uniqueScripts: 0,
      },
      fetches: {
        scriptsThatFetch: 0,
        uniqueScriptsThatFetch: 0,
        fetchesSame: 0,
        fetchesDiff: 0,
      },
      pages: {
        tPages: 0,
        newPages: 0,
        missPages: 0,
      },
    },
    fileMem = {},
    repeatFetch = {},
    multiplefetches = {};
  for (var p of pages) {
    try {
      program.verbose && console.log(`--------${p}--------`);
      var net = JSON.parse(
        fs.readFileSync(`${program.base}/${p}/network.json`, "utf8")
      );
      // var trace = JSON.parse(
      //   fs.readFileSync(`${program.base}/${p}/trace.json`, "utf8")
      // );
      var netObj = netParser.parseNetworkLogs(net);
      // var execTimings = traceParser.getExecutionTimingsByURL(trace, net);
      var graph = new dag.Graph(netObj);
      var missOnPage = false;
      graph.createTransitiveEdges();
      var fetches = graph.transitiveEdges;
      summary.pages.tPages++;
      var jss = netObj.filter((n) => n.type && n.type.indexOf("script") != -1);
      for (var n of jss) {
        summary.all.totalScripts++;
        var key = n.url.split("?")[0];
        var fCurr = fetches[n.url];
        fCurr && fCurr.length && summary.fetches.scriptsThatFetch++;
        var unseenFile = false;
        // var timings = execTimings.get(n.url);

        if (fileMem[key]) {
          var fPrev = fileMem[key]["fetches"];
          var execFound = null;
          if (fCurr && fCurr.length && fPrev && fPrev.length) {
            execFound = sameFileFetches(fPrev, fCurr, 1);
            var sameasfirst = sameFileFetches([fPrev[0]], fCurr, 1);
            if (sameasfirst) repeatFetch[key].s++;
            repeatFetch[key].t++;
            if (execFound) {
              multiplefetches[fCurr] = 1;
              summary.fetches.fetchesSame++;
              program.verbose &&
                console.log(
                  `Fetches for ${n.url} are same as before: ${JSON.stringify(
                    fCurr.sort()
                  )}`
                );
            } else {
              fileMem[key]["fetches"].push(fCurr);
              summary.fetches.fetchesDiff++;
              program.verbose &&
                console.log(
                  `Fetches for ${n.url} are different: ${JSON.stringify(
                    fCurr.sort()
                  )}`
                );
              missOnPage = true;
            }

            // timings && (fileMem[key]["timings"] += addTimings(timings));
          } else if (fCurr && fCurr.length) {
            fileMem[key]["fetches"].push(fCurr);
            repeatFetch[key] = { f: fCurr, t: 0, s: 0 };
            summary.fetches.fetchesDiff++;
            program.verbose &&
              console.log(
                `first time fetches for ${n.url}: ${JSON.stringify(
                  fCurr.sort()
                )}`
              );
            summary.fetches.uniqueScriptsThatFetch++;
          }
        } else {
          summary.all.uniqueScripts++;
          unseenFile = true;
          fileMem[key] = {};
          // fileMem[key]["timings"] = timings ? addTimings(timings) : 0;
          var f = (fileMem[key]["fetches"] = []),
            _f = fetches[n.url];
          _f && _f.length && f.push(_f);
          _f &&
            _f.length &&
            ++summary.fetches.uniqueScriptsThatFetch &&
            program.verbose &&
            console.log(
              `first time fetches for ${n.url}: ${JSON.stringify(_f.sort())}`
            );
          _f && _f.length && (repeatFetch[key] = { f: _f, t: 0, s: 0 });
        }
      }
      if (missOnPage) summary.pages.missPages++;
      if (unseenFile) summary.pages.newPages++;
      // console.log(`per page fetch: ${localfetched} ${localtotal}`);
    } catch (e) {
      program.verbose && console.log(e);
    }
  }
  // for (var f in fileMem) {
  //   console.log(`${f},${fileMem[f]["timings"]}`);
  // }
  // summarize repeat fetches
  var uniqfetches = 0;
  for (var key in fileMem) {
    var f = fileMem[key]["fetches"];
    if (f.length >= 1) uniqfetches += f.length;
  }
  console.log(
    `unique ${uniqfetches} multiple ${Object.keys(multiplefetches).length}`
  );
  // for (var f in repeatFetch) {
  //   var r = repeatFetch[f];
  //   if (r.t > 1) {
  //     console.log(`sameasfirst: ${f} ${r.t} ${r.s}`);
  //   }
  // }
  console.log(JSON.stringify(summary, null, 2));
};

traversePages();
