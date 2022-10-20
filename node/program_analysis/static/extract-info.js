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
  } catch (e) {
    isValid = false;
  }
  // if string starts with html comments, it is not valid js
  if (testString.startsWith("<!--")) {
    isValid = false;
  }
  return isValid;
}

var extractFromHTML = function (input) {
  var stringLiterals = new Set();
  var parser = new htmlparser2.Parser({
    onattribute: function (name, value) {
      if (value && value.length > 1) {
        stringLiterals.add(value);
      }
    },
    // ontext: function (text) {
    //   if (isValidJs(text)) {
    //     stringLiterals = new Set([...stringLiterals, ...extractFromScripts(text)]);
    //   }
    // },
  });
  parser.write(input);
  parser.end();

  // extract literals from all inline scripts
  var dom = htmlparser2.parseDOM(input);
  var scripts = htmlparser2.DomUtils.getElementsByTagName("script", dom);
  for (var script of scripts) {
    if (script.children.length > 0) {
      var scriptContent = script.children[0].data;
      stringLiterals = new Set([
        ...stringLiterals,
        ...extractFromScripts(scriptContent),
      ]);
    }
  }

  return [...stringLiterals];
};

var extractFromScripts = function (input) {
  try {
    var ast = parser.parse(input, {
      sourceType: "module",
      plugins: ["jsx"],
      errorRecovery: true,
    });
    var stringLiterals = new Set();
    traverse(ast, {
      StringLiteral(path) {
        if (path.node.value && path.node.value.length > 1) {
          stringLiterals.add(path.node.value);
        }
      },
      TemplateElement(path) {
        if (path.node.value && path.node.value.raw.length > 1) {
          stringLiterals.add(path.node.value.raw);
        }
      },
    });

    return [...stringLiterals];
  } catch (e) {
    // console.log(`Error while parsing input: ${input}`, e);
    return [];
  }
};

module.exports = {
  extractFromHTML: extractFromHTML,
  extractFromScripts: extractFromScripts,
};
