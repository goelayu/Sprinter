/**
 * This is a lighhouse based trace parser.
 * Takes the raw performance timineline data (as generated using the tracing API)
 * and parses and outputs the the timing information in each of the categories.
 */


const TraceProcessor = require("lighthouse/lighthouse-core/lib/tracehouse/trace-processor");
const MainThreadTasks = require("lighthouse/lighthouse-core/lib/tracehouse/main-thread-tasks");
const TaskSummary = require("lighthouse/lighthouse-core/lib/tracehouse/task-summary");
const netParser = require("../lib/network");

// Group tasks by category
var getExecutionTimingsByGroup = function (trace) {
  var tasks = parseTrace(trace);
  /** @type {Map<TaskGroupIds, number>} */
  const result = new Map();

  for (const task of tasks) {
    const originalTime = result.get(task.group.id) || 0;
    result.set(task.group.id, originalTime + task.selfTime);
  }

  return result;
};

var getJSURLs = function (network) {
  const networkRecords = netParser.parseNetworkLogs(network);
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

function getExecutionTimingsByURL(trace, network) {
  var tasks = parseTrace(trace);
  var jsURLs = getJSURLs(network);
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

function parseTrace(trace) {
  const { mainThreadEvents, frames, timestamps } =
    TraceProcessor.processTrace(trace);
  const tasks = MainThreadTasks.getMainThreadTasks(
    mainThreadEvents,
    frames,
    timestamps.traceEnd
  );
  return tasks;
}

module.exports = {
  getExecutionTimingsByGroup,
  getExecutionTimingsByURL,
};
