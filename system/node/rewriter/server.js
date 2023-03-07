const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const packageDefinition = protoLoader.loadSync("./rewriter.proto", {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const stateTracker = require("./static/track-file-state.js");
const DYNPATH =
  "/vault-swift/goelayu/balanced-crawler/node/program_analysis/dynamic/tracer.js";
const htmlparser = require("node-html-parser");
const program = require("commander");
const fs = require("fs");

program
  .version("0.0.1")
  .option("-p, --port [port]", "The port to listen on")
  .parse(process.argv);

var rewriter = grpc.loadPackageDefinition(packageDefinition).rewriter;

function IsJsonString(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

var instrumentJS = function (js, name) {
  if (IsJsonString(js)) return js;
  const PREFIX = "window.__proxy__";
  var addStack = true;
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

var rewrite = function (call, callback) {
  var input = call.request.content;
  var type = call.request.type;
  var name = call.request.name;
  var output;
  console.log(`input file: ${input.length} bytes`);
  if (type.includes("javascript")) output = instrumentJS(input, name);
  else output = instrumentHTML(input);
  console.log(`output file: ${output.length} bytes`);
  callback(null, { content: output });
};

var _test = function () {
  for (var i = 1; i < 1000000000; i++) {
    var x = i * i;
  }
};

var test = function (call, callback) {
  console.log("received test");
  setTimeout(() => {
    _test();
    callback(null, { content: "test" });
  }, 0);
};

var getServer = function () {
  var server = new grpc.Server();
  server.addService(rewriter.Rewriter.service, {
    rewrite: rewrite,
    test: test,
  });
  return server;
};

var rewriterServer = getServer();
rewriterServer.bindAsync(
  `0.0.0.0:${program.port}`,
  grpc.ServerCredentials.createInsecure(),
  () => {
    console.log(`Listening on port ${program.port}...`);
    rewriterServer.start();
  }
);
