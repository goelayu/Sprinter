/**
 * 
 * Parses a JS file using babel, and identifies all 
 * variable declarations that are string literals.
 */

const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const htmlparser2 = require("htmlparser2");
const esprima = require("esprima");

function isValidJs(testString) {
  var isValid = true;
  try {
    esprima.parse(testString);
  }
  catch(e) {
    isValid = false;
  }
  return isValid;
}

var extractFromHTML = function (input) {
  var stringLiterals = [];
  var parser = new htmlparser2.Parser({
    onattribute: function (name, value) {
      stringLiterals.push(value);
    },
    ontext: function (text) {
      if (isValidJs(text)) {
        stringLiterals = stringLiterals.concat(extractFromScripts(text));
      }
    }
  });
  parser.write(input);
  parser.end();
  return stringLiterals;
};

var extractFromScripts = function (input) {
  var ast = parser.parse(input, {
    sourceType: "module",
    plugins: ["jsx"],
    errorRecovery: true,
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

module.exports = {
  extractFromHTML: extractFromHTML,
  extractFromScripts: extractFromScripts
}