const traverse = require("@babel/traverse").default;
const parser = require("@babel/parser");
const generate = require("@babel/generator").default;
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

function transpite(){
  var input = fs.readFileSync(program.file, "utf8");
  var ast = parser.parse(input, {
    sourceType: "module",
    plugins: ["jsx"],
    errorRecovery: true,
  });
  var nonglobals = [];
  traverse(ast, {
    Identifier(path){
      // if (path.scope.hasBinding(path.node.name)) {
        nonglobals.push(path.node.name);
      // }
    }
  });

  console.log(`number of non-global variables: ${nonglobals.length}`);
}

transpite();