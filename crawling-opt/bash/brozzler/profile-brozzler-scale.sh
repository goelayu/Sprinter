#! /usr/bin/env bash

# This script stress tests brozzler and captures 
# the resource usage

# $3 -> Number of browsers
# $2 -> Path for storing the benchmarking results files
# $1-> Path to store rethink and warc outputs

which python
BROZZLERDIR="/vault-swift/goelayu/research-ideas/crawling-opt/crawlers/brozzler"

if [ $# -lt 3 ]; then
    echo "insufficient arguments provided"
    cat << EOF
    Usage: bash profile-brozzle-scale.sh <num_browsers>
    $1 -> number of browsers
EOF
    exit 1
fi 

echo Parallizing $3 Chrome browsers

RETHINKDBDIR=$BROZZLERDIR


start_cpu_profile() {
  # rm -r $1/cpu_profile
  echo "usage,time" > $1/cpu_profile
  t=1
  while true; do 
    u=`cpu-usage-trend`;
    echo $u,$t >> $1/cpu_profile;
    t=$((t+1));
  done
}

start_nw_profle(){
  # rm -r $1/nw_profile
  sudo iftop -t -i ens15f1 < /dev/null > $1/nw_profile
  nwpid=$!
}

start_disk_profile(){
  # rm -r $1/disk_profile
  sudo iostat -d 2 > $1/disk_profile &
  diskpid=$!
}

brozzler_cleanup(){
  # remove pending chrome and instances
  pkill chrome

  # clean up pending brozzling instances
  ps aux | grep brozzler-easy | awk '{print $2}' | xargs kill -9
  # restart rethinkdb
  rm -rf $RETHINKDBDIR/rethinkdb_store;
  ps aux | grep rethinkdb | awk '{print $2}' | xargs kill -9;
  rethinkdb --config-file $RETHINKDBDIR/rethinkdb.conf &> $RETHINKDBDIR/rethink.log &
  sleep 1
}

is_job_finished(){
  # checks the output file for finished keyword
  while true; do
    if grep -q "job .* FINISHED" $1; then
      return 0
    fi
    sleep 1
  done
}

brozzler_cleanup

echo Done cleaning up 
echo Started rethinkdb
#initilize the output directory
mkdir -p $2/$3
mkdir -p $1/$3
rm -rf $2/$3/*
rm -rf $1/$3/*

#start cpu profiling
start_cpu_profile $2/$3 &
cpupid=$!;

start_nw_profle $2/$3 &

start_disk_profile $2/$3

# allocate new job and start the crawlers
brozzler-new-job $BROZZLERDIR/dummy.yaml;
BROZZLER_EXTRA_CHROME_ARGS="--headless" brozzler-easy -n $3 -d $1/$3 &> $2/$3/brozzler.out

is_job_finished $2/$3/brozzler.out

echo kill the profiling process $cpupid $nwpid $diskpid
kill -9 $cpupid;
# sudo kill -SIGINT $nwpid;
sudo pkill -SIGINT iftop
sudo pkill -9 iostat;
