/**
 * New chrome launcher based on puppeeteer instead
 * of CDP (as used inside chrome-remote-interface)
 * This version launches the browser once and then opens every webpage
 * in a new tab.
 */

var puppeteer = require("puppeteer"),
  program = require("commander"),
  fs = require("fs"),
  path = require("path"),
  url = require("url");

program
  .option("-o, --output [output]", "path to the output directory")
  .option(
    "-i, --input [input]",
    "path to the input file containing list of URLs"
  )
  .option("--timeout [value]", "timeout value for page navigation")
  .option("--testing",'testing mode enabled')
  .option("-e, --existing-browser [value]", "use an existing browser")
  .option("-s, --store","store the downloaded resources. By default store all")
  .parse(process.argv);

var SITE_LOADED = SITES_DONE = false;

async function launch() {
  const options = {
    // executablePath: "/usr/bin/google-chrome-stable",
    executablePath: "/vault-swift/goelayu/tools/chromium/src/out/v90/chrome",
    args: [
      "--ignore-certificate-errors" /*, '--blink-settings=scriptEnabled=false'*/,
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process,CrossSiteDocumentBlockingAlways,CrossSiteDocumentBlockingIfIsolating",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  };

  var browserlessargs = [
    '--autoplay-policy=user-gesture-required', // https://source.chromium.org/search?q=lang:cpp+symbol:kAutoplayPolicy&ss=chromium
    '--disable-blink-features=AutomationControlled', // https://blog.m157q.tw/posts/2020/09/11/bypass-cloudflare-detection-while-using-selenium-with-chromedriver/
    '--disable-cloud-import',
    '--disable-component-update', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableComponentUpdate&ss=chromium
    '--disable-domain-reliability', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableDomainReliability&ss=chromium
    '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process', // https://source.chromium.org/search?q=file:content_features.cc&ss=chromium
    '--disable-gesture-typing',
    '--disable-infobars',
    '--disable-notifications',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-offer-upload-credit-cards',
    '--disable-print-preview', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisablePrintPreview&ss=chromium
    '--disable-setuid-sandbox', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSetuidSandbox&ss=chromium
    '--disable-site-isolation-trials', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSiteIsolation&ss=chromium
    '--disable-speech-api', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSpeechAPI&ss=chromium
    '--disable-tab-for-desktop-share',
    '--disable-translate',
    '--disable-voice-input',
    '--disable-wake-on-wifi',
    '--enable-async-dns',
    '--enable-simple-cache-backend',
    '--enable-tcp-fast-open',
    '--enable-webgl',
    '--force-webrtc-ip-handling-policy=default_public_interface_only',
    '--ignore-gpu-blocklist', // https://source.chromium.org/search?q=lang:cpp+symbol:kIgnoreGpuBlocklist&ss=chromium
    '--no-default-browser-check', // https://source.chromium.org/search?q=lang:cpp+symbol:kNoDefaultBrowserCheck&ss=chromium
    '--no-pings', // https://source.chromium.org/search?q=lang:cpp+symbol:kNoPings&ss=chromium
    '--no-sandbox', // https://source.chromium.org/search?q=lang:cpp+symbol:kNoSandbox&ss=chromium
    '--no-zygote', // https://source.chromium.org/search?q=lang:cpp+symbol:kNoZygote&ss=chromium
    '--prerender-from-omnibox=disabled',
    '--use-gl=swiftshader' // https://source.chromium.org/search?q=lang:cpp+symbol:kUseGl&ss=chromium
  ],
  brozzlerargs = [
    '--disable-background-networking', '--disable-breakpad',
    '--disable-renderer-backgrounding', '--disable-hang-monitor',
    '--disable-background-timer-throttling', '--mute-audio',
    '--disable-web-sockets',
    '--window-size=1100,900', '--no-default-browser-check',
    '--disable-first-run-ui', '--no-first-run',
    '--homepage=about:blank', '--disable-direct-npapi-requests',
    '--disable-web-security', '--disable-notifications',
    '--disable-extensions', '--disable-save-password-bubble',
    '--disable-sync'];

  options.args = browserlessargs.concat(brozzlerargs);


  var browser;
  if (program.existingBrowser){
    browser = await puppeteer.connect({browserURL: program.existingBrowser});
  }
  else browser = await puppeteer.launch(options);
  let page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
  );
  await page.setCacheEnabled(false);

  var cdp = await page.target().createCDPSession();

  await initCDP(cdp);

  //Set global timeout to force kill the browser
  // var gTimeoutValue = program.testing
  //   ? Number.parseInt(program.timeout) * 100
  //   : Number.parseInt(program.timeout) + 20000;
  // console.log("global time out value", gTimeoutValue, program.timeout);

  // loading pages in Chrome
  await loadPageInChrome(page, browser, cdp);
}

var loadPageInChrome = async function (page, browser, cdp) {
  /**
   * Once Chrome is initilized, loop through the list of URLs
   * and launch each of them in a new Chrome Tab.
   */
  var URLs = fs.readFileSync(program.input, "utf-8").split("\n"),
    filePromises = [];
  for (var url of URLs) {
    if (url.length == 0) continue;
    // var globalTimer = globalTimeout(browser, cdp, gTimeoutValue),
    var timeout = program.testing ? Number.parseInt(program.timeout) * 100 : Number.parseInt(program.timeout);
    var nLogs = [],
      pageError = null;
    console.log(`Launching url ${url}`);
    var outputDir = `${program.output}/${extractHostname(url)}`;
    fs.mkdirSync(outputDir, { recursive: true });
    initNetHandlers(cdp, nLogs);
    program.store && initRespHandler(page, outputDir, browser, filePromises)
    await page
      .goto(url, {
        timeout: timeout,
      })
      .catch((err) => {
        console.log("Timer fired before page could be loaded", err);
        pageError = err;
      });

    page.off('response',()=>{});
    if (pageError) {
      continue;
    }
    console.log("Site loaded");

    if (!program.output)
      continue;

    dump(nLogs, `${outputDir}/network.log`);
    // await extractPLT(page, outputDir);
    if (program.store){
      await Promise.all(filePromises);
    }
  }
  if (!program.testing)
    await browser.close();
};

function initRespHandler(page,outputDir, browser, filePromises){
  page.on('response', async (response) => {
    const status = response.status()
    if ((status >= 300) && (status <= 399)) return;
    var resUrl = response.url();
    var filePath = path.basename(url.parse(resUrl).pathname).substring(0,10);
    if (filePath == "") filePath = "index";
    // console.log(filePath)
  
    // fs.writeFileSync(`${outputDir}/${filePath}`, await response.buffer());
    var writePromise = new Promise((resolve, reject) => {
      fs.writeFile(`${outputDir}/${filePath}`, response.buffer(), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    filePromises.push(writePromise);

    // await fs.writeFile(`${outputDir}/${filePath}`, await response.buffer(), async (err) => {
    //   if (SITE_LOADED && SITES_DONE){
    //     await browser.close();
    //   }
    // });
  });
}

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
