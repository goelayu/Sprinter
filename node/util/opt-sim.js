/**
 * Optimization simulator -- iterates through the list of pages
 * on a site, and for every resource on a given page, that was unchanged,
 * since the last time it was loaded, it would measure how much
 * compute savings you would get.
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");
const traceParser = require("../lib/trace-parser.js");
const dag = require("../lib/nw-dag.js");
const URL = require("url");
const crypto = require("crypto");
const filenamify = require("filenamify");

program
  .version("0.0.1")
  .option(
    "-i, --input [dir]",
    "Input directory containing all the relevant JSONs"
  )
  .option("-o, --output [file]", "summary file")
  .option("-v, --verbose", "Verbose output")
  .parse(process.argv);

if (!program.input) {
  console.log("Please specify an input file");
  process.exit(1);
}

var shortenURL = function (url) {
  var p = URL.parse(url);
  return url;
  return p.hostname + p.pathname;
};

var compareFileState = function (prevSigs, curSig) {
  var cleanSig = function (sig) {
    return [...new Set(sig.filter((e) => e.indexOf("read") >= 0).sort())];
  };

  var _compareFileState = function (sigOne, sigTwo, exact) {
    if (exact) return JSON.stringify(sigOne) == JSON.stringify(sigTwo);

    for (var s of sigOne) {
      if (sigTwo.indexOf(s) < 0) {
        console.log(`${s} from one not found in two`);
        return false;
      }
    }
    for (var s of sigTwo) {
      if (sigOne.indexOf(s) < 0) {
        console.log(`${s} from two not found in one`);
        return false;
      }
    }
    return true;
  };

  var prevSigs = prevSigs.map(cleanSig);
  var curSig = cleanSig(curSig);

  for (var p of prevSigs) {
    if (p.length != curSig.length) continue;
    if (_compareFileState(p, curSig, false)) return true;
  }
  return false;
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

(function () {
  var fileMem = {},
    totalScriptTime = (savedScriptTime = 0),
    fetchesSame = (fetchesTotal = 0),
    totalScripts = 0,
    scriptsThatFetch = 0,
    tPages = (newPages = 0),
    eval,
    summary = {
      all: {
        totalScripts: 0,
        uniqueScripts: 0,
      },
      fetches: {
        scriptsThatFetch: 0,
        uniqueScriptsThatFetch: 0,
        fetchesSame: 0,
      },
      savings: {
        totalScriptTime: 0,
        savedTimeSource: 0,
        savedTimeSig: 0,
      },
      pages: {
        tPages: 0,
        newPages: 0,
      },
    };
  fs.readFileSync(program.input, "utf8")
    .split("\n")
    .forEach(function (line) {
      if (!line) return;
      var localSaved = (localTotal = 0);
      try {
        program.verbose && console.log(`--------${line}--------`);
        var trace = JSON.parse(fs.readFileSync(`${line}/trace.json`, "utf8"));
        var net = JSON.parse(fs.readFileSync(`${line}/network.json`, "utf8"));
        var payload = JSON.parse(
          fs.readFileSync(`${line}/payload.json`, "utf8")
        );
        var fileSig = JSON.parse(fs.readFileSync(`${line}/state.json`, "utf8"));
        var netObj = netParser.parseNetworkLogs(net);
        var graph = new dag.Graph(netObj);
        graph.createTransitiveEdges();
        var fetches = graph.transitiveEdges;
        var execTimings = traceParser.getExecutionTimingsByURL(trace, net);
        summary.pages.tPages++;
        for (var n of netObj) {
          if (!n.type || n.type.indexOf("script") == -1 || !n.size) continue;
          var timings = execTimings.get(n.url);
          if (!timings) continue;
          summary.all.totalScripts++;
          var payloadObj = payload.filter((p) => p.url == n.url)[0];
          var hash;
          if (!payloadObj) hash = n.size;
          else
            hash = crypto
              .createHash("md5")
              .update(payloadObj.data)
              .digest("hex");
          var key = n.url + hash;
          var eval = timings.scriptEvaluation;
          eval && (summary.savings.totalScriptTime += eval);
          var filesigName = filenamify(URL.parse(n.url).pathname);
          var curSig = fileSig[filesigName];

          fetches[n.url] &&
            fetches[n.url].length &&
            summary.fetches.scriptsThatFetch++;
          var unseenFile = false;
          if (fileMem[key]) {
            var t = fileMem[key]["scriptEvaluation"];
            eval &&
              (summary.savings.savedTimeSource += eval) &&
              (localSaved += eval);

            var fPrev = fileMem[key]["fetches"];
            var fCurr = fetches[n.url];
            if (fCurr && fCurr.length) {
              summary.fetches.uniqueScriptsThatFetch++;
              var execFound = sameFileFetches(fPrev, fCurr, 1);
              if (execFound) {
                summary.fetches.fetchesSame++;
                program.verbose &&
                  console.log(
                    `Fetches for ${n.url} are same as before: ${JSON.stringify(
                      fCurr.sort().map(shortenURL)
                    )}`
                  );
              } else {
                fileMem[key]["fetches"].push(fCurr);
                program.verbose &&
                  console.log(
                    `Fetches for ${n.url} are different: ${JSON.stringify(
                      fCurr.sort().map(shortenURL)
                    )}`
                  );
              }
            }

            if (curSig) {
              var prevSigs = fileMem[key]["fileSig"];
              if (prevSigs) {
                if (compareFileState(prevSigs, curSig)) {
                  eval && (summary.savings.savedTimeSig += eval);
                  program.verbose &&
                    console.log(`File state for ${n.url} is same as before`);
                  fCurr &&
                    !execFound &&
                    fileMem[key]["fetches"].length != 1 &&
                    console.log(
                      `same signature for ${n.url} but fetches are different`
                    );
                  fCurr &&
                    execFound &&
                    console.log(
                      `same signature for ${n.url} and fetches are same`
                    );
                } else {
                  program.verbose &&
                    console.log(`File state for ${n.url} is different`);
                  fileMem[key]["fileSig"].push(curSig);
                  execFound &&
                    console.log(
                      `new signature for ${n.url} but fetches are same`
                    );
                }
              } else {
                program.verbose &&
                  console.log(`File state for ${n.url} is different`);
                fileMem[key]["fileSig"] = [curSig];
              }
            }
          } else {
            summary.all.uniqueScripts++;
            unseenFile = true;
            fileMem[key] = {};

            curSig && (fileMem[key]["fileSig"] = [curSig]);

            var f = (fileMem[key]["fetches"] = []),
              _f = fetches[n.url];
            _f && _f.length && f.push(_f);
            _f &&
              _f.length &&
              program.verbose &&
              console.log(
                `first time fetches for ${n.url}: ${JSON.stringify(
                  _f.sort().map(shortenURL)
                )}`
              );
          }
        }
        if (unseenFile) summary.pages.newPages++;
      } catch (e) {
        program.verbose && console.log(e);
      }
    });
  fs.writeFileSync(
    `${program.output}/summary.json`,
    JSON.stringify(summary, null, 2)
  );
})();
