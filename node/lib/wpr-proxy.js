const GOROOT = "/w/goelayu/uluyol-sigcomm/go";
const GOPATH =
  "/vault-swift/goelayu/balanced-crawler/crawlers/wprgo/go";
const WPRDIR =
  "/vault-swift/goelayu/balanced-crawler/crawlers/wprgo/pkg/mod/github.com/catapult-project/catapult/web_page_replay_go@v0.0.0-20220815222316-b3421074fa70";


class Proxy {
  constructor(options) {
    this.http_port = options.http_port;
    this.https_port = options.https_port;
    this.dataOutput = options.dataOutput;
    this.logOutput = options.logOutput;
    this.mode = options.mode;
  }

  async start() {
    var cmd = `GOROOT=${GOROOT} GOPATH=${GOPATH} go run src/wpr.go ${this.mode}\
    --http_port ${this.http_port} --https_port ${this.https_port}\
    ${this.dataOutput}`;
    (this.stdout = ""), (this.stderr = "");
    console.log(cmd);
    this.process = child_process.spawn(cmd, { shell: true, cwd: WPRDIR });
    this.process.stdout.on("data", (data) => {
      this.stdout += data;
    });
    this.process.stderr.on("data", (data) => {
      this.stderr += data;
    });
  }

  dump() {
    console.log(`writing to ${this.logOutput}`);
    fs.writeFileSync(this.logOutput, this.stdout + this.stderr);
  }

  async stop() {
    // this.process.kill("SIGINT");
    child_process.spawnSync(
      `ps aux | grep http_port | grep ${this.http_port} | awk '{print $2}' | xargs kill -SIGINT`,
      { shell: true }
    );
    // await sleep(1000);
    this.dump();
  }
}

class ProxyManager {
  constructor(nProxies, proxyDir, logDir, mode) {
    this.nProxies = nProxies;
    this.proxies = [];
    this.startHttpPort = 8000;
    this.startHttpsPort = 9000;
    this.logDir = logDir;
    this.outputDir = proxyDir;
    this.mode = mode;
  }

  async createProxies() {
    for (var i = 0; i < this.nProxies; i++) {
      var http_port = this.startHttpPort + i;
      var https_port = this.startHttpsPort + i;
      var dataOutput = `${this.outputDir}/data-${i}.wprgo`;
      var logOutput = `${this.logDir}/log-${i}`;
      var mode = this.mode;
      var p = new Proxy({ http_port, https_port, dataOutput, logOutput, mode });
      this.proxies.push(p);
    }

    // start all proxies inside Promise.all
    await Promise.all(this.proxies.map((p) => p.start()));

    // wait for all proxies to start
    await sleep(2000);
  }

  async stopIth(i) {
    await this.proxies[i].stop();
  }

  async stopAll() {
    await Promise.all(this.proxies.map((p) => p.stop()));
  }

  getAll() {
    return this.proxies;
  }
}

module.exports = ProxyManager;
