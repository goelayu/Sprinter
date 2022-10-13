/**
 * This script creates a DAG of the network requests,
 * based on the dependency relationship between diff requests
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("../lib/network.js");
const URL = require("url");

program
  .version("0.0.1")
  .option("-i, --input [file]", "Input file")
  .option("-o, --output [file]", "Output file")
  .parse(process.argv);

if (!program.input) {
  console.log("Please specify an input file");
  process.exit(1);
}

var shortenURL = function (url, type) {
  var parsed = URL.parse(url);
  if (!parsed.hostname || !parsed.pathname) return url;

  // get last 20chars of path 
  // not that path contains query params as well, but pathname does not
  var path = parsed.path.substring(parsed.path.length - 20);
  return `${parsed.hostname}-${type}-${path}`;
}


class Node {

  constructor(netObj, id) {
    this.id = id;
    this.name = netObj.url;
    // this.symbolSize = netObj.size/(1000*10);
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
      Nodes: this.nodes,
      Links: this.edges
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
    var _url = n.redirects.length ? n.redirects[0].url : n.url,
      origUrl = _url;
    n.url = shortenURL(_url, n.type);
    var node = new Node(n, id++);
    graph.addNode(node);
    urlToNode.set(origUrl, node);
    switch (n.initiator.type) {
      case "parser":
        var initiatorNode = urlToNode.get(n.initiator.url);
        var shortInitUrl = shortenURL(n.initiator.url, initiatorNode._netObj.type);
        var edge = {source:shortInitUrl, target:n.url};
        graph.addEdge(edge);
        break;
      case "script":
        // get the last script in the stack
        var _url =
          n.initiator.stack.callFrames[n.initiator.stack.callFrames.length - 1]
            .url;
        var initiatorNode = urlToNode.get(_url);
        var shortInitUrl = shortenURL(_url, initiatorNode._netObj.type);
        var edge = {source:shortInitUrl, target:n.url};
        graph.addEdge(edge);
        break;
    }
  }

  return graph;
}

var sanityCheckGraph = function(graph){
  var nodes = graph.nodes;
  var edges = graph.edges;
  var nodeMap = new Map();
  console.log(nodes.length, [...new Set(nodes.map(n=>n.name))].length);
  for (var n of nodes){
    console.log(n.name);
    nodeMap.set(n.name, n);
  }
  for (var e of edges){
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)){
      console.log("Edge not in nodes", e);
    }
  }
}

function dumpGraph(){
  var graph = createDepGraph();
  sanityCheckGraph(graph);
  var json = graph.toJSON();
  // do not stringify the _netObj field
  fs.writeFileSync(program.output, JSON.stringify(json, function (key, value){
    if (key == "_netObj") return undefined;
    return value;
  }), "utf8");
}

dumpGraph();
