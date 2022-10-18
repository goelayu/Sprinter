/**
 * 
 * Parses a JS file using babel, and identifies all 
 * variable declarations that are string literals.
 */

const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;


var extractStrings = function (input) {
  var ast = parser.parse(input, {
    sourceType: "module",
    plugins: ["jsx"]
  });
  var stringLiterals = [];
  traverse(ast, {
    enter(path) {
      if (path.isStringLiteral() && path.node.value.length > 1) {
        stringLiterals.push(path.node.value);
      }
    }
  });

  return stringLiterals;
}

module.exports = extractStrings;