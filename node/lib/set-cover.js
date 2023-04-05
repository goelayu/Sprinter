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

var setCoverStatic = function (nets) {
  var res = [];
  var nPages = [];
  var js = [];
  var nettoUrl = {};
  var origNets = nets.slice();

  class JSNet {
    constructor(net) {
      if (net.length == 0) {
        this.jss = [];
        this.url = "";
        return;
      }
      var mainUrl = net[0].response.url;
      this.jss = net
        .filter((n) => n.type.indexOf("script") != -1)
        .filter((n) => n.initiator.url == mainUrl)
        .map((n) => n.url.split("?")[0]);
      this.url = net.length > 0 ? net[0].documentURL : "";
      this.orignet = net;
    }
  }

  nets = nets.map((n) => new JSNet(n));
  var unionstatic = [];
  for (var net of nets) {
    if (net.jss && net.jss.length == 0) continue;
    unionstatic = unionstatic.concat(net.jss);
  }
  unionstatic = [...new Set(unionstatic)];

  var largestUncovered = function (nets, union) {
    var largest = nets[0],
      largestLen = 0,
      largestUrl = "",
      largestNet = nets[0];
    for (var net of nets) {
      var uncovered = net.jss.filter((n) => union.includes(n));
      if (uncovered.length > largestLen) {
        largest = uncovered;
        largestLen = uncovered.length;
        largestUrl = net.url;
        largestNet = net;
      }
    }
    // program.verbose && console.log(`Picking next: ${largestUrl}`);
    return [largest, largestUrl, largestNet];
  };

  var unioncp = unionstatic.slice();
  while (js.length < unioncp.length) {
    var [net, u, jsnet] = largestUncovered(nets, unionstatic);
    // program.verbose && console.log(`largest uncovered: ${net.length}`);
    for (var n of net) {
      if (js.indexOf(n) == -1) js.push(n);
    }
    nPages.push(jsnet);
    res.push(u);
    unionstatic = unionstatic.filter((n) => !net.includes(n));
    // program.verbose &&
    //   console.log(`js: ${js.length}, union: ${unionstatic.length}`);
    // remove net from nets
    var netindex = nets.indexOf(jsnet);
    netindex != -1 && nets.splice(netindex, 1);
  }

  // get all JS files from origNet and check against origUnion
  var jssetcover = [];
  for (var p of nPages) {
    var net = p.orignet;
    var jss = net
      .filter((n) => n.type.indexOf("script") != -1)
      .map((n) => n.url.split("?")[0]);
    for (var js of jss) {
      if (!jssetcover.includes(js)) jssetcover.push(js);
    }
  }
  // var rempages = _pagesleft(origNets, jssetcover);
  // console.log(
  //   `npages: ${nPages.length} jssetcover: ${jssetcover.length} union: ${union.length} rempages: ${rempages}`
  // );
  return res;
};

module.exports = {
  setCover,
  setCoverStatic,
};
