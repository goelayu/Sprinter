/**
 *
 * @fileoverview compares the state.json files from different pages
 * for each js file, compare the total read state that was read
 * across different occurances of the file.
 */

const fs = require("fs");
const program = require("commander");

program
  .option("-b, --basedir <dir>", "dir containing state.json files")
  .option("-p, --pages <pages>", " file containing list of pages")
  .option("-v, --verbose", "verbose")
  .parse(process.argv);

var parseState = function (path) {
  var robj = {};
  try {
    var pagestate = JSON.parse(fs.readFileSync(path, "utf-8"));
    for (var f of Object.keys(pagestate)) {
      var filestate = pagestate[f].state;
      robj[f] = [];
      for (var s of filestate) {
        if (s.indexOf("read") != 2) continue;
        robj[f].push(s);
      }
    }
  } catch (e) {
    program.verbose && console.log(e);
  }
  return robj;
};

var compareStates = function (prevStates, curstate) {
  var match = false;
  for (var prevState of prevStates) {
    if (prevState.length != curstate.length) continue;
    match = true;
    for (var i = 0; i < prevState.length; i++) {
      if (prevState[i] != curstate[i]) {
        match = false;
        break;
      }
    }
    if (match) break;
  }
  return match;
};

var traversePages = function () {
  var summary = {
      first: 0,
      total: 0,
      hits: 0,
      misses: 0,
    },
    store = {};
  var pages = fs
    .readFileSync(program.pages, "utf-8")
    .split("\n")
    .filter((p) => p.length > 0);
  for (var p of pages) {
    var state = parseState(`${program.basedir}/${p}/state.json`);
    for (var f of Object.keys(state)) {
      summary.total++;
      if (!store[f]) {
        store[f] = [];
        summary.first++;
        continue;
      }
      var match = compareStates(store[f], state[f]);
      if (match) summary.hits++;
      else {
        summary.misses++;
        store[f].push(state[f]);
      }
    }
  }
  console.log(JSON.stringify(summary));
};

traversePages();
