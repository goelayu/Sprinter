#! /usr/bin/env bash

# This bash script profile wprgo based 
# crawling, however the proxy is launched
# inside the node script itself.

# $1 -> Path to archive file containing archived data
# $2 -> path to the output directory containing benchmaking data
# $3 -> Number of parallel browsers
# $4 -> file containing list of sites to crawl

if [ $# -lt 3 ]; then
    echo "insufficient arguments provided"
    cat << EOF
    Usage: bash profile-wprgo.sh <output_dir> <performance_directory> <num_browsers> <file_containing_list_of_sites>
    \$1 -> Path to the output directory for storing archived data
    \$2 -> path to the output directory containing benchmaking data
    \$3 -> Number of parallel browsers
    
EOF
    exit 1
fi 

MAINSCRIPT=../node/crawler-wprgo.js

mkdir -p $2/$3;
mkdir -p $1/$3;
rm -rf $2/$3/*;

echo 'Starting monitoring tools'
./sys-usage-track.sh $2/$3 &
sysupid=$!;


node $MAINSCRIPT -o $1/$3 -c $3 -u $4 -t 15 -m true &> $1/$3/node.out


# kill the resource usage scripts
echo "Sending ctrl-c to the monitoring tools" $sysupid
kill -SIGUSR1 $sysupid;