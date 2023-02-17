/**
 *
 * a common script file which invokes
 * various different ./lib scripts or inbuilt
 * scripts for debugging purposes
 */

var fs = require("fs");
var program = require("commander");
var netParser = require("../lib/network.js");
var dag = require("../lib/nw-dag.js");

program
  .option("-i, --input <file>", "Input file")
  .option("-t, --type <type>", "Type of utility function to run")
  .parse(process.argv);

if (!program.input) {
  console.log("Please specify an input file");
  process.exit(1);
}

if (!program.type) {
  console.log("Please specify a type of utility function to run");
  process.exit(1);
}

var getedges = function () {
  var data = fs.readFileSync(program.input, "utf-8");
  var net = netParser.parseNetworkLogs(JSON.parse(data));
  var graph = new dag.Graph(net);

  graph.createTransitiveEdges();

  var fetches = graph.transitiveEdges;
  console.log(fetches);
};

switch (program.type) {
  case "dag":
    getedges();
    break;
  default:
    console.log("Invalid type of utility function to run");
    process.exit(1);
}
