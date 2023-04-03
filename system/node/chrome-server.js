/**
 * An http server which receives a request which contains what URL to load
 * it then simply opens a new page inside chrome and
 */

const fs = require("fs");
const program = require("commander");
const http = require("http");

program
  .option("-p, --port <port>", "Port to listen on", 3000)
  .parse(process.argv);

async function setupBrowser() {
  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  return browser;
}

async function main() {
  const browser = await setupBrowser();
  const server = http.createServer(async (req, res) => {
    var url = req.url.slice(1);
    console.log(url);
    const page = await browser.newPage();
    page.goto(url).then((res) => {
      console.log(`Page for url ${res.url()} loaded`);
      page.close();
    });
    res.end("ok");
  });
  console.log("listening on port " + program.port);
  server.listen(program.port);
}

main();
