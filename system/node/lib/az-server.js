/**
 * @fileoverview
 * Runs the golang analyzer server on a given port
 */

const { spawn } = require("child_process");
const fs = require("fs");
const GOROOT = "/w/goelayu/uluyol-sigcomm/go";
const AZDIR = "/vault-swift/goelayu/balanced-crawler/system/go/wpr";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class AZ {
  constructor(options) {
    this.port = options.port;
    this.logOutput = options.logOutput;
    this.log = "";
  }

  async start() {
    var cmd = `
      GOGC=off GOROOT=${GOROOT} go run src/analyzer/main.go src/analyzer/rewriter.go src/analyzer/genjs.go --port ${this.port} 
    `;
    this.process = spawn(cmd, { shell: true, cwd: AZDIR, detached: true });

    var outStream = fs.createWriteStream(this.logOutput);

    this.stream = outStream;

    this.process.stdout.pipe(outStream);
    this.process.stderr.pipe(outStream);

    await sleep(100);
  }

  async stop() {
    spawn(
      `ps aux | grep port | grep ${this.port} | grep tmp | awk '{print $2}' | xargs kill -SIGTERM`,
      { shell: true }
    );
    this.stream.end();
  }
}

module.exports = AZ;
