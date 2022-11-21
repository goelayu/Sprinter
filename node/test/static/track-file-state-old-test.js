/**
 *
 * Tests for the track-file-state.js module.
 */

const assert = require("assert");
const stateTracker = require("../../program_analysis/static/track-file-state.js");

function test1() {
  var input = `var a = 1; function foo() { var b = 2; 
       function inner(){ var c = b + a; return c; } return inner(); }`;
  var expected = ["a"];
  var output = stateTracker.extractRelevantState(input);
  assert.equal(output.length, expected.length);
  assert.equal(output[0], expected[0]);
}

test1();