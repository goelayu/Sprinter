/**
 * A nodeJS based crawler (similar to the browsertrix crawler)
 * that leverages the webpagereplay project as the man in the middle proxy 
 * instead of pywb. 
 * Also supports distributed crawling, by leveraging 
 * multiple browser based crawlers. 
 */

const program = require('commander');
const puppeteer = require('puppeteer');
const fs = require('fs');
const child_process = require("child_process");
const { Cluster } = require('puppeteer-cluster');

const GOROOT='/w/goelayu/uluyol-sigcomm/go'
const GOPATH='/vault-swift/goelayu/research-ideas/crawling-opt/crawlers/wprgo/go'
const WPRDIR='/vault-swift/goelayu/research-ideas/crawling-opt/crawlers/wprgo/pkg/mod/github.com/catapult-project/catapult/web_page_replay_go@v0.0.0-20220815222316-b3421074fa70'

program
  .option("-u, --urls <urls>", "file containing list of urls to crawl")
  .option("-o, --output <output>", "output directory for storing the crawled data")
  .option("-c, --concurrency <concurrency>", "number of concurrent crawlers to use", parseInt)
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
    ${this.dataOutput} &> ${this.logOutput}`;

    this.process = child_process.spawnSync(cmd, {shell: true, cwd: WPRDIR});
  }

  async stop() {
    this.process.kill('SIGINT');
  }

}

class ProxyManager {
  constructor(nProxies, outputDir){
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
      var p = new Proxy({http_port, https_port, dataOutput, logOutput});
      this.proxies.push(p);
    }

    // start all proxies inside Promise.all
    await Promise.all(this.proxies.map(p => p.start()));
  }

  stopIth(i) {
    this.proxies[i].stop();
  }

  stopAll() {
    this.proxies.forEach(p => p.stop());
  }

  getAll() {
    return this.proxies;
  }

}

var getUrls = (urlFile) => {
  var urls = fs.readFileSync(urlFile, 'utf8').split('\n');
  return urls;
}

async function distributedCrawler(){

  // Initialize the proxies 
  var proxyManager = new ProxyManager(program.concurrency, program.output);
  await proxyManager.createProxies();
  var proxies = proxyManager.getAll();

}