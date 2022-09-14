#! /usr/bin/env node

/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *    http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @fileoverview A node.js script that 1) identifies resources missing from a static crawler
 * and then compares against a destination page crawled using a dynamic crawler.
 */

const fs = require("fs");
const program = require("commander");
const netParser = require("./parser/network.js");

program
  .version("0.0.1")
  .option("-s, --source [source]", "The source file")
  .option("-d, --destination [destination]", "The destination file")
  .option("--match-type [matchType]", "The type of match to perform")
  .parse(process.argv);

if (!program.source || !program.destination) {
  console.log("Please specify a source and destination file");
  process.exit(1);
}

var ignoreUrl = function (n) {
  var type = n.type;
  return (
    n.request.method != "GET" ||
    n.url.indexOf("data") == 0 ||
    !n.type ||
    !n.size ||
    n.response.status != 200
  );
};

var matchURLs = function (source, destination, type) {
  if (type == 0) return source == destination;
  else if (type == 1) return source.split("?")[0] == destination.split("?")[0];
};

var getOrigMissing = function () {
  // read the source page's static and dynamic fetches
  var source = fs.readFileSync(`${program.source}/static/fetch.log`, "utf8");
  var destination = fs.readFileSync(
    `${program.destination}/dynamic/network.log`,
    "utf8"
  );

  var sourceURLS = [],
    destinationURLS = [];

  //parse each network log separetely
  source.split("\n").forEach(function (line) {
    if (line.indexOf("--") > -1) {
      var url = line.split(" ")[3];
      sourceURLS.push(url);
    }
  });

  // remove undefined URLs
  sourceURLS = sourceURLS.filter(f=>f);

  var dstParsed = netParser.parseNetworkLogs(JSON.parse(destination));
  for (var n of dstParsed) {
    if (!ignoreUrl(n)) {
      destinationURLS.push(n.url);
    }
  }
  // compare the two lists and return the missing resources
  var missing = [];
  destinationURLS.forEach(function (url) {
    if (!sourceURLS.some((s) => matchURLs(s, url, program.matchType))) {
      missing.push(url);
    }
  });

  console.log(
    `destination: ${destinationURLS.length} source: ${sourceURLS.length} missing: ${missing.length}`
  );
  return missing;
};

console.log(getOrigMissing());
