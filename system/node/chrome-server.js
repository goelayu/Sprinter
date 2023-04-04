/**
 * An http server which receives a request which contains what URL to load
 * it then simply opens a new page inside chrome and
 */

const fs = require("fs");
const program = require("commander");
const http = require("http");
const puppeteer = require("puppeteer");
const Proxy = require("./lib/wpr-proxy");
const AZ = require("./lib/az-server.js");
const azclient = require("./az-client.js");
const { Cluster } = require("puppeteer-cluster");
const { default: cluster } = require("cluster");
const child_process = require("child_process");
const https = require("https");

program
  .option("-p, --port <port>", "Port to listen on", 3000)
  .option("-c, --concurrency <concurrency>", "Number of proxies to use", 1)
  .option("--azport <azport>", "Port to use for az server", 1234)
  .option("-o, --output <output>", "Output directory", "output")
  .option("--proxy <proxy>", "Proxy to use", "")
  .option("--timeout <timeout>", "Timeout in seconds", 10)
  .parse(process.argv);

var genBrowserArgs = (proxies) => {
  var args = [],
    template = {
      executablePath: "/usr/bin/google-chrome-stable",
      ignoreHTTPSErrors: true,
      headless: program.testing ? false : true,
      args: [
        "--ignore-certificate-errors",
        "--ignore-certificate-errors-spki-list=PhrPvGIaAMmd29hj8BCZOq096yj7uMpRNHpn5PDxI6I",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process,CrossSiteDocumentBlockingAlways,CrossSiteDocumentBlockingIfIsolating",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        // "--blink-settings=scriptEnabled=false",
      ],
    };
  // program.testing && template.args.push("--auto-open-devtools-for-tabs");
  for (var i = 0; i < proxies.length; i++) {
    var proxy = proxies[i];
    var proxyFlags = [
      `--host-resolver-rules=MAP *:80 127.0.0.1:${proxy.http_port},MAP *:443 127.0.0.1:${proxy.https_port},EXCLUDE localhost`,
      // `--proxy-server=http=https://127.0.0.1:${proxy.https_port}`,
    ];
    var browserArgs = Object.assign({}, template);
    browserArgs.args = browserArgs.args.concat(proxyFlags);
    args.push(browserArgs);
  }
  // console.log(args)
  return args;
};

var bashSanitize = (str) => {
  cmd = "echo '" + str + "' | sanitize";
  return child_process.execSync(cmd, { encoding: "utf8" }).trim();
};

function httpPromise(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (resp) => {
        resolve(resp);
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

function httpsPromise(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (resp) => {
        resolve(resp);
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

async function setupBrowserWithProxies() {
  var opts = {
    concurrency: Cluster.CONCURRENCY_BROWSER,
    maxConcurrency: program.concurrency,
    monitor: program.monitor,
    timeout: program.timeout * 1000 * 10,
  };

  console.log("Initializing proxies...");
  var proxyManager = new Proxy.ProxyManager(
    program.concurrency,
    `${program.output}/logs`,
    "replay",
    program.enableOPT,
    0
  );
  await proxyManager.createProxies();
  proxies = proxyManager.getAll();

  opts.perBrowserOptions = genBrowserArgs(proxies);

  console.log("Initializing cluster...");

  const cluster = await Cluster.launch(opts);

  cluster.task(async ({ page, data: url }) => {
    console.log(`Loading page for url ${url}`);
    var sanurl = bashSanitize(url);
    var outputDir = `${program.output}/output/${sanurl}`;

    var args = page.browser().process().spawnargs;
    var pa = args
      .find((e) => e.includes("resolver-rules"))
      .split(":")[4]
      .split(",")[0];

    console.log("updating proxy path");
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    var hr = await httpPromise(
      `http://127.0.0.1:${pa - 1000}/update-archive-path?${
        program.proxy
      }/${sanurl}.wprgo`
    );
    var hsr = await httpsPromise(
      `https://127.0.0.1:${pa}/update-shared-object`
    );

    console.log(
      `Updated proxy data path to ${sanurl}.wprgo: ${hr.statusCode} ${hsr.statusCode}`
    );

    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: program.timeout * 1000,
    });
    console.log(`Page for url ${url} loaded`);
  });

  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  return cluster;
}

async function main() {
  const cluster = await setupBrowserWithProxies();
  const server = http.createServer(async (req, res) => {
    var url = req.url.slice(1);
    console.log(url);
    cluster.queue(url);
    res.end("ok");
  });
  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await cluster.idle();
    await cluster.close();
    process.exit(0);
  });
  console.log("listening on port " + program.port);
  server.listen(program.port);
}

main();
