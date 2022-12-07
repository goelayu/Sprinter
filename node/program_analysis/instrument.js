// Script invoked by the go rewriter to instrument
// all the javaScript on a given web page


const fs = require("fs");
const program  = require("commander");
const stateTracker = require('./static/track-file-state.js');
const DYNPATH = '/vault-swift/goelayu/balanced-crawler/node/program_analysis/dynamic/tracer.js'

program
    .version('0.0.1')
    .option('-i, --input [input]', 'The input file')
    .option('-t, --type [type]', 'The type of file to instrument')
    .option('-n, --name [name]', 'The name of the instrumented file')
    .option('-f, --identifier [identifier]', 'The identifier of the instrumented file')
    .parse(process.argv);

  
if (!program.input) {
    console.log("Please specify an input file");
    process.exit(1);
}

var instrumentJS = function (js) {
  const PREFIX = 'window.__proxy__';
  const name = program.name;
  var addStack = true;
  var scriptNo = program.identifier;
  output = stateTracker.extractRelevantState(js, { PREFIX, name, addStack, scriptNo });
  return output;
}

var instrumentHTML = function (html) {
  var dynLib = fs.readFileSync(DYNPATH, "utf8");
  return `<script>${dynLib}</script>` + html;
}

var main = function () {
    var input = fs.readFileSync(program.input, "utf8");
    var output;
    if (program.type.includes("javascript")){
      output = instrumentJS(input);
    } else output = instrumentHTML(input);
    fs.writeFileSync(program.input, output);
}

main();


