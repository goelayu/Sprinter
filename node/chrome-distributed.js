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
const { PuppeteerWARCGenerator, PuppeteerCapturer } = require("node-warc");
const PageClient = require("./lib/PageClient.js");
const ProxyManager = require("./lib/wpr-proxy");

const GOROOT = "/w/goelayu/uluyol-sigcomm/go";
const GOPATH = "/vault-swift/goelayu/balanced-crawler/crawlers/wprgo/go";
const WPRDIR =
  "/vault-swift/goelayu/balanced-crawler/crawlers/wprgo/pkg/mod/github.com/catapult-project/catapult/web_page_replay_go@v0.0.0-20220815222316-b3421074fa70";

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
  .option("-p, --payload", "enable capturing payload")
  .option("--emulateCPU <emulateCPU>", "emulate CPU (integer)", parseInt)
  .option("--emulateNetwork <emulateNetwork>", "emulate Network (integer)")
  .option("--noproxy", "disable proxy usage")
  .option("--proxy <proxy>", "proxy directory to use")
  .option("--screenshot", "take screenshot of each page")
  .option("-s, --store", "store the downloaded resources. By default store all")
  .option("-n, --network", "dump network data")
  .option("--tracing", "dump tracing data")
  .option("--mode <mode>", "mode of the proxy, can't be used with --noproxy")
  .parse(process.argv);

var bashSanitize = (str) => {
  cmd = "echo '" + str + "' | sanitize";
  return child_process.execSync(cmd, { encoding: "utf8" }).trim();
};

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
    if (!program.mode) {
      console.log("Please specify a mode for the proxy");
      process.exit(1);
    }
    console.log("Initializing proxies...");
    var proxyManager = new ProxyManager(
      program.concurrency,
      program.proxy,
      program.output,
      program.mode
    );
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
  // console.log(opts);
  // Create a browser pool
  var cluster = await Cluster.launch(opts);

  // Get the urls to crawl
  var urls = getUrls(program.urls);

  var schd_changed = {};

  cluster.task(async ({ page, data }) => {
    var outputDir = `${program.output}/${bashSanitize(data.url)}/dynamic`;

    if (program.store) {
      // await page.setRequestInterception(true);
      // interceptData(page, crawlData);
      var cap = new PuppeteerCapturer(page, Events.Page.Request);
      cap.startCapturing();
    }

    var cdp = await page.target().createCDPSession();

    var pclient = new PageClient(page, cdp, {
      url: data.url,
      enableNetwork: program.network,
      enableConsole: program.logs,
      enableJSProfile: program.jsProfile,
      enableTracing: program.tracing,
      enableScreenshot: program.screenshot,
      enablePayload: program.payload,
      userAgent: program.userAgent,
      outputDir: outputDir,
      verbose: false,
      logTime: true,
      emulateCPU: program.emulateCPU,
      emulateNetwork: program.emulateNetwork,
    });

    await pclient.start().catch((err) => {
      console.log(err);
    });

    // console.log(`total number of frames loaded is ${page.frames().length}`);

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
  });

  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data.url}: ${err.message}`);
  });

  // Crawl the urls
  urls.forEach((url) => {
    cluster.queue({ url: url });
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

var enableTracingPerFrame = function (page, outputDir) {
  page.on("frameattached", async (frame) => {
    // if (frame === page.mainFrame()) return;
    console.log(
      `starting tracing for frame ${frame._id} with url ${frame.url()}`
    );
    var frameTracer = new Tracing(frame._client);
    page.frameTracers[frame._id] = frameTracer;
    await frameTracer.start({
      path: `${outputDir}/${frame._id}.trace.json`,
    });
  });

  //   frame._client.send("Tracing.start", {
  //     transferMode: "ReturnAsStream",
  //     categories: [
  //       "-*",
  //       "devtools.timeline",
  //       "disabled-by-default-devtools.timeline",
  //       "disabled-by-default-devtools.timeline.frame",
  //       "toplevel",
  //       "blink.console",
  //       "blink.user_timing",
  //       "latencyInfo",
  //       "disabled-by-default-devtools.timeline.stack",
  //       "disabled-by-default-v8.cpu_profiler",
  //       "disabled-by-default-v8.cpu_profiler.hires",
  //     ],
  //   });
  //   frame._client.on("Tracing.tracingComplete", async (event) => {
  //     var stream = await frame._client.send("Tracing.getTraceStream");
  //     var buffer = await stream.read();
  //     var trace = JSON.parse(buffer.toString());
  //     fs.writeFileSync(
  //       `${outputDir}/${frame._target._targetInfo.targetId}.json`,
  //       JSON.stringify(trace)
  //     );
  //   });
  // });
};

var change_schd_rt = async (pid, rt) => {
  var cmd = `sudo chrt -a -f -p ${rt} ${pid}`;
  await exec(cmd);
};

function dumpData(crawlData) {
  for (var pid in crawlData) {
    var data = crawlData[pid];
    fs.writeFile(`${program.output}/data-${pid}.wprgo`, data, (err) => {
      if (err) console.error(err);
    });
  }
}
