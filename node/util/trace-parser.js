/**
 * This is a lighhouse based trace parser.
 * Takes the raw performance timineline data (as generated using the tracing API)
 * and parses and outputs the the timing information in each of the categories.
 */

const fs = require("fs");
const TraceProcessor = require("lighthouse/lighthouse-core/lib/tracehouse/trace-processor");
const MainThreadTasks = require("lighthouse/lighthouse-core/lib/tracehouse/main-thread-tasks");
const program = require("commander");

program
  .version("0.0.1")
  .option("-f, --file [file]", "The trace file to parse")
  .parse(process.argv);

if (!program.file) {
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

// Read the trace file
const trace = JSON.parse(fs.readFileSync(program.file, "utf8"));

// Get the main thread events
const { mainThreadEvents, frames, timestamps } =
  TraceProcessor.processTrace(trace);
const tasks = MainThreadTasks.getMainThreadTasks(
  mainThreadEvents,
  frames,
  timestamps.traceEnd
);

// Get the execution timings by group
const timings = getExecutionTimingsByGroup(tasks);

// Print the timings
timings.forEach((value, key) => {
  console.log(key, value);
});
