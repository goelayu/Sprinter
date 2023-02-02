/**
 * A CDP library where the client operations are carrying
 * out in a separate class.
 */

const fs = require("fs");
const { Tracing } = require("chrome-remote-interface-extra");

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

var initConsoleHandlers = function (cdp, cLogs) {
  const console_observe = [
    "Runtime.consoleAPICalled",
    "Runtime.exceptionThrown",
  ];

  console_observe.forEach((method) => {
    cdp.on(method, (params) => {
      cLogs.push({ [method]: params });
    });
  });
};

var enableTracingPerFrame = function (page, outputDir) {
  page.on("framenavigated", async (frame) => {
    // if (frame === page.mainFrame()) return;
    console.log(
      `starting tracing for frame ${
        frame._id
      } with url ${frame.url()} with session Id ${frame._client._sessionId}`
    );
    // var frameTracer = new Tracing(frame._client);
    // page.frameTracers[frame._id] = frameTracer;
    // await frameTracer.start({
    //   path: `${outputDir}/${frame._id}.trace.json`,
    // });
  });
};

var captureResponses = async function (responses) {
  return await Promise.all(
    responses.raw.map(async (response) => {
      var url = response.url();
      var headers = response.headers();
      var status = response.status();
      var data;
      if (
        status && // we actually have an status for the response
        !(status > 299 && status < 400) && // not a redirect
        !(status === 204) // not a no-content response
      ) {
        try {
          data = await response.text();
        } catch (e) {
          data = null;
        }
      }
      var respObj = {
        url: url,
        headers: headers,
        status: status,
        data: data,
      };
      return respObj;
    })
  );
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
    try {
      var nLogs = [],
        cLogs = [],
        startTime,
        endTime,
        responses = { raw: [], final: [] };

      // always turn CDP on
      await initCDP(this._cdp);

      // create output directory recursively if it doesn't exist already
      if (!fs.existsSync(this._options.outputDir)) {
        fs.mkdirSync(this._options.outputDir, { recursive: true });
      }

      if (this._options.webDriver) {
        await this._page.evaluateOnNewDocument(() => {
          'Object.defineProperty(navigator, "webdriver", {value:false})';
        });
        this._options.verbose && console.log("Webdriver disabled");
      }

      if (this._options.userAgent) {
        await this._page.setUserAgent(this._options.userAgent);
        this._options.verbose &&
          console.log("User agent set to: ", this._options.userAgent);
      }

      if (this._options.enableNetwork) {
        initNetHandlers(this._cdp, nLogs);
        this._options.verbose && console.log("Network logging enabled");
      }

      if (this._options.enableConsole) {
        initConsoleHandlers(this._cdp, cLogs);
        this._options.verbose && console.log("Console logging enabled");
      }

      if (this._options.enablePayload) {
        this._page.on("response", async (response) => {
          responses.raw.push(response);
        });
        this._options.verbose && console.log("Payload logging enabled");
      }

      if (this._options.enableTracing) {
        await this._page.tracing.start({
          path: this._options.outputDir + "/trace.json",
        });
        this._page.frameTracers = {};
        // enableTracingPerFrame(this._page, this._options.outputDir);
        this._options.verbose && console.log("Tracing enabled");
      }

      if (this._options.logTime) {
        startTime = process.hrtime();
      }

      if (this._options.emulateCPU) {
        await this._page.emulateCPUThrottling(this._options.emulateCPU);
        this._options.verbose && console.log("CPU throttling enabled");
      }

      if (this._options.emulateNetwork) {
        //https://github.com/WPO-Foundation/webpagetest/blob/master/www/settings/connectivity.ini.sample
        var opt = {
          latency: 150,
          downloadThroughput: 1600000,
          uploadThroughput: 768000,
        };
        await this._cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: opt.latency,
          downloadThroughput: opt.downloadThroughput,
          uploadThroughput: opt.uploadThroughput,
        });
        this._options.verbose && console.log("Network throttling enabled");
      }

      // await this._page._client.send("Target.setAutoAttach", {
      //   autoAttach: true,
      //   flatten: true,
      //   windowOpen: true,
      //   waitForDebuggerOnStart: true, // is set to false in pptr
      // });

      // this._page._client.on("Target.attachedToTarget", async (event) => {
      //   console.log('attached to target');
      //   console.log(event.targetInfo);
      // });
      // load the page
      await this._page
        .goto(this._options.url, {
          timeout: this._options.timeout * 1000,
          waituntill: "networkidle2",
        })
        .catch((err) => {
          console.log(err);
          this._options.closeBrowserOnError && this._page.browser().close();
        });

      if (this._options.logTime) {
        endTime = process.hrtime(startTime);
        console.log(
          `[${this._options.url}][${this._options.logId}] Page load time: `,
          endTime[0] + endTime[1] / 1e9
        );
      }

      this._options.verbose && console.log("Page loaded");

      if (this._options.enableNetwork) {
        fs.writeFileSync(
          this._options.outputDir + "/network.json",
          JSON.stringify(nLogs, null, 2)
        );
      }

      if (this._options.enableConsole) {
        fs.writeFileSync(
          this._options.outputDir + "/console.json",
          JSON.stringify(cLogs, null, 2)
        );
      }

      if (this._options.enablePayload) {
        // await this._page.off("response", () => {});
        responses.final = await captureResponses(responses);

        fs.writeFileSync(
          this._options.outputDir + "/payload.json",
          JSON.stringify(responses.final, null, 2)
        );
        this._options.verbose && console.log("Payload logged");
      }

      if (this._options.enableTracing) {
        await this._page.tracing.stop().catch((err) => {
          console.log(err);
        });
      }

      if (this._options.screenshot) {
        await this._page.screenshot({
          path: this._options.outputDir + "/screenshot.png",
        });
      }
    } catch (err) {
      console.log(`[${this._options.url}] Error: `, err);
    }
  }
}

module.exports = PageClient;
