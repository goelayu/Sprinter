/**
 * This script creates a DAG of the network requests,
 * based on the dependency relationship between diff requests
 */

const netParser = require("./network.js");
const URL = require("url");

var shortenURL = function (url, type) {
  var parsed = URL.parse(url);
  if (!parsed.hostname || !parsed.pathname) return url;
  return url;

  // get last 20chars of path
  // not that path contains query params as well, but pathname does not
  var path = parsed.path.substring(parsed.path.length - 20);
  return `${parsed.hostname}-${type}-${path}`;
};

class Node {
  constructor(netObj, id) {
    this.id = id;
    this.name = netObj.url;
    // this.symbolSize = netObj.size/(1000*10);
    this._netObj = netObj;
  }
}

class Graph {
  constructor(netObj) {
    this.nodes = [];
    this.edges = [];
    this.transitiveEdges = {};

    this._createDependencyGraphv2(netObj);
  }

  _createDependencyGraphv2(netObj) {
    var redirectMap = {};
    for (var n of netObj) {
      if (ignoreUrl(n)) continue;
      if (n.redirects.length) redirectMap[n.url] = n.response.url;
      switch (n.initiator.type) {
        case "parser":
          var _url = redirectMap[n.initiator.url] || n.initiator.url;
          var edge = { source: _url, target: n.url };
          this.addEdge(edge);
          break;
        case "script":
          // get the last script in the stack
          var __url = n.initiator.stack
            ? n.initiator.stack.callFrames[
                n.initiator.stack.callFrames.length - 1
              ].url
            : n.initiator.url;
          var _url = redirectMap[__url] || __url;
          var edge = { source: _url, target: n.url };
          this.addEdge(edge);
          break;
      }
    }
  }

  // private createDependencyGraph helper function
  // _createDependencyGraph(netObj) {
  //   var urlToNode = new Map(),
  //     id = 0;
  //   var documentURL = netObj[0].redirects.length
  //     ? netObj[0].response.url
  //     : netObj[0].url;
  //   for (var n of netObj) {
  //     if (ignoreUrl(n)) continue;
  //     if (
  //       n.initiator.url == documentURL &&
  //       n.type.toLowerCase().indexOf("script") == -1
  //     )
  //       continue;

  //     // get the first redirect URL if redirected, note the redirected URL is in the final response
  //     // n.redirects.url only contains the original URL that was eventually redirected
  //     var _url = n.redirects.length ? n.response.url : n.url,
  //       origUrl = _url;
  //     n.url = shortenURL(_url, n.type);
  //     var node = new Node(n, id++);
  //     this.addNode(node);
  //     urlToNode.set(origUrl, node);

  //     switch (n.initiator.type) {
  //       case "parser":
  //         var initiatorNode = urlToNode.get(n.initiator.url);
  //         if (!initiatorNode) break;
  //         var shortInitUrl = shortenURL(
  //           n.initiator.url,
  //           initiatorNode._netObj.type
  //         );
  //         var edge = { source: shortInitUrl, target: n.url };
  //         this.addEdge(edge);
  //         break;
  //       case "script":
  //         // get the last script in the stack
  //         var _url = n.initiator.stack
  //           ? n.initiator.stack.callFrames[
  //               n.initiator.stack.callFrames.length - 1
  //             ].url
  //           : n.initiator.url;
  //         var initiatorNode = urlToNode.get(_url);
  //         if (!initiatorNode) break;
  //         var shortInitUrl = shortenURL(_url, initiatorNode._netObj.type);
  //         var edge = { source: shortInitUrl, target: n.url };
  //         this.addEdge(edge);
  //         break;
  //     }
  //   }
  // }

  // node is a Node object
  addNode(node) {
    this.nodes.push(node);
  }

  // edge is an array of two Node objects and edge type
  addEdge(edge) {
    this.edges.push(edge);
  }

  createTransitiveEdges() {
    var transitiveEdges = this.transitiveEdges;

    function addEdge(source, target) {
      if (!transitiveEdges[source]) transitiveEdges[source] = [];
      if (transitiveEdges[source].indexOf(target) == -1)
        transitiveEdges[source].push(target);

      // for (var s in transitiveEdges) {
      //   if (s == source) continue;
      //   if (transitiveEdges[s].indexOf(source) > -1) {
      //     transitiveEdges[s].push(target);
      //   }
      // }
    }

    for (var e of this.edges) {
      addEdge(e.source, e.target);
    }
  }

  // convert graph to json format
  toJSON() {
    return {
      Nodes: this.nodes,
      Links: this.edges,
    };
  }
}

var ignoreUrl = function (n) {
  var type = n.type;
  return (
    !n.request ||
    n.request.method != "GET" ||
    n.url.indexOf("data") == 0 ||
    !n.type ||
    !n.size ||
    n.response.status != 200
  );
};

var sanityCheckGraph = function (graph) {
  var nodes = graph.nodes;
  var edges = graph.edges;
  var nodeMap = new Map();
  // console.log(nodes.length, [...new Set(nodes.map(n=>n.name))].length);
  for (var n of nodes) {
    nodeMap.set(n.name, n);
  }
  for (var e of edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) {
      console.log("Edge not in nodes", e);
    }
  }
};

// remove nodes with no edges
var cleanGraph = function (graph) {
  var nodes = graph.nodes;
  var edges = graph.edges;

  var connectedNodes = new Set();
  for (var e of edges) {
    connectedNodes.add(e.source);
    connectedNodes.add(e.target);
  }

  graph.nodes = nodes.filter((n) => connectedNodes.has(n.name));
};

module.exports = {
  Graph: Graph,
};
