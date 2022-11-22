/**
 * A babel plugin that does the following:
 * 1) Identifies all relevant state on the heap that can be accessed,
 * i.e., global and closure variables
 * 2) It then rewrites accesses to these variables, such that
 * they go through a dynamic runtime library, injected at the very top
 * of each file.
 */

const traverse = require("@babel/traverse").default;
const parser = require("@babel/parser");
const generate = require("@babel/generator").default;

/**
 * Checks if path is in global scoped
 * @param {Path} path
 */
function isGlobalScope(path) {
  return path.scope == path.scope.getProgramParent();
}

/**
 * Checks is identifier is global or not:
 * Either no scope binding exists, or 
 * the scope binding is global
 * @param {*} path 
 */
var isGlobalIdentifier = function (path, globalScope) {
  return path.node.name != "undefined" && path.node.name != "null" &&
  path.parent.type != "FunctionDeclaration" &&
  (!path.scope.hasBinding(path.node.name, true) ||
    globalScope.hasOwnBinding(path.node.name));
};


var rewriteGlobal = function (path, prefix) {
  var name = path.node.name;
  var newIdentifier = parser.parseExpression(`${prefix}.${name}`);
  path.replaceWith(newIdentifier);
  path.skip();
};

var decltomemExpr = function (decl, prefix) {
  var resStr = "";
  decl.node.declarations.forEach((decl,idx) => {
    idx > 0 ? resStr += ", " : null;
    if (decl.init) {
      resStr += `${decl.id.name} = ${generate(decl.init).code}`;
    } else {
      resStr += `${decl.id.name} = undefined`;
    }
  });
  var newIdentifier = parser.parseExpression(resStr);
  decl.replaceWith(newIdentifier);
  // decl.skip();
};

var extractRelevantState = function (input, opts) {
  var ast = parser.parse(input, {
    sourceType: "module",
    plugins: ["jsx"],
    errorRecovery: true,
  });
  var PREFIX = opts.PREFIX;
  var globalScope;
  traverse(ast, {
    Program(path) {
      globalScope = path.scope;
    },
    // rewrite global variable declarations
    VariableDeclaration(path) {
      if (!isGlobalScope(path)) return;
      decltomemExpr(path, PREFIX);
    },
    Identifier(path) {
      if (isGlobalIdentifier(path, globalScope)) {
        rewriteGlobal(path, PREFIX);
      }
    }
  });
  
  return generate(ast,{retainLines:true,compact:true},input).code;
};

exports.extractRelevantState = extractRelevantState;
