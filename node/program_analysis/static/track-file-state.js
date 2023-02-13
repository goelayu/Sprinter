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
const { GlobalDefaults } = require("./browserGlobals.js");
const types = require("@babel/types");
var provenanceInject = require("./provenance.js");

/**
 * Checks if path is in global scoped
 * @param {Path} path
 */
function isGlobalScopeDecl(path) {
  var funcScope = path.scope.getFunctionParent();
  return (
    !funcScope &&
    (path.node.kind != "let" || path.scope == path.scope.getProgramParent()) &&
    !path.parentPath.isFor()
  );
  // return (
  //   !funcScope ||
  //   path.scope
  //     .getProgramParent()
  //     .hasBinding(path.node.declarations[0].id.name) &&
  //   path.parent.type != "ForInStatement"
  // );
}

var isTrackableIdentifier = function (path) {
  return (
    path.node.name != "undefined" &&
    path.node.name != "null" &&
    (path.parent.type == "AssignmentPattern"
      ? path.parent.right != path.node
      : true) &&
    (path.parent.type == "FunctionDeclaration"
      ? path.parent.id != path.node
      : true) &&
    (path.parent.type == "FunctionExpression"
      ? path.parent.id != path.node
      : true) &&
    (path.parent.type == "MemberExpression"
      ? path.parent.property != path.node
      : true) &&
    (path.parent.type == "OptionalMemberExpression"
      ? path.parent.property != path.node
      : true) &&
    (path.parent.type == "MetaProperty"
      ? path.parent.property != path.node
      : true) &&
    (path.parent.type == "CallExpression"
      ? path.parent.callee != path.node
      : true) &&
    (path.parent.type == "NewExpression"
      ? path.parent.callee != path.node
      : true) &&
    (path.parent.type == "ObjectProperty"
      ? path.parent.key != path.node
      : true) &&
    (path.parent.type == "LabeledStatement"
      ? path.parent.label != path.node
      : true) &&
    (path.parent.type == "BreakStatement"
      ? path.parent.label != path.node
      : true) &&
    (path.parent.type == "ContinueStatement"
      ? path.parent.label != path.node
      : true) &&
    (path.parent.type == "CatchClause"
      ? path.parent.param != path.node
      : true) &&
    (path.parent.type == "ObjectMethod"
      ? path.parent.key != path.node
      : true) &&
    (path.parent.type == "ClassMethod" ? path.parent.key != path.node : true) &&
    (path.parent.type == "VariableDeclarator"
      ? path.parent.id != path.node
      : true) &&
    GlobalDefaults.indexOf(path.node.name) == -1 &&
    path.findParent((path) => path.isClassMethod()) == null
  );
};

var isClosureIdentifier = function (path) {
  // get first function scope
  var funcScope = path.scope.getFunctionParent();
  // since globals are already handled,
  // if this variable is a not a local, it is a closure variable
  if (!funcScope || funcScope.hasOwnBinding(path.node.name)) return false;
  if (path.scope.hasOwnBinding(path.node.name)) return false; // a local scope created with {} inside a function
  var scope = funcScope.parent;
  while (scope.path.type != "Program") {
    if (scope.hasOwnBinding(path.node.name, true)) return scope;
    scope = scope.parent;
  }
  return false;
};

/**
 * Checks is identifier is global or not:
 * Either no scope binding exists, or
 * the scope binding is global
 * @param {*} path
 */
var isGlobalIdentifier = function (path, globalScope) {
  var scope = path.scope;
  while (scope.path.type != "Program") {
    if (scope.hasOwnBinding(path.node.name, true)) return false;
    scope = scope.parent;
  }
  return true;
  // return (
  //   !path.scope.hasBinding(path.node.name, true) ||
  //   globalScope.hasOwnBinding(path.node.name)
  // );
};

var rewriteGlobal = function (path, prefix) {
  var name = path.node.name;
  var newIdentifier;
  if (name == "window") newIdentifier = parser.parseExpression(`${prefix}`);
  else newIdentifier = parser.parseExpression(`${prefix}.${name}`);
  path.replaceWith(newIdentifier);
  path.skip();
};

var rewriteClosure = function (path, prefix) {
  var name = path.node.name;
  var newIdentifier = parser.parseExpression(`${prefix}.${name}`);
  path.replaceWith(newIdentifier);
  path.skip();
};

var decltomemExpr = function (decl, prefix) {
  var resStr = "";
  decl.node.declarations.forEach((decl, idx) => {
    idx > 0 ? (resStr += ", ") : null;
    if (decl.init) {
      if (decl.init.extra && decl.init.extra.parenthesized)
        resStr += `${decl.id.name} = (${generate(decl.init).code})`;
      else resStr += `${decl.id.name} = ${generate(decl.init).code}`;
    } else {
      resStr += `${decl.id.name} = undefined`;
    }
  });
  var newIdentifier = parser.parseExpression(resStr);
  decl.replaceWith(newIdentifier);
  // decl.skip();
};

var getClosureProxyStr = function (path, scopes, sn) {
  var resStr = "";
  for (var uid in scopes) {
    var names = Object.keys(scopes[uid]);
    var clStr = `
        var __closure${uid} = {${names.join(",")}, ${names
      .map((n) => {
        return `set_${n}: function (val) {${n} = val;}`;
      })
      .join(",")},
      ${names.map((n) => `get_${n}: function () {return ${n};}`).join(",")} };
        var __closureProxy${uid} = __tracer__.createLogger(__closure${uid},'closure${sn}_${uid}');
        `;
    resStr += clStr;
  }
  return resStr;
};

// when body of the function is simply an object expression
// () => ({a:1})
var specialArrowFuncRewrite = function (path, clStr, bodyStr) {
  // clStr is a object expression
  var ret = types.returnStatement(parser.parseExpression(bodyStr));
  var clDecl = parser.parse(clStr).program.body;
  clDecl.push(ret);
  var newBlock = types.blockStatement(clDecl);
  path.node.body = newBlock;
};

var extractRelevantState = function (input, opts) {
  var ast = parser.parse(input, {
    sourceType: "module",
    plugins: ["jsx"],
    errorRecovery: true,
  });
  var PREFIX = opts.PREFIX;
  var globalScope;
  var closureScopes = {};
  var closureList = [];
  var sn = opts.name;
  var deprecatedSyntax = false;

  var provenance = opts.provenance,
    AEToId = new WeakMap();

  var helpers = {
    getSrc: function (path) {
      return input.slice(path.node.start, path.node.end);
    },
  };

  traverse(ast, {
    Program: {
      enter(path) {
        globalScope = path.scope;
      },
      exit(path) {
        var prefix = `
      (function () {
        if (typeof window !== 'undefined') {
          window.__stackHead__ = '${opts.name}';
        }
        window.__proxy__ === undefined ? (window.__proxy__ = window) : null;
        if (typeof __tracer__ !== 'undefined') {
        __tracer__.setFileClosure(__stackHead__, [${[
          ...new Set(closureList),
        ].join(",")}]);
        } else {
          __tracer__ = {
            removeProxy: function (e) {return e;},
            createLogger: function (e,f) {return e;}
          }
        }
      })();
      `;
        opts.addStack &&
          path.node.body.unshift(parser.parse(prefix).program.body[0]);
        path.skip();
      },
    },
    // rewrite global variable declarations
    VariableDeclaration(path) {
      if (!isGlobalScopeDecl(path)) return;
      decltomemExpr(path, PREFIX);
    },
    Identifier(path) {
      if (!isTrackableIdentifier(path)) return;
      if (isGlobalIdentifier(path, globalScope)) {
        rewriteGlobal(path, PREFIX);
      } else if (isClosureIdentifier(path)) {
        var clScope = isClosureIdentifier(path);
        closureList.push(`'closure${sn}_${clScope.uid}'`);
        var fnScope = path.scope.getFunctionParent();
        if (!fnScope)
          throw new Error("No function scope found for closure var");
        if (!closureScopes[fnScope.uid]) closureScopes[fnScope.uid] = {};
        if (!closureScopes[fnScope.uid][clScope.uid])
          closureScopes[fnScope.uid][clScope.uid] = {};
        closureScopes[fnScope.uid][clScope.uid][path.node.name] = true;
        rewriteClosure(path, `__closureProxy${clScope.uid}`);
      }
      if (provenance) {
        var ae = path.findParent((p) => p.isAssignmentExpression());
        if (ae) {
          var ids = AEToId.get(ae);
          if (!ids) ids = [];
          ids.push(path);
          AEToId.set(ae, ids);
        }
      }
    },
    BinaryExpression: {
      exit(path) {
        var operators = ["==", "!=", "===", "!==", "instanceof"];
        try {
          if (operators.indexOf(path.node.operator) != -1) {
            var newCode = parser.parseExpression(
              `__tracer__.removeProxy(${generate(path.node.left).code}) ${
                path.node.operator
              } __tracer__.removeProxy(${generate(path.node.right).code})`
            );
            path.replaceWith(newCode);
            path.skip();
          }
        } catch (e) {
          // supress errors since we are not sure if the code is valid
          console.log(`[Static analysis error] ${e}`);
        }
      },
    },
    AssignmentExpression: {
      exit(path) {
        var left = path.get("left");
        var right = path.get("right");
        try {
          if (
            (left.toString().indexOf("prototype") != -1 ||
              left.toString().indexOf("__proto__") != -1) &&
            right.node.type != "FunctionExpression"
          ) {
            var newCode = parser.parseExpression(
              `${generate(path.node.left).code} = __tracer__.removeProxy(${
                generate(path.node.right).code
              })`
            );
            path.replaceWith(newCode);
            path.skip();
          } else if (
            provenance &&
            right.node.type != "FunctionExpression" &&
            AEToId.get(path)
          ) {
            var newCode = parser.parseExpression(
              provenanceInject(path, AEToId.get(path), generate)
            );
            path.replaceWith(newCode);
            path.skip();
          }
        } catch (e) {
          console.log(`[Static analysis error] ${e}`);
        }
      },
    },
    Function: {
      exit(path) {
        if (path.node.type == "ClassMethod") return;
        if (!closureScopes[path.scope.uid]) return;
        var uid = path.scope.uid;
        var scopes = closureScopes[path.scope.uid];
        var clStr = getClosureProxyStr(path, scopes, sn);
        if (!path.node.body.body) {
          if (path.isExpression()) {
            return specialArrowFuncRewrite(
              path,
              clStr,
              path.get("body").toString()
            );
          }
          var bodyStr = path.get("body").toString();
          var newClStr = clStr + bodyStr;
          var newBody = parser.parse(newClStr).program.body;
          var newBlock = types.blockStatement(newBody);
          path.node.body = newBlock;
        } else {
          var cl = parser.parse(clStr).program.body;
          for (var i = cl.length - 1; i >= 0; i--)
            path.node.body.body.unshift(cl[i]);
        }
      },
    },
    WithStatement: {
      exit(path) {
        deprecatedSyntax = true;
      },
    },
  });

  if (deprecatedSyntax) {
    return input;
  }
  return generate(ast, { retainLines: true, compact: true }, input).code;
};

exports.extractRelevantState = extractRelevantState;
