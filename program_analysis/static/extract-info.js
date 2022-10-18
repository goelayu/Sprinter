/**
 * 
 * Parses a JS file using babel, and identifies all 
 * variable declarations that are string literals.
 */

const fs = require("fs");
const program = require("commander");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

program
  .version("0.0.1")
  .option("-i, --input [file]", "Input file")
  .option("-o, --output [file]", "Output file")
  .option("-n, --name [name]", "Name of the instrumented file")
  .parse(process.argv);

if (!program.input) {
  console.log("Please specify an input file");
  process.exit(1);
}

var main = function () {
  var input = fs.readFileSync(program.input, "utf8");
  var ast = parser.parse(input, {
    sourceType: "module",
    plugins: ["jsx"]
  });
  var stringLiterals = [];
  traverse(ast, {
    enter(path) {
      if (path.isStringLiteral()) {
        stringLiterals.push(path.node.value);
      }
    }
  });
  fs.writeFileSync(program.output, JSON.stringify({
    name: program.name,
    stringLiterals: stringLiterals 
  }));
}

main();