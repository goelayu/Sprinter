#! /usr/bin/env bash

# This script runs various Chrome browsers in parallel and 
# simulatenously captures various performance metrics
# such as CPU utilization, network usage and disk usage. 

# $1 -> path for storing the output files
# $2 -> Path for storing the per job completion times
# $3 -> Number of browsers to launch in parallel



if [ $# -lt 3 ]; then
    echo "insufficient arguments provided"
    cat << EOF
    Usage: bash profile-all-chrome-parallel.sh <output_dir> <performance_directory> <num_browsers> 
    $1 -> path for storing the output files
    $2 -> Path for storing the per job completion times
    $3 -> Number of browsers to launch in parallel
    
EOF
    exit 1
fi 

echo Parallizing $3 Chrome browsers

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

init_range(){
  if [[ $1 == 5 ]]; then 
    top=20
    bottom=20
  elif [[ $1 == 10 ]]; then
    top=10
    bottom=10
    next=10
  elif [[ $1 == 15 ]]; then
    top=7
    bottom=7
  fi
}

update_range(){
  if [[ $1 == 5 ]]; then 
    top=20
    bottom=20
  elif [[ $1 == 10 ]]; then
    top=$((top+next))
    # bottom=$((bottom+next))
    next=$((-next))
  elif [[ $1 == 15 ]]; then
    if [[ $top == 7 ]]; then
      top=14
      bottom=7
    elif [[ $top == 14 ]]; then
      top=20
      bottom=6
    elif [[ $top == 20 ]]; then
      top=7
      bottom=7
    fi
  fi
}

# if [[ ! -d $2 ]]; then
#     echo "Output directory doesn't exist"
#     exit 1
# fi

# if [[ ! -d $3 ]]; then
#     echo "performance result directory doesn't exist"
#     exit 1
# fi

# clean up directories
# rm -r $2/*; 
# rm -r $3/*;

# mk new directories for the number of parallel jobs

# clean any residual chrome instances
pkill chrome

mkdir -p $1/$3;
mkdir -p $2/$3;

# clean up directories
rm -r $1/$3/*; 
rm -r $2/$3/*;

start_port=9222;

#start cpu profiling
start_cpu_profile $2/$3 &
cpupid=$!;

start_nw_profle $2/$3 &

start_disk_profile $2/$3

init_range $3

# ./profile-cpu-chrome.sh $2/1/ $1/1 1 &
for i in $(eval echo {1..${3}}); do
  cur_port=$((start_port+i));
  echo "./profile-cpu-chrome.sh ${1}/${3}/${i} ${2}/${3}/${i}.time 1 $cur_port $top $bottom";
  update_range $3 
done | parallel

echo kill the profiling process $cpupid $nwpid $diskpid
kill -9 $cpupid;
# sudo kill -SIGINT $nwpid;
sudo pkill -SIGINT iftop
sudo pkill -9 iostat;