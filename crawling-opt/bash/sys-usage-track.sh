#! /usr/bin/env bash

# Bash script to track system resource usage
# Specifically, CPU utilization, network usage and disk usage

# $1 -> Path to the output directory

mkdir -p $1

# trap ctrl-c and call ctrl_c()
trap ctrl_c USR1

function ctrl_c() {
        echo "** Trapped CTRL-C"
        echo "** Stopping all processes"
        kill -9 $cpupid;
        # sudo kill -SIGINT $nwpid;
        sudo pkill -SIGINT iftop
        sudo pkill -9 iostat;
} 

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

#start cpu profiling
start_cpu_profile $1 &
cpupid=$!;

start_nw_profle $1 &

start_disk_profile $1

wait


