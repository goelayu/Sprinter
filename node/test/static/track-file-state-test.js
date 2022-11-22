/**
 * 
 * Tests for the track-file-state.js module.
 */

const assert = require("assert");
const stateTracker = require("../../program_analysis/static/track-file-state.js");

describe("Extract all globals", function () {
  describe("extract globals 1", function () {
    it("globals declared in the program scope", function () {
      const PREFIX = 'tracer';
      var input = `var a = 1; function foo(){a = a + 1; return a;}`;
      var expected = `${PREFIX}.a=1;function foo(){${PREFIX}.a=${PREFIX}.a+1;return ${PREFIX}.a;}`;
      var output = stateTracker.extractRelevantState(input, {PREFIX});
      assert.equal(output, expected);
    })
  })

  describe("extract globals 2", function () {
    it("different declaration possibilities", function () {
      const PREFIX = 'tracer';
      var input = `var a = 1,b,c=2;var g,h,j; z=4;function foo(){a=a+1;return a;}`;
      var expected = `${PREFIX}.a=1,${PREFIX}.b=undefined,${PREFIX}.c=2;${PREFIX}.g=undefined,${PREFIX}.h=undefined,${PREFIX}.j=undefined;${PREFIX}.z=4;function foo(){${PREFIX}.a=${PREFIX}.a+1;return ${PREFIX}.a;}`;
      var output = stateTracker.extractRelevantState(input, {PREFIX});
      assert.equal(output, expected);
    })
  })

  describe("extract globals 3", function () {
    it("undeclared globals", function () {
      const PREFIX = 'tracer';
      var input = `var a=b+c+d;function foo(c){a=a+e+f;return zs;}`;
      var expected = `${PREFIX}.a=${PREFIX}.b+${PREFIX}.c+${PREFIX}.d;function foo(c){${PREFIX}.a=${PREFIX}.a+${PREFIX}.e+${PREFIX}.f;return ${PREFIX}.zs;}`;
      var output = stateTracker.extractRelevantState(input, {PREFIX});
      assert.equal(output, expected);
    })
  });

  describe("extract globals 4", function () {
    it("only modified identifiers", function () {
      const PREFIX = 'tracer';
      var input = `function foo(){b=c.d;e=f.g;h=i.j;}`;
      var expected = `function foo(){${PREFIX}.b=${PREFIX}.c.d;${PREFIX}.e=${PREFIX}.f.g;${PREFIX}.h=${PREFIX}.i.j;}`;
      var output = stateTracker.extractRelevantState(input, {PREFIX});
      assert.equal(output, expected);
    });
  });
})