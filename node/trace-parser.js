
const Tracelib = require('./node_modules/tracelib')
const fs = require("fs");

var tracefile = JSON.parse(fs.readFileSync('out/trace.json', "utf8"));

var tasks = new Tracelib.default(tracefile.traceEvents);

console.log(tasks.getSummary())
