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

(function () {
  var fileMem = {},
    totalScriptTime = (savedScriptTime = 0);
  fs.readFileSync(program.input, "utf8")
    .split("\n")
    .forEach(function (line) {
      if (!line) return;
      try {
        var trace = JSON.parse(fs.readFileSync(`${line}/trace.json`, "utf8"));
        var net = JSON.parse(fs.readFileSync(`${line}/network.json`, "utf8"));
        var netObj = netParser.parseNetworkLogs(net);
        var execTimings = traceParser.getExecutionTimingsByURL(trace, net);
        for (var n of netObj) {
          if (!n.type || n.type.indexOf("script") == -1 || !n.size) continue;
          var timings = execTimings.get(n.url);
          if (!timings) continue;
          var key = n.url + n.size;
          var eval = timings.scriptEvaluation;
          if (fileMem[key]) {
            // var t = fileMem[key]["scriptEvaluation"];
            eval && (savedScriptTime += eval);
            eval && (totalScriptTime += eval);
          } else {
            if (eval) {
              fileMem[key] = { scriptEvaluation: eval };
              totalScriptTime += eval;
            }
            else fileMem[key] = {scriptEvaluation: 0};
          }
        }
      } catch (e) {
        // console.log(e);
      }
    });
  console.log(totalScriptTime, savedScriptTime);
})();
