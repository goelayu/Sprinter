const child_process = require("child_process");
const util = require("util");
const exec = util.promisify(child_process.exec);
const fs = require("fs");

const GOROOT = "/w/goelayu/uluyol-sigcomm/go";
const GOPATH = "/vault-swift/goelayu/balanced-crawler/crawlers/wprgo/go";
const WPRDIR = "/vault-swift/goelayu/balanced-crawler/system/go/wpr";
const DUMMYDATA = "/run/user/99542426/goelayu/dummy.wprgo";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class Proxy {
  constructor(options) {
    this.http_port = options.http_port;
    this.https_port = options.https_port;
    this.dataOutput = options.dataOutput;
    this.logOutput = options.logOutput;
    this.mode = options.mode;
    this.caching = options.caching;
    this.az_port = options.az_port;
  }

  start() {
    var cmd = `GOROOT=${GOROOT} time -f "%E real\n%U user\n%S sys" go run src/wpr.go ${
      this.mode
    }\
    --http_port ${this.http_port} --https_port ${this.https_port}\
    --az_port ${this.az_port}\
    ${this.caching ? "--caching" : ""} ${this.dataOutput}`;
    (this.stdout = ""), (this.stderr = "");
    console.log(cmd);
    //write dummy data to dataOutput before spawning command
    fs.writeFileSync(this.dataOutput, DUMMYDATA);
    this.process = child_process.spawn(cmd, { shell: true, cwd: WPRDIR });

    var outStream = fs.createWriteStream(this.logOutput);
    var errStream = fs.createWriteStream(this.logOutput);

    this.process.stdout.pipe(outStream);
    this.process.stderr.pipe(errStream);
  }

  dump() {
    console.log(`writing to ${this.logOutput}`);
    // fs.writeFileSync(this.logOutput, this.stdout + this.stderr);
  }

  stop() {
    // this.process.kill("SIGINT");
    child_process.spawnSync(
      `ps aux | grep http_port | grep ${this.http_port} | awk '{print $2}' | xargs kill -SIGINT`,
      { shell: true }
    );
    // await sleep(1000);
    // this.dump();
  }
}

class ProxyManager {
  constructor(nProxies, proxyDir, logDir, mode, caching, az_port) {
    this.nProxies = nProxies;
    this.proxies = [];
    this.startHttpPort = 6080;
    this.startHttpsPort = 7080;
    this.logDir = logDir;
    this.outputDir = proxyDir;
    this.mode = mode;
    this.caching = caching;
    this.az_port = az_port;
  }

  async createProxies() {
    for (var i = 0; i < this.nProxies; i++) {
      var http_port = this.startHttpPort + i;
      var https_port = this.startHttpsPort + i;
      var dataOutput = `${this.outputDir}/${https_port}`;
      var logOutput = `${this.logDir}/${https_port}.${this.mode}.log`;
      var mode = this.mode;
      var caching = this.caching;
      var az_port = this.az_port;
      var p = new Proxy({
        http_port,
        https_port,
        dataOutput,
        logOutput,
        mode,
        caching,
        az_port,
      });
      this.proxies.push(p);
    }

    // start all proxies inside Promise.all
    this.proxies.map((p) => p.start());

    // wait for all proxies to start
    await sleep(3000);
  }

  stopAll() {
    this.proxies.map((p) => p.stop());
  }

  getAll() {
    return this.proxies;
  }
}

var genBrowserArgs = (proxies) => {
  var args = [],
    template = {
      ignoreHTTPSErrors: true,
      args: [
        "--ignore-certificate-errors",
        "--ignore-certificate-errors-spki-list=PhrPvGIaAMmd29hj8BCZOq096yj7uMpRNHpn5PDxI6I",
      ],
    };
  for (var i = 0; i < proxies.length; i++) {
    var proxy = proxies[i];
    var proxyFlags = [
      `--host-resolver-rules="MAP *:80 127.0.0.1:${proxy.http_port},MAP *:443 127.0.0.1:${proxy.https_port},EXCLUDE localhost`,
      `--proxy-server=http=https://127.0.0.1:${proxy.https_port}`,
    ];
    var browserArgs = Object.assign({}, template);
    browserArgs.args = browserArgs.args.concat(proxyFlags);
    args.push(browserArgs);
  }
  // console.log(args)
  return args;
};

module.exports = {
  ProxyManager,
  genBrowserArgs,
};
