/**
 *
 * Implements data provenance analysis
 */

/**
 *
 * @param {*} path Assignment expression
 * @return string body containing rewritten assignment expression
 */
var provenanceInject = function (path, ids, generate) {
  var left = path.get("left");
  ids = ids.filter((id) => id.toString() != left.toString());

  var newCode = `${generate(path.node.left).code} ${
    path.node.operator
  } __tracer__.dataProv((${generate(path.node.right).code}), [${ids
    .map((id) => id.toString())
    .join(",")}])`;

  return newCode;
};

module.exports = provenanceInject;
