/**
 * A nodeJS based crawler (similar to the browsertrix crawler)
 * that leverages the webpagereplay project as the man in the middle proxy
 * instead of pywb.
 * Also supports distributed crawling, by leveraging
 * multiple browser based crawlers.
 */

const program = require("commander");
const { Events } = require("chrome-remote-interface-extra");
const fs = require("fs");
const util = require("util");
const child_process = require("child_process");
const exec = util.promisify(child_process.exec);
const { Cluster } = require("puppeteer-cluster");
const { options } = require("yargs");
const { PuppeteerWARCGenerator, PuppeteerCapturer } = require("node-warc");

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
  .option("--screenshot", "take screenshot of each page")
  .option("-s, --store", "store the downloaded resources. By default store all")
  .option("-n, --network", "dump network data")
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

var bashSanitize = (str) => {
  cmd="echo '" + str + "' | sanitize";
  console.log(cmd);
  return child_process.execSync(cmd, { encoding: "utf8" }).trim();
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
    opts.puppeteerOptions = { executablePath: "/usr/bin/google-chrome-stable" };
  }
  console.log(opts);
  // Create a browser pool
  var cluster = await Cluster.launch(opts);

  // Get the urls to crawl
  var urls = getUrls(program.urls);

  var schd_changed = {};

  cluster.task(async ({ page, data }) => {
    // await page.evaluateOnNewDocument(
    //   'Object.defineProperty(navigator, "webdriver", {value: false});'
    // );

    // create output dir if not exists
    data.outputDir = `${program.output}/${bashSanitize(data.url)}/dynamic`;
    if (!fs.existsSync(data.outputDir)) {
      fs.mkdirSync(data.outputDir, { recursive: true });
    }
    var bPid = page.browser()._process.pid;
    data.bPid = bPid;
    if (!schd_changed[bPid]) {
      await change_schd_rt(bPid,99);
      schd_changed[bPid] = true;
    }
    // console.log("page target is", page._target._targetInfo.targetId);
    if (program.network) {
      var cdp = await page.target().createCDPSession(),
        nLogs = data.nLogs = [];
      await initCDP(cdp);
      initNetHandlers(cdp, nLogs);
    }
    if (program.store) {
      // await page.setRequestInterception(true);
      // interceptData(page, crawlData);
      var cap = new PuppeteerCapturer(page, Events.Page.Request);
      cap.startCapturing();
    }
    var startTime = process.hrtime();
    await page.goto(`http://${data.url}`, { timeout: program.timeout * 1000 });
    var endTime = process.hrtime(startTime);
    if (program.screenshot)
      await page.screenshot({
        path: `${data.outputDir}/${data.url}.png`,
      });
    console.log(
      `Total time taken for ${data.url} is ${
        endTime[0] * 1000 + endTime[1] / 1000000
      }`
    );
    if (program.store) {
      const warcGen = new PuppeteerWARCGenerator();
      await warcGen.generateWARC(cap, {
        warcOpts: {
          // warcPath: `${program.output}/${page._target._targetInfo.targetId}.warc`,
          warcPath: `${data.outputDir}/${bPid}.warc`,
          appending: true,
        },
        winfo: {
          description: "I created a warc!",
          isPartOf: "My awesome pywb collection",
        },
      });
    }
    program.network &&
      fs.writeFileSync(
        `${data.outputDir}/network.log`,
        JSON.stringify(nLogs)
      );
  });

  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data.url}: ${err.message}`);
    program.network &&
      fs.writeFileSync(
        `${data.outputDir}/network.log`,
        JSON.stringify(data.nLogs)
      );
  });

  // Crawl the urls
  urls.forEach((url) => {
    cluster.queue({url:url});
  });
  // await sleep(1000000);
  // Wait for the cluster to finish
  await cluster.idle();
  await cluster.close();
  if (!program.noproxy) {
    await proxyManager.stopAll();
  }
  // save the crawl data
  program.store && dumpData(crawlData);
})();

function interceptData(page, crawlData) {
  var bPid = page.browser()._process.pid;
  if (!crawlData[bPid]) {
    crawlData[bPid] = "";

    // page.on("request", (request) => {
    //   crawlData[bPid] += request.url() + "\n";
    //   crawlData[bPid] += JSON.stringify(request.headers()) + "\n";
    //   request.continue();
    // });
    page.on("response", async (response) => {
      crawlData[bPid] += response.url() + "\n";
      crawlData[bPid] += JSON.stringify(response.headers()) + "\n";
      var status = response.status();
      if (status >= 300 && status <= 399) return;
      var data = await response.buffer();
      if (data) {
        crawlData[bPid] += data.toString() + "\n";
      }
    });
  }
}

var change_schd_rt = async (pid, rt) => {
  var cmd = `sudo chrt -a -f -p ${rt} ${pid}`;
  await exec(cmd);
};

var initCDP = async function (cdp) {
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Profiler.enable");
};

var initNetHandlers = function (cdp, nLogs) {
  const network_observe = [
    "Network.requestWillBeSent",
    "Network.requestServedFromCache",
    "Network.dataReceived",
    "Network.responseReceived",
    "Network.resourceChangedPriority",
    "Network.loadingFinished",
    "Network.loadingFailed",
  ];

  network_observe.forEach((method) => {
    cdp.on(method, (params) => {
      nLogs.push({ [method]: params });
    });
  });
};

function dumpData(crawlData) {
  for (var pid in crawlData) {
    var data = crawlData[pid];
    fs.writeFile(`${program.output}/data-${pid}.wprgo`, data, (err) => {
      if (err) console.error(err);
    });
  }
}
