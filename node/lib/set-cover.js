/**
 * @fileoverview A library for nodejs that implements a greedy
 * algorithm for the set-cover problem.
 * Input: A set of arrays, where each array is a list of JS urls
 * Return: array identifiers that cover the set of arrays
 */

var unionJS = function (nets) {
  var js = [];
  for (var n of nets) {
    js = js.concat(
      n
        .filter((n) => n.type.indexOf("script") != -1)
        .map((n) => n.url.split("?")[0])
    );
  }
  return [...new Set(js)];
};

var setCover = function (nets) {
  var pages = [];
  var js = [];
  var nettoUrl = {};

  var union = unionJS(nets);

  class JSNet {
    constructor(net) {
      this.jss = net
        .filter((n) => n.type.indexOf("script") != -1)
        .map((n) => n.url.split("?")[0]);
      this.url = net.length > 0 ? net[0].documentURL : "";
    }
  }

  nets = nets.map((n) => new JSNet(n));

  var largestUncovered = function (nets, union) {
    var largest = nets[0],
      largestLen = 0,
      largestUrl = "";
    for (var net of nets) {
      var uncovered = net.jss.filter((n) => union.includes(n));
      if (uncovered.length > largestLen) {
        largest = uncovered;
        largestLen = uncovered.length;
        largestUrl = net.url;
      }
    }
    return [largestUrl, largest];
  };

  var iter = 0;
  var unioncp = union.slice();
  while (js.length < unioncp.length) {
    var [lUrl, net] = largestUncovered(nets, union);
    for (var n of net) {
      if (js.indexOf(n) == -1) js.push(n);
    }
    pages.push(lUrl);
    union = union.filter((n) => !net.includes(n));
    // remove net from nets
    var netindex = nets.indexOf(net);
    netindex != -1 && nets.splice(netindex, 1);
  }
  return pages;
};

module.exports = {
  setCover,
};
