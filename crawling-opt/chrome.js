/**
 * New chrome launcher based on puppeeteer instead
 * of CDP (as used inside chrome-remote-interface)
 */

var puppeteer = require("puppeteer"),
  program = require("commander"),
  fs = require("fs");

program
  .option("-o, --output [output]", "path to the output directory")
  .option(
    "-i, --input [input]",
    "path to the input file containing list of URLs"
  )
  .option("--timeout [value]", "timeout value for page navigation")

  .parse(process.argv);

async function launch() {
  const options = {
    executablePath: "/usr/bin/google-chrome-stable",
    headless: program.testing ? false : true,
    args: [
      "--ignore-certificate-errors" /*, '--blink-settings=scriptEnabled=false'*/,
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process,CrossSiteDocumentBlockingAlways,CrossSiteDocumentBlockingIfIsolating",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  };

  const browser = await puppeteer.launch(options);
  let page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
  );
  await page.setCacheEnabled(false);

  var cdp = await page.target().createCDPSession();

  await initCDP(cdp);

  //Set global timeout to force kill the browser
  var gTimeoutValue = program.testing
    ? Number.parseInt(program.timeout) * 100
    : Number.parseInt(program.timeout) + 20000;
  console.log("global time out value", gTimeoutValue, program.timeout);

  // loading pages in Chrome
  await loadPageInChrome(page, browser, cdp, gTimeoutValue);
}

var loadPageInChrome = async function (page, browser, cdp, gTimeoutValue) {
  /**
   * Once Chrome is initilized, loop through the list of URLs
   * and launch each of them in a new Chrome Tab.
   */
  var URLs = fs.readFileSync(program.input, "utf-8").split("\n");
  for (var url of URLs){
    if (url.length == 0) continue;
    // var globalTimer = globalTimeout(browser, cdp, gTimeoutValue),

    var nLogs = [];
    console.log(`Launching url ${url}`);
    initNetHandlers(cdp, nLogs);
    await page
      .goto(url, {
        timeout: program.timeout,
      })
      .catch((err) => {
        console.log("Timer fired before page could be loaded", err);
      });

    console.log("Site loaded");

    var outputDir = `${program.output}/${extractHostname(url)}`;
    fs.mkdirSync(outputDir, { recursive: true });
    dump(nLogs, `${outputDir}/network.log`);
    await extractPLT(page, outputDir);
  }
  await browser.close();
};

function extractHostname(url) {
  var hostname;
  //find & remove protocol (http, ftp, etc.) and get hostname

  if (url.indexOf("//") > -1) {
    hostname = url.split("/")[2];
  } else {
    hostname = url.split("/")[0];
  }

  //find & remove port number
  hostname = hostname.split(":")[0];
  //find & remove "?"
  hostname = hostname.split("?")[0];

  return hostname;
}

var sleep = function (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

var globalTimeout = function (browser, cdp, timeout) {
  return setTimeout(function () {
    console.log("Site navigation did not time out. Force KILL.");
    // cdp.detach();
    browser.close();
  }, timeout);
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

var extractDOM = async function (page) {
  // var inlineStyles = fs.readFileSync(SERIALIZESTYLES, 'utf-8');
  // var evalStyles = await page.evaluateHandle((s) => eval(s),inlineStyles);
  // var domHandler = await page.evaluateHandle(() => document.documentElement.serializeWithStyles());
  // var domString = await domHandler.jsonValue();
  const html = await page.content();
  dump(html, `${program.output}/DOM`);
};

var initConsoleHandlers = function (cdp, cLogs) {
  cdp.on("Runtime.exceptionThrown", (params) => {
    cLogs.push(params);
  });
};

var extractPLT = async function (page, outputDir) {
  var _runtime = await page.evaluateHandle(() => performance.timing);
  var _startTime = await page.evaluateHandle(
    (timing) => timing.navigationStart,
    _runtime
  );
  var _endTime = await page.evaluateHandle(
    (timing) => timing.loadEventEnd,
    _runtime
  );
  var startTime = await _startTime.jsonValue(),
    endTime = await _endTime.jsonValue();

  dump(endTime - startTime, `${outputDir}/PLT`);
  // console.log(`${program.url} Time PLT ${endTime - startTime}`);
};

var dump = function (data, file) {
  fs.writeFileSync(file, JSON.stringify(data));
};

launch().catch((err) => {
  console.log(`error while launching ${err}`);
  // process.exit();
});
