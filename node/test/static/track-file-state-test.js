/**
 *
 * Tests for the track-file-state.js module.
 */

const assert = require("assert");
const stateTracker = require("../../program_analysis/static/track-file-state.js");

describe("Extract all globals", function () {
  describe("extract globals 1", function () {
    it("globals declared in the program scope", function () {
      const PREFIX = "tracer";
      var input = `var a = 1; function foo(){a = a + 1; return a;}`;
      var expected = `${PREFIX}.a=1;function foo(){${PREFIX}.a=${PREFIX}.a+1;return ${PREFIX}.a;}`;
      var output = stateTracker.extractRelevantState(input, { PREFIX });
      assert.equal(output, expected);
    });
  });

  describe("extract globals 2", function () {
    it("different declaration possibilities", function () {
      const PREFIX = "tracer";
      var input = `var a = 1,b,c=2;var g,h,j; z=4;function foo(){a=a+1;return a;}`;
      var expected = `${PREFIX}.a=1,${PREFIX}.b=undefined,${PREFIX}.c=2;${PREFIX}.g=undefined,${PREFIX}.h=undefined,${PREFIX}.j=undefined;${PREFIX}.z=4;function foo(){${PREFIX}.a=${PREFIX}.a+1;return ${PREFIX}.a;}`;
      var output = stateTracker.extractRelevantState(input, { PREFIX });
      assert.equal(output, expected);
    });
  });

  describe("extract globals 3", function () {
    it("undeclared globals", function () {
      const PREFIX = "tracer";
      var input = `var a=b+c+d;function foo(c){a=a+e+f;return zs;}`;
      var expected = `${PREFIX}.a=${PREFIX}.b+${PREFIX}.c+${PREFIX}.d;function foo(c){${PREFIX}.a=${PREFIX}.a+${PREFIX}.e+${PREFIX}.f;return ${PREFIX}.zs;}`;
      var output = stateTracker.extractRelevantState(input, { PREFIX });
      assert.equal(output, expected);
    });
  });

  describe("extract globals 4", function () {
    it("only modified identifiers", function () {
      const PREFIX = "tracer";
      var input = `function foo(){b=c.d;e=f.g;h=i.j;}`;
      var expected = `function foo(){${PREFIX}.b=${PREFIX}.c.d;${PREFIX}.e=${PREFIX}.f.g;${PREFIX}.h=${PREFIX}.i.j;}`;
      var output = stateTracker.extractRelevantState(input, { PREFIX });
      assert.equal(output, expected);
    });
  });

  describe("extract globals 5", function () {
    it("Don't rewrite function invocations", function () {
      const PREFIX = "tracer";
      var input = `function foo(){global(); a = b(); c = d(e()); f = g.h();}`;
      var expected = `function foo(){global();${PREFIX}.a=b();${PREFIX}.c=d(e());${PREFIX}.f=${PREFIX}.g.h();}`;
      var output = stateTracker.extractRelevantState(input, { PREFIX });
      assert.equal(output, expected);
    });
  });

  describe("extract globals 6", function () {
    it("try catch scope", function () {
      const PREFIX = "tracer";
      var input = `try{ var a = 2,b; d = 4; let e = 5;}finally{var f = 6;}`;
      var expected = `try{${PREFIX}.a=2,${PREFIX}.b=undefined;${PREFIX}.d=4;let e=5;}finally{${PREFIX}.f=6;}`;
      var output = stateTracker.extractRelevantState(input, { PREFIX });
      assert.equal(output, expected);
    });
  });

  describe("extract globals 7", function () {
    it("paranthesis for var", function () {
      const PREFIX = "tracer";
      var input = `var a = (b,c,d),d=4,e=(9);`;
      var expected = `${PREFIX}.a=(${PREFIX}.b,${PREFIX}.c,${PREFIX}.d),${PREFIX}.d=4,${PREFIX}.e=9;`;
      var output = stateTracker.extractRelevantState(input, { PREFIX });
      assert.equal(output, expected);
    });
  });
});

describe("browser context testing", function () {
  describe("browser context 1", function () {
    it("window object", function () {
      const PREFIX = "tracer";
      const name = "test";
      var input = `var a = window; b = window.c;function foo(){var window = 4; window.b = 234; return window;}`;
      var expected = `${PREFIX}.a=${PREFIX};${PREFIX}.b=${PREFIX}.c;function foo(){var window=4;window.b=234;return window;}`;
      var output = stateTracker.extractRelevantState(input, { PREFIX, name });
      assert.equal(output, expected);
    });
  });

  describe("browser context 2", function () {
    it("Ignore Browser defaults", function () {
      const PREFIX = "tracer";
      var input = `var bl = new Bluetooth(); var bl2 = new customBlueTooth();function foo(){var l = bl.getLevel(); var l2 = Blob.someproperty; var l3 = nonblob;}`;
      var expected = `tracer.bl=new Bluetooth();tracer.bl2=new customBlueTooth();function foo(){var l=tracer.bl.getLevel();var l2=Blob.someproperty;var l3=tracer.nonblob;}`;
      var output = stateTracker.extractRelevantState(input, { PREFIX });
      assert.equal(output, expected);
    });
  });

  describe("browser context 3", function () {
    it("google snippets", function () {
      const PREFIX = "window";
      var input = `try {
        var s_, s_aa = function(a, b) {
        if (Error.captureStackTrace)
            Error.captureStackTrace(this, s_aa);
        else {
            var c = Error().stack;
            c && (this.stack = c)
        }
        a && (this.message = String(a));
        void 0 !== b && (this.cause = b)
    } } finally {}`;
      var expected = `${PREFIX}.a=${PREFIX};${PREFIX}.b=${PREFIX}.c;function foo(){var window=4;window.b=234;return window;}`;
      var output = stateTracker.extractRelevantState(input, { PREFIX });
      assert.equal(output, expected);
    });
  });
});
