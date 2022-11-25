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
const {GlobalDefaults} = require('./browserGlobals.js');

/**
 * Checks if path is in global scoped
 * @param {Path} path
 */
function isGlobalScopeDecl(path) {
  return path.scope.getProgramParent().hasBinding(path.node.declarations[0].id.name);
}

/**
 * Checks is identifier is global or not:
 * Either no scope binding exists, or 
 * the scope binding is global
 * @param {*} path 
 */
var isGlobalIdentifier = function (path, globalScope) {
  return path.node.name != "undefined" && 
  path.node.name != "null" &&
  (path.parent.type == "FunctionDeclaration" ?
    path.parent.id != path.node : true) &&
  (!path.scope.hasBinding(path.node.name, true) ||
    globalScope.hasOwnBinding(path.node.name)) && 
  ( path.parent.type == "MemberExpression" ?
    path.parent.property != path.node : true) && 
  ( path.parent.type == "CallExpression" ?
    path.parent.callee != path.node : true) && 
  ( path.parent.type == "NewExpression" ? 
    path.parent.callee != path.node : true) &&
  ( path.parent.type == "ObjectProperty" ?
    path.parent.key != path.node : true) &&
  ( path.parent.type == "LabeledStatement" ?
    path.parent.label != path.node : true) &&
  ( path.parent.type == "BreakStatement" ?
    path.parent.label != path.node : true) &&
  GlobalDefaults.indexOf(path.node.name) == -1;
};


var rewriteGlobal = function (path, prefix) {
  var name = path.node.name;
  var newIdentifier;
  if (name == 'window')
    newIdentifier = parser.parseExpression(`${prefix}`);
  else newIdentifier = parser.parseExpression(`${prefix}.${name}`);
  path.replaceWith(newIdentifier);
  path.skip();
};

var decltomemExpr = function (decl, prefix) {
  var resStr = "";
  decl.node.declarations.forEach((decl,idx) => {
    idx > 0 ? resStr += ", " : null;
    if (decl.init) {
      if (decl.init.extra && decl.init.extra.parenthesized) resStr += `${decl.id.name} = (${generate(decl.init).code})`;
      else resStr += `${decl.id.name} = ${generate(decl.init).code}`;
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
      var prefix=`
      (function () {
        if (typeof window !== 'undefined') {
          window.${PREFIX}.__stackHead__ = ${opts.name})
        }
      })()`;
        `
    },
    // rewrite global variable declarations
    VariableDeclaration(path) {
      if (!isGlobalScopeDecl(path)) return;
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
