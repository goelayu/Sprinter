#! /usr/bin/env bash

# This bash script profile wprgo based
# crawling, however the proxy is launched
# inside the node script itself.

# $1 -> Path to archive file containing archived data
# $2 -> path to the output directory containing benchmaking data
# $3 -> Number of parallel browsers
# $4 -> file containing list of sites to crawl
# $5 -> Enable no proxy mode

if [ $# -lt 4 ]; then
    echo "insufficient arguments provided"
    cat << EOF
    Usage: bash profile-wprgo.sh <output_dir> <performance_directory> <num_browsers> <file_containing_list_of_sites>
    \$1 -> Path to the output directory for storing archived data
    \$2 -> path to the output directory containing benchmaking data
    \$3 -> Number of parallel browsers
    \$4 -> file containing list of sites to crawl
    \$5 -> Enable no proxy mode

EOF
    exit 1
fi

MAINSCRIPT=../../node/chrome-distributed.js

mkdir -p $2/$3;
mkdir -p $1/$3;
rm -rf $2/$3/*;
rm -rf $1/$3/*;

echo 'Starting monitoring tools'
./sys-usage-track.sh $2/$3 &
sysupid=$!;

if [[ $5 == "1" ]]; then
    echo 'No proxy mode enabled'
    { time node $MAINSCRIPT -o $1/$3 -c $3 -u $4 -t 10 --noproxy -n --emulateNetwork 1; } &> $1/$3/node.out
else
    echo 'Proxy mode Enabled'
    time node $MAINSCRIPT -o $1/$3 -c $3 -u $4 -t 10 -n &> $1/$3/node.out
fi



# kill the resource usage scripts
echo "Sending ctrl-c to the monitoring tools" $sysupid
kill -SIGUSR1 $sysupid;