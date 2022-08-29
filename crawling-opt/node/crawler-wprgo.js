/**
 * A nodeJS based crawler (similar to the browsertrix crawler)
 * that leverages the webpagereplay project as the man in the middle proxy
 * instead of pywb.
 * Also supports distributed crawling, by leveraging
 * multiple browser based crawlers.
 */

const program = require("commander");
const puppeteer = require("puppeteer");
const fs = require("fs");
const child_process = require("child_process");
const { Cluster } = require("puppeteer-cluster");
const { options } = require("yargs");

const GOROOT = "/w/goelayu/uluyol-sigcomm/go";
const GOPATH =
  "/vault-swift/goelayu/research-ideas/crawling-opt/crawlers/wprgo/go";
const WPRDIR =
  "/vault-swift/goelayu/research-ideas/crawling-opt/crawlers/wprgo/pkg/mod/github.com/catapult-project/catapult/web_page_replay_go@v0.0.0-20220815222316-b3421074fa70";

program
  .option("-u, --urls <urls>", "file containing list of urls to crawl")
  .option(
    "-o, --output <output>",
    "output directory for storing the crawled data"
  )
  .option(
    "-c, --concurrency <concurrency>",
    "number of concurrent crawlers to use",
    parseInt
  )
  .option("-m, --monitor <monitor>", "monitor the cluster (boolean)")
  .option(
    "-t, --timeout <timeout>",
    "timeout for each crawl (seconds)",
    parseInt
  )
  .option("--noproxy", "disable proxy usage")
  .parse(process.argv);

class Proxy {
  constructor(options) {
    this.http_port = options.http_port;
    this.https_port = options.https_port;
    this.dataOutput = options.dataOutput;
    this.logOutput = options.logOutput;
  }

  async start() {
    var cmd = `GOROOT=${GOROOT} GOPATH=${GOPATH} go run src/wpr.go record\
    --http_port ${this.http_port} --https_port ${this.https_port}\
    ${this.dataOutput}`;
    (this.stdout = ""), (this.stderr = "");
    this.process = child_process.spawn(cmd, { shell: true, cwd: WPRDIR });
    this.process.stdout.on("data", (data) => {
      this.stdout += data;
    });
    this.process.stderr.on("data", (data) => {
      this.stderr += data;
    });
    // this.process.on("exit", (code) => {
    //   fs.writeFileSync(this.logOutput, stdout + stderr);
    // });
  }

  dump() {
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
  constructor(nProxies, outputDir) {
    this.nProxies = nProxies;
    this.proxies = [];
    this.startHttpPort = 8000;
    this.startHttpsPort = 9000;
    this.outputDir = outputDir;
  }

  async createProxies() {
    for (var i = 0; i < this.nProxies; i++) {
      var http_port = this.startHttpPort + i;
      var https_port = this.startHttpsPort + i;
      var dataOutput = `${this.outputDir}/data-${i}.wprgo`;
      var logOutput = `${this.outputDir}/log-${i}`;
      var p = new Proxy({ http_port, https_port, dataOutput, logOutput });
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

var getUrls = (urlFile) => {
  var urls = [];
  fs.readFileSync(urlFile, "utf8")
    .split("\n")
    .forEach((url) => {
      if (url.length > 0) {
        urls.push(url);
      }
    });
  return urls;
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

var genBrowserArgs = (proxies) => {
  var args = [],
    template = {
      executablePath: "/usr/bin/google-chrome-stable",
      ignoreHTTPSErrors: true,
      headless: true,
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

(async () => {
  // Initialize the proxies if flag enabled
  var proxies = [];
  if (!program.noproxy) {
    console.log("Initializing proxies...");
    var proxyManager = new ProxyManager(program.concurrency, program.output);
    await proxyManager.createProxies();
    proxies = proxyManager.getAll();
  }

  var opts = {
    concurrency: Cluster.CONCURRENCY_BROWSER,
    maxConcurrency: program.concurrency,
    monitor: program.monitor,
  };
  if (!program.noproxy) {
    opts.perBrowserOptions = genBrowserArgs(proxies);
  } else {
    opts.puppeteerOptions = {executablePath: "/usr/bin/google-chrome-stable"}
  }
  console.log(opts)
  // Create a browser pool
  var cluster = await Cluster.launch(opts);

  // Get the urls to crawl
  var urls = getUrls(program.urls);

  cluster.task(async ({ page, data: url }) => {
    // await page.evaluateOnNewDocument(
    //   'Object.defineProperty(navigator, "webdriver", {value: false});'
    // );
    await page.goto(`https://${url}`, { timeout: program.timeout * 1000 });
    // await page.screenshot({ path: `${program.output}/${url}.png` });
  });

  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  // Crawl the urls
  urls.forEach((url) => {
    cluster.queue(url);
  });
  // await sleep(1000000);
  // Wait for the cluster to finish
  await cluster.idle();
  await cluster.close();
  if (!program.noproxy) {
    await proxyManager.stopAll();
  }
})();
