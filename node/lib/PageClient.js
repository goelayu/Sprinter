/**
 * A CDP library where the client operations are carrying
 * out in a separate class.
 */

const fs = require("fs");

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

class PageClient {
  /**
   * @param {Page|CDPConnection} client
   * @param {object} [options]
   */
  constructor(page, cdp, options = {}) {
    this._page = page;
    this._cdp = cdp;
    this._options = options;
  }

  /**
   * Based on the options values,
   * enables logging of various metrics
   * and loads the page
   * and stops the logging
   * and finally dumps the captured metrics to a file
   */
  async start() {
    var nLogs = [], startTime, endTime;

    // create output directory if it doesn't exist already
    if (!fs.existsSync(this._options.outputDir)) {
      fs.mkdirSync(this._options.outputDir);
    }

    if (this._options.webDriver) {
      await this._page.evaluateOnNewDocument(() => {
        'Object.defineProperty(navigator, "webdriver", {value:false})';
      });
      this._options.verbose && console.log("Webdriver disabled");
    }

    if (this._options.userAgent) {
      await this._page.setUserAgent(this._options.userAgent);
      this._options.verbose && console.log("User agent set to: ", this._options.userAgent);
    }

    if (this._options.enableNetwork) {
      await initCDP(this._cdp);
      nLogs = [];
      initNetHandlers(this._cdp, nLogs);
      this._options.verbose && console.log("Network logging enabled");
    }

    if (this._options.enableTracing) {
      await this._page.tracing.start({
        path: this._options.outputDir + "/trace.json",
      });
      this._options.verbose && console.log("Tracing enabled");
    }

    if (this._options.logTime){
      startTime = process.hrtime();
    }
    // load the page
    await this._page
      .goto(this._options.url, { timeout: this._options.timeout * 1000 })
      .catch((err) => {
        console.log(err);
        this._options.closeBrowserOnError && this._page.browser().close();
      });

    if (this._options.logTime){
      endTime = process.hrtime(startTime);
      console.log("Page load time: ", endTime[0] + endTime[1] / 1e9);
    }

    this._options.verbose && console.log("Page loaded");

    if (this._options.enableNetwork) {
      fs.writeFileSync(
        this._options.outputDir + "/network.json",
        JSON.stringify(nLogs, null, 2)
      );
    }

    if (this._options.enableTracing) {
      await this._page.tracing.stop();
    }

    if (this._options.screenshot){
      await this._page.screenshot({path: this._options.outputDir + "/screenshot.png"});
    }
  }
}

module.exports = PageClient;
