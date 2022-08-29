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
mkdir -p $1/$3;
mkdir -p $2/$3;
sudo rm -rf $1/$3/*; 
sudo rm -rf $2/$3/*;
# copy seedUrls.txt to the mounted volume
cp $4 $1/$3/seedUrls.txt;

# start monitoring tools
echo "Starting monitoring tools"
./sys-usage-track.sh $2/$3 &
sysupid=$!;

echo System usage process id $sysupid
docker_flags=" --timeout 90 --scopeType page --combineWARC -w $3 --waitUntil load --headless --userAgent 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36'"
sudo docker run -v $1/$3/:/crawls/ --privileged -it webrecorder/browsertrix-crawler crawl --urlFile /crawls/seedUrls.txt $docker_flags &> $2/$3/run.out

# send ctrl-c to the monitoring tools
# Sending special sig usr since sigint is disabled when running scrip in background
# for more details see https://stackoverflow.com/questions/2524937/how-to-send-a-signal-sigint-from-script-to-script
echo "Sending ctrl-c to the monitoring tools" $sysupid
kill -SIGUSR1 $sysupid;