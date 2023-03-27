const fs = require("fs");
const program = require("commander");
const htmlparser = require("node-html-parser");

program.option("-p, --payload <payload>", "payload file").parse(process.argv);

var payload = fs.readFileSync(program.payload, "utf-8");

var root = htmlparser.parse(payload);
var images = root.getElementsByTagName("source");
for (var i of images) {
  console.log(i.rawAttrs);
}
