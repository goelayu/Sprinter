/**
 * A CDP library where the client operations are carrying
 * out in a separate class.
 */

const fs = require("fs");
const { Tracing } = require("chrome-remote-interface-extra");
const netParser = require("./network.js");
const dag = require("./nw-dag.js");
const URL = require("url");
const filenamify = require("filenamify");

var initCDP = async function (cdp) {
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Profiler.enable");
  await cdp.send("DOM.enable");
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

var initDOMEvents = function (page, cdp, dLogs) {
  // cdp.on("DOM.childNodeCountUpdated", (params) => {
  //   dLogs.push(params);
  // });
  var dom_events = [
    "DOM.attributeModified",
    "DOM.characterDataModified",
    "DOM.childNodeCountUpdated",
    "DOM.childNodeInserted",
    "DOM.documentUpdated",
  ];
  dom_events.forEach((method) => {
    cdp.on(method, (params) => {
      console.log(method, params);
      dLogs.push({ [method]: params });
    });
  });
  // page._client.on("DOM.childNodeCountUpdated", (params) => {
  //   console.log("DOM.childNodeCountUpdated", params);
  //   dLogs.push(params);
  // });
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

var getCacheStats = async function (page, options) {
  var cacheStats = await page.evaluate(() => {
    try {
      return window.__tracer__.getCacheStats();
    } catch (e) {
      return { error: e.message };
    }
  });
  var path = `${options.outputDir}/cache.json`;
  dump(cacheStats, path);
};

var getFileState = async function (page, options, nLogs, benchmark) {
  var starttime;
  benchmark && (starttime = Date.now());
  var state = await page.evaluate(() => {
    try {
      window.__tracer__.resolveLogData();
      return window.__tracer__.serializeLogData();
    } catch (e) {
      return { error: e.message };
    }
  });

  // var domaccess = await page.evaluate(() => {
  //   return window.__domaccess__;
  // });
  // // console.log(domaccess);

  // dump(domaccess, `${options.outputDir}/domaccess.json`);

  benchmark && (benchmark.state.gen += Date.now() - starttime);

  if (!state || state.error) return;

  starttime = Date.now();

  console.log(`extracting javaScript state`);
  var path = `${options.outputDir}/state.json`;

  var newState = combStateWithURLs(state, nLogs);

  benchmark && (benchmark.state.combine += Date.now() - starttime);
  starttime = Date.now();

  if (options.azClient) {
    await options.azClient.storesignature(newState, options.url);
  }
  benchmark && (benchmark.state.send += Date.now() - starttime);
  dump(newState, path);
  dump(state, path + ".old");
};

var combStateWithURLs = function (state, nLogs, domLogs) {
  var netObj = netParser.parseNetworkLogs(nLogs);
  var graph = new dag.Graph(netObj);

  graph.createTransitiveEdges();

  var fetches = graph.transitiveEdges;

  var urlType = {};
  for (var n of netObj) {
    urlType[n.url] = n.type;
    n.response && (urlType[n.response.url] = n.type);
  }

  /**
   * Create a new signature object of the following format:
   * {
   *  key: jsfilename,
   * value:{
   *  state: state,
   *  fetches: [],
   *  inserts: []
   * }
   * }
   */

  var newState = {};

  for (var n of netObj) {
    if (!n.type || n.type.indexOf("script") == -1 || !n.size) continue;
    var _url = n.redirects.length
      ? n.redirects[n.redirects.length - 1].url
      : n.url;
    var pUrl = URL.parse(_url);
    var urlwoquery = pUrl.host + pUrl.pathname;
    var urlwoquery = n.url.split("?")[0];
    var sKey = filenamify(urlwoquery);
    var st = state[sKey];
    var ft = fetches[n.url] ? fetches[n.url].map((e) => [e, urlType[e]]) : [];
    newState[urlwoquery] = {
      state: st ? st : [],
      fetches: ft,
    };
  }

  return newState;
};

var dump = function (data, file) {
  fs.writeFileSync(file, JSON.stringify(data));
};

var enableTracingPerFrame = function (page, outputDir) {
  page.on("framenavigated", async (frame) => {
    // if (frame === page.mainFrame()) return;
    console.log(
      `starting tracing for frame ${
        frame._id
      } with url ${frame.url()} with session Id ${frame._client._sessionId}`
    );
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
        domLogs = [],
        endTime,
        responses = { raw: [], final: [] },
        benchmark = this._options.benchmark,
        starttime;

      // always turn CDP on
      await initCDP(this._cdp);

      await this._page.setBypassCSP(true);

      var parsedUrl = URL.parse(this._options.url),
        prefetchCache = this._options.prefetchCache;

      var getPrefetchURL = function (url) {
        if (url.indexOf("http") == 0 || url.indexOf("//") == 0) return url;
        else if (url.indexOf("/") == 0) return parsedUrl.host + url;
        else return parsedUrl.host + parsedUrl.pathname + url;
      };

      // await this._page.setCacheEnabled(false);

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
        await this._page.setUserAgent(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Crawls for Research project: https://webresearch.eecs.umich.edu/jawa/ "
        );
        // await this._page.setUserAgent(this._options.userAgent);
        // this._options.verbose &&
        //   console.log("User agent set to: ", this._options.userAgent);
      }

      if (this._options.enableNetwork) {
        initNetHandlers(this._cdp, nLogs);
        this._options.verbose && console.log("Network logging enabled");
      }

      if (this._options.enableDOM) {
        initDOMEvents(this._page, this._cdp, domLogs);
        this._options.verbose && console.log("DOM logging enabled");
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

      if (this._options.staticFetch) {
        // extract urls from css files
        await this._page.setRequestInterception(true);

        this._page.on("request", (request) => {
          request.continue();
        });

        this._page.on("response", async (response) => {
          benchmark && (starttime = Date.now());
          var status = response.status();
          if (
            status && // we actually have a status for the response
            !(status > 299 && status < 400) && // not a redirect
            !(status === 204) // not a no-content response
          ) {
            try {
              var request = response.request();
              // if (request.resourceType() === "stylesheet") {
              //   var url = request.url(),
              //     cacheUrl;
              //   var cacheUrl = getPrefetchURL(url);
              //   if (prefetchCache[cacheUrl]) {
              //     return;
              //   } else prefetchCache[cacheUrl] = true;
              //   var css = await response.text();
              //   var re = /url\(["']([^\s\)]*)["']\)/g;
              //   var urls = css.matchAll(re);
              //   for (var u of urls) {
              //     var url = u[1];
              //     if (url[url.length - 1] == ",") {
              //       url = url.substring(0, url.length - 1);
              //     }
              //     console.log("fetching url: ", url, " from css file");
              //     var cacheUrl = getPrefetchURL(url);
              //     if (prefetchCache[cacheUrl]) {
              //       return;
              //     } else prefetchCache[cacheUrl] = true;
              //     this._page
              //       .evaluate((url) => {
              //         var xhr = new XMLHttpRequest();
              //         xhr.open("GET", url, true);
              //         xhr.send();
              //       }, url)
              //       .catch((err) => {
              //         console.log(`Handled error: ${err}`);
              //       });
              //   }
              // } else
              if (request.resourceType() == "document") {
                var url = request.url(),
                  cacheUrl;
                var cacheUrl = getPrefetchURL(url);
                if (prefetchCache[cacheUrl]) {
                  return;
                } else prefetchCache[cacheUrl] = true;
                var html = await response.text();
                var re =
                  /(https?:|\Ssrc="\/?\/|\/\/)[^\s"&')]+\.(svg|png|jpg|jpeg)[^\s>)'"]*/g;
                var urls = html.matchAll(re);
                for (var u of urls) {
                  if (u.length < 2) continue;
                  var url;
                  if (u[1].includes("src=")) {
                    url = u[0].split("src=")[1];
                  } else url = u[0];
                  url = url.replace(/\\/g, "");
                  url = url.replace(/"/g, "");
                  var cacheUrl = getPrefetchURL(url);
                  if (prefetchCache[cacheUrl]) {
                    continue;
                  } else prefetchCache[cacheUrl] = true;
                  console.log("fetching url: ", url, " from html file");
                  this._page
                    .evaluate((url) => {
                      var xhr = new XMLHttpRequest();
                      xhr.open("GET", url, true);
                      xhr.send();
                    }, url)
                    .catch((err) => {
                      console.log(`handled error: ${err}`);
                    });
                }
              }
            } catch (err) {
              console.log("handled error: ", err);
            }
          }
          benchmark && (benchmark.prefetch += Date.now() - starttime);
        });
      }

      var failedLoad = false;
      // await this._page.waitForTimeout(300000);
      // load the page
      await this._page
        .goto(this._options.url, {
          timeout: this._options.timeout * 1000,
          waitUntill: "networkidle2",
        })
        .catch((err) => {
          console.log(`Page goto error: ${err}`);
          failedLoad = true;
          this._options.closeBrowserOnError && this._page.browser().close();
        });

      if (this._options.logTime) {
        endTime = process.hrtime(startTime);
        console.log(
          `[${this._options.url}][${this._options.logId}] Page load time: `,
          endTime[0] + endTime[1] / 1e9
        );
      }
      await this._page.waitForTimeout(2000);

      this._options.verbose && console.log("Page loaded");

      if (this._options.enableNetwork) {
        fs.writeFileSync(
          this._options.outputDir + "/network.json",
          JSON.stringify(nLogs, null, 2)
        );
        this._options.verbose && console.log("network log taken");
      }

      if (this._options.enableScreenshot) {
        await this._page.screenshot({
          path: this._options.outputDir + "/screenshot.png",
        });
        this._options.verbose && console.log("Screenshot taken");
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
          console.log(`Error while stopping trace: ${err}`);
        });
      }

      if (this._options.screenshot) {
        await this._page.screenshot({
          path: this._options.outputDir + "/screenshot.png",
        });
      }

      if (this._options.enableDOM) {
        fs.writeFileSync(
          this._options.outputDir + "/dom.json",
          JSON.stringify(domLogs, null, 2)
        );
        var pagecontent = await this._page.content();
        fs.writeFileSync(
          this._options.outputDir + "/page.html",
          pagecontent,
          "utf8"
        );
      }

      if (failedLoad) {
        return;
      }

      if (this._options.custom) {
        var entries = this._options.custom.split(",");
        for (var e of entries) {
          switch (e) {
            case "state":
              await getFileState(this._page, this._options, nLogs, benchmark);
              await getCacheStats(this._page, this._options);
              break;
          }
        }
      }

      if (this._options.testing) {
        console.log("waiting for __done === true");
        await this._page.waitForFunction("window.__done === true", {
          timeout: this._options.timeout * 10000,
        });
      }

      // await this._page.waitForTimeout(2000);
    } catch (err) {
      console.log(`[${this._options.url}] Error: `, err);
    }
  }
}

module.exports = PageClient;
