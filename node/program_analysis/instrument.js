// Script invoked by the go rewriter to instrument
// all the javaScript on a given web page

const fs = require("fs");
const program = require("commander");
const DYNPATH =
  "/vault-swift/goelayu/balanced-crawler/node/program_analysis/dynamic/tracer.js";

program
  .version("0.0.1")
  .option("-i, --input [input]", "The input file")
  .option("-t, --type [type]", "The type of file to instrument")
  .option("-n, --name [name]", "The name of the instrumented file")
  .option(
    "-f, --identifier [identifier]",
    "The identifier of the instrumented file"
  )
  .option("--analyzing [analyzing]", "Whether to analyze the file or not")
  .parse(process.argv);

if (!program.input) {
  console.log("Please specify an input file");
  process.exit(1);
}

function IsJsonString(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

var instrumentJS = function (js) {
  if (program.analyzing === "false") return js;
  if (IsJsonString(js)) return js;
  const stateTracker = require("./static/track-file-state.js");
  const PREFIX = "window.__proxy__";
  const name = program.name;
  var addStack = true;
  var scriptNo = program.identifier;
  output = stateTracker.extractRelevantState(js, {
    PREFIX,
    name,
    addStack,
    // provenance: true,
    closureOn: false,
  });
  return output;
};

var modifyAttr = function (html, addImgSrc) {
  const htmlparser = require("node-html-parser");
  var root = htmlparser.parse(html);
  var scripts = root.getElementsByTagName("script");
  var images = root.getElementsByTagName("img");
  for (var i of images) {
    var src = i.getAttribute("src");
    var dst = i.getAttribute("data-src");
    // console.log(`src: ${src}, dst: ${dst}`);
    if (!src && dst && addImgSrc) i.setAttribute("src", dst);
  }
  for (var s of scripts) {
    s.removeAttribute("integrity");
  }
  return root.toString();
};

var instrumentHTML = function (html) {
  if (program.analyzing === "false") {
    // modify regardless of analyzing flag
    return modifyAttr(html);
  }
  html = modifyAttr(html, true);
  var dynLib = fs.readFileSync(DYNPATH, "utf8");
  return `<script>${dynLib}</script>` + html;
};

var main = function () {
  var input = fs.readFileSync(program.input, "utf8");
  var output;
  if (program.type.includes("javascript")) {
    output = instrumentJS(input);
  } else output = instrumentHTML(input);
  fs.writeFileSync(program.input, output);
};

main();
