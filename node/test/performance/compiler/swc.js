const swc = require("@swc/core");
const visitor = require("@swc/core/Visitor.js").Visitor;
const program = require('commander');
const fs = require('fs');

program
  .version('0.0.1')
  .option('-f, --file <file>', 'File to parse')
  .parse(process.argv);

if (!program.file) {
  console.error('File is required');
  process.exit(1);
}

class idVisitor extends visitor {
  constructor(){
    super();
    this.nonglobals = [];
  }

  visitIdentifier(n){
    this.nonglobals.push(n.value);  
  }
}

function transpile(){
  var input = fs.readFileSync(program.file, "utf8");
  var ast = swc.parseSync(input, {
    syntax: "ecmascript",
  });

  var visitor = new idVisitor();
  visitor.visitProgram(ast);
  console.log(`number of non-global variables: ${visitor.nonglobals.length}`);
}

transpile();