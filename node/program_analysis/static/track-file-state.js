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

 var isGlobal = function (path) {
  return !path.scope.hasBinding(path.node.name)
  // !path.parentPath.isMemberExpression({property: path.node});
};

var isClosure = function (path) {
  return path.scope.hasBinding(path.node.name) && 
  !path.parentPath.isMemberExpression({property: path.node});
}

var extractRelevantState = function (input){
  var ast = parser.parse(input, {
    sourceType: "module",
    plugins: ["jsx"],
    errorRecovery: true,
  });
  var relevantState = new Set();
  traverse(ast, {
    Identifier(path) {
      console.log("Identifier: ", path.node.name);
      if (isGlobal(path)) {
        console.log(path.node.name);
        relevantState.add(path.node.name);
      }
    }
  });
  return [...relevantState];
}

exports.extractRelevantState = extractRelevantState;