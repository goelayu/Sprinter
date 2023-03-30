/**
 * This is a lighhouse based trace parser.
 * Takes the raw performance timineline data (as generated using the tracing API)
 * and parses and outputs the the timing information in each of the categories.
 */

const fs = require("fs");
const TraceProcessor = require("lighthouse/lighthouse-core/lib/tracehouse/trace-processor");
const MainThreadTasks = require("lighthouse/lighthouse-core/lib/tracehouse/main-thread-tasks");
const TaskSummary = require("lighthouse/lighthouse-core/lib/tracehouse/task-summary");
const netParser = require("../lib/network");
const program = require("commander");

program
  .version("0.0.1")
  .option("-t, --trace [file]", "The trace file to parse")
  .option("-n, --network [file]", "The network file to parse")
  .option("--type [type]", "The type of output category")
  .parse(process.argv);

if (!program.trace) {
  console.log("Please specify a trace file to parse");
  process.exit(1);
}

// Group tasks by category
var getExecutionTimingsByGroup = function (tasks) {
  /** @type {Map<TaskGroupIds, number>} */
  const result = new Map();

  for (const task of tasks) {
    const originalTime = result.get(task.group.id) || 0;
    result.set(task.group.id, originalTime + task.selfTime);
  }

  return result;
};

var getJSURLs = function () {
  const networkRecords = netParser.parseNetworkLogs(
    JSON.parse(fs.readFileSync(program.network, "utf8"))
  );
  return new Set(
    networkRecords
      .filter((record) => {
        return (
          record.type &&
          record.type.indexOf("script") !== -1 &&
          record.status == 200
        );
      })
      .map((record) => record.url)
  );
};

function getExecutionTimingsByURL(tasks, jsURLs) {
  /** @type {Map<string, Record<string, number>>} */
  const result = new Map();

  for (const task of tasks) {
    const attributableURL = TaskSummary.getAttributableURLForTask(task, jsURLs);
    const timingByGroupId = result.get(attributableURL) || {};
    const originalTime = timingByGroupId[task.group.id] || 0;
    timingByGroupId[task.group.id] = originalTime + task.selfTime;
    result.set(attributableURL, timingByGroupId);
  }

  return result;
}

// Read the trace file
const trace = JSON.parse(fs.readFileSync(program.trace, "utf8"));

// Get the main thread events
const { mainThreadEvents, frames, timestamps } =
  TraceProcessor.processTrace(trace);
const tasks = MainThreadTasks.getMainThreadTasks(
  mainThreadEvents,
  frames,
  timestamps.traceEnd
);

if (program.type == "category") {
  const timingsByGroup = getExecutionTimingsByGroup(tasks);
  timingsByGroup.forEach((value, key) => {
    console.log(key, value);
  });
} else if (program.type == "url") {
  if (!program.network) {
    console.log("Please specify a network file to parse");
    process.exit(1);
  }
  const jsURLs = getJSURLs();
  const timingsByURL = getExecutionTimingsByURL(tasks, jsURLs);
  // timingsByURL.forEach((value, key) => {
  //   console.log(value);
  // });
  console.log(JSON.stringify([...timingsByURL]));
}

// Print the timings
