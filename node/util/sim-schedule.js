/**
 * This script can simulate a single core schedule on a multi threaded 
 * system.
 */

const fs = require('fs');
const program = require('commander');


program
  .option('-d, --distribution <distribution>', 'distribution of load times')
  .option('-p, --parallel <parallel>', 'number of parallel requests', parseInt)
  .option('-v, --verbose', 'enable verbose logging')
  .parse(process.argv);

var initJobs = function(distribution, nJobs, curJobs){
  for (var i =0; i<nJobs;i++){
    if (!distribution.length) break;
    curJobs[i]=distribution.shift();
  }
  return curJobs;
}

var parallelExecTime = function(){
  var curJobs = [];
  var distribution = fs.readFileSync(program.distribution,'utf-8').split('\n').filter(e=>e).map(e=>parseInt(e));
  var singleTime = distribution.reduce((cur,total)=>{return cur + total},0);
  var execTime = 0;
  curJobs = initJobs(distribution, program.parallel, curJobs);
  //assign all jobs
  while (distribution.length){
    program.verbose && console.log(`cur job schedule:`, JSON.stringify(curJobs))
    var min = Math.min(...curJobs)
    execTime += min;
    //update remaining time for each job
    for (var i =0;i<curJobs.length;i++){
      curJobs[i]=curJobs[i]-min;
      if (curJobs[i]==0)
        curJobs[i] = distribution.shift();
      else if (curJobs[i]<0){
        console.error('negative job time found, impossible');
      }
    } 
  }
  program.verbose && console.log(`cur job schedule:`, JSON.stringify(curJobs))
  // remaining time is the largest job time
  execTime += Math.max(...curJobs);
  return [singleTime,execTime];
}

console.log(...parallelExecTime());