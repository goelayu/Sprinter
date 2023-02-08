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
      GOROOT=${GOROOT} go run src/analyzer/main.go src/analyzer/rewriter.go src/analyzer/gen_js.go --port ${this.port} 
    `;
    this.process = spawn(cmd, { shell: true, cwd: AZDIR });
    this.process.stdout.on("data", (data) => {
      this.log += data;
    });
    this.process.stderr.on("data", (data) => {
      this.log += data;
    });

    await sleep(100);
  }

  async stop() {
    spawn(
      `ps aux | grep port | grep ${this.port} | awk '{print $2}' | xargs kill -SIGINT`,
      { shell: true }
    );
    fs.writeFileSync(this.logOutput, this.log);
  }
}

module.exports = AZ;
