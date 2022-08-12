#! /usr/bin/env bash

# This script profiles the browsertrix tool 

# $1 -> Path to the mounted inside the docker container (will be storing the data)
# $2 -> path to the output directory containing benchmaking data
# $3 -> Number of parallel browsers
# $4 -> file containing list of sites to crawl

if [ $# -lt 4 ]; then
    echo "insufficient arguments provided"
    cat << EOF
    Usage: bash profile-browstertrix.sh <output_dir> <performance_directory> <num_browsers> <file_containing_list_of_sites>
    \$1 -> Path to the mounted inside the docker container (will be storing the data)
    \$2 -> path to the output directory containing benchmaking data
    \$3 -> Number of parallel browsers
    \$4 -> file containing list of sites to crawl
    
EOF
    exit 1
fi 

# clear the mounted volume
mkdir -p $1;
mkdir -p $2;
sudo rm -rf $1/*; 
sudo rm -rf $2/*;
# copy seedUrls.txt to the mounted volume
cp $4 $1/seedUrls.txt;

# start monitoring tools
echo "Starting monitoring tools"
./sys-usage-track.sh $2 &
sysupid=$!;

echo System usage process id $sysupid
docker_flags=" --generateWACZ --scopeType page --combineWARC -w $3 --waitUntil load --timeout 15 --headless"
sudo docker run -v $1:/crawls/ --privileged -it webrecorder/browsertrix-crawler crawl --urlFile /crawls/seedUrls.txt $docker_flags &> $2/run.out

# send ctrl-c to the monitoring tools
# Sending special sig usr since sigint is disabled when running scrip in background
# for more details see https://stackoverflow.com/questions/2524937/how-to-send-a-signal-sigint-from-script-to-script
echo "Sending ctrl-c to the monitoring tools" $sysupid
kill -SIGUSR1 $sysupid;