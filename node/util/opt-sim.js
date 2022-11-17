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

program
  .version("0.0.1")
  .option(
    "-i, --input [dir]",
    "Input directory containing all the relevant JSONs"
  )
  .option("-o, --output [file]", "Output file")
  .option("-v, --verbose", "Verbose output")
  .parse(process.argv);

if (!program.input) {
  console.log("Please specify an input file");
  process.exit(1);
}

var shortenURL = function(url) {
  var p = URL.parse(url);
  return url;
  return p.hostname + p.pathname;
};

(function () {
  var fileMem = {},
    totalScriptTime = (savedScriptTime = 0),
    fetchesSame = (fetchesTotal = 0), totalScripts = 0, scriptsThatFetch = 0,
    tPages = newPages = 0;
  fs.readFileSync(program.input, "utf8")
    .split("\n")
    .forEach(function (line) {
      if (!line) return;
      var localSaved = (localTotal = 0);
      try {
        program.verbose && console.log(`--------${line}--------`);
        var trace = JSON.parse(fs.readFileSync(`${line}/trace.json`, "utf8"));
        var net = JSON.parse(fs.readFileSync(`${line}/network.json`, "utf8"));
        var payload = JSON.parse(fs.readFileSync(`${line}/payload.json`, "utf8"));
        var netObj = netParser.parseNetworkLogs(net);
        var graph = new dag.Graph(netObj);
        graph.createTransitiveEdges()
        var fetches = graph.transitiveEdges;
        var execTimings = traceParser.getExecutionTimingsByURL(trace, net);
        tPages++;
        for (var n of netObj) {
          if (!n.type || n.type.indexOf("script") == -1 || !n.size) continue;
          var timings = execTimings.get(n.url);
          if (!timings) continue;
          var payloadObj = payload.filter(p => p.url == n.url)[0];
          var hash;
          if (!payloadObj) hash = n.size;
          else hash = crypto.createHash("md5").update(payloadObj.data).digest("hex");
          var key = n.url + hash
          var eval = timings.scriptEvaluation;

          fetches[n.url] && fetches[n.url].length && scriptsThatFetch++;
          var unseenFile = false;
          if (fileMem[key]) {
            // var t = fileMem[key]["scriptEvaluation"];
            eval && (savedScriptTime += eval) && (localSaved += eval);
            eval && (totalScriptTime += eval) && (localTotal += eval);

            var fPrev = fileMem[key]["fetches"];
            var fCurr = fetches[n.url];
            if (fCurr){
              var c = fCurr.sort().join(","), execFound = false;
              for (var f of fPrev) {
                if (c == f.sort().join(",")) {
                  fetchesSame++;
                  execFound = true;
                  program.verbose && console.log(`Fetches for ${n.url} are same as before: ${JSON.stringify(f.sort().map(shortenURL))}`);
                  break;
                }
              }
              if (!execFound) {
                fetchesTotal++;
                fileMem[key]["fetches"].push(fCurr);
                program.verbose && console.log(`Fetches for ${n.url} are different: ${JSON.stringify(fCurr.sort().map(shortenURL))}`);
              }
            }
          } else {
            unseenFile = true;
            if (eval) {
              fileMem[key] = { scriptEvaluation: eval };
              totalScriptTime += eval;
              localTotal += eval;
            } else fileMem[key] = { scriptEvaluation: 0 };

            var f = (fileMem[key]["fetches"] = []),
              _f = fetches[n.url];
            _f && _f.length && f.push(_f);
            _f && _f.length && program.verbose && console.log(`first time fetches for ${n.url}: ${JSON.stringify(_f.sort().map(shortenURL))}`);
          }
          totalScripts++;
        }
        if (unseenFile) newPages++;
      } catch (e) {
        console.log(e);
      }
      // console.log(localSaved, localTotal);
    });
  console.log(totalScriptTime, savedScriptTime);
  console.log(fetchesSame, fetchesTotal, scriptsThatFetch, Object.keys(fileMem).length, totalScripts);
  console.log(tPages, newPages);
})();
