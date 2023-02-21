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
  .option("-s, --second <file>", "Second input file")
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

var _getGraph = function (input) {
  var data = fs.readFileSync(input, "utf-8");
  var net = netParser.parseNetworkLogs(JSON.parse(data));
  var graph = new dag.Graph(net);
  graph.createTransitiveEdges();
  return graph;
};

var getedges = function () {
  var graph = _getGraph(program.input);
  var fetches = graph.transitiveEdges;
  console.log(JSON.stringify(fetches));
};

var compareEdges = function () {
  var g1 = _getGraph(program.input);
  var g2 = _getGraph(program.second);

  var _fetches1 = g1.transitiveEdges;
  var _fetches2 = g2.transitiveEdges;

  var fetches1 = [],
    fetches2 = [];
  Object.entries(_fetches1).forEach(([k, v]) => {
    fetches1.push(k);
    fetches1.push(...v);
  });
  Object.entries(_fetches2).forEach(([k, v]) => {
    fetches2.push(k);
    fetches2.push(...v);
  });
  console.log(fetches1.length, fetches2.length);
  // find missing fetches
  var missing = fetches2.filter((x) => !fetches1.includes(x));
  console.log(JSON.stringify(missing));
};

switch (program.type) {
  case "dag":
    getedges();
    break;
  case "compare":
    compareEdges();
    break;
  default:
    console.log("Invalid type of utility function to run");
    process.exit(1);
}
