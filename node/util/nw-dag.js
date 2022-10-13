/**
 * This script creates a DAG of the network requests,
 * based on the dependency relationship between diff requests
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");

program
  .version("0.0.1")
  .option("-i, --input [file]", "Input file")
  .option("-o, --output [file]", "Output file")
  .parse(process.argv);

if (!program.input) {
  console.log("Please specify an input file");
  process.exit(1);
}

class Node {

  constructor(netObj, id) {
    this.id = id;
    this.url = netObj.url;
    this.size = netObj.size;
    this._netObj = netObj;
  }
}

class Graph {
  constructor() {
    this.nodes = [];
    this.edges = [];
  }

  // node is a Node object
  addNode(node) {
    this.nodes.push(node);
  }

  // edge is an array of two Node objects and edge type
  addEdge(edge) {
    this.edges.push(edge);
  }

  // convert graph to json format
  toJSON() {
    return {
      nodes: this.nodes,
      edges: this.edges
    };
  }
}

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

function createDepGraph() {
  var netObj = netParser.parseNetworkLogs(
    JSON.parse(fs.readFileSync(program.input, "utf8"))
  );

  var graph = new Graph();

  var urlToNode = new Map(), id = 0;
  for (var n of netObj) {
    if (ignoreUrl(n)) continue;

    // get the first redirect URL if redirected
    n.url = n.redirects.length ? n.redirects[0].url : n.url;
    var node = new Node(n, id++);
    graph.addNode(node);
    urlToNode.set(n.url, node);
    switch (n.initiator.type) {
      case "parser":
        var fromNode = urlToNode.get(n.initiator.url);
        if (!fromNode) {
          console.log("Cannot find node for url", n.initiator.url);
        }
        var edge = [fromNode, node, n.initiator.type];
        graph.addEdge(edge);
        break;
      case "script":
        // get the last script in the stack
        var url =
          n.initiator.stack.callFrames[n.initiator.stack.callFrames.length - 1]
            .url;
        var edge = [urlToNode.get(url), node, n.initiator.type];
        graph.addEdge(edge);
        break;
    }
  }

  return graph;
}

function dumpGraph(){
  var graph = createDepGraph();
  var json = graph.toJSON();
  // do not stringify the _netObj field
  fs.writeFileSync(program.output, JSON.stringify(json, function (key, value){
    if (key == "_netObj") return undefined;
    return value;
  }), "utf8");
}

dumpGraph();
