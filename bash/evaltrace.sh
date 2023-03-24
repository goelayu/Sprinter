#!/usr/bin/env bash

## Takes as input a set of seed URLs
## For each URL, it tries to identify 100 pages on that site
## If 100 pages are found, the resultant 100 URLs are logged
### Repeat the process until 60 such seed URLs are found
###

# Usage: ./evaltrace.sh <seedfile> <numsites> <numpages> <outprefix>

set -e # exit on error
# set -u # exit on undefined variable

tmpdir=/tmp/evaltrace
mkdir -p $tmpdir

seedfile=$1
numsites=$2
numpages=$3
outputdir=$(dirname $0)/../pages/evaltrace/$3
mkdir -p $outputdir

geturls(){
    echo "Getting urls for $1"
    url=$1
    basedir=$(dirname $0)
    scriptpath=$basedir/../pyutils/page_finder_long.py
    timeout 80s python3 $scriptpath http://$url $2 $tmpdir/${url}.txt &>> $tmpdir/${url}.log
    
    # check if 100
    numlines=$(wc -l $tmpdir/${url}.txt | cut -d' ' -f1)
    if [ $numlines -eq $2 ]; then
        echo "Found $2 pages for $url"
        mv $tmpdir/${url}.txt $outputdir
        echo $url >> $outputdir/urls.txt
    fi
}


# read seed file in batches of 30

while mapfile -t -n 30 arry && ((${#arry[@]})); do
    echo "starting batch of 30"
    for url in "${arry[@]}"; do
        geturls $url $numpages &
    done
    wait
    if [[ $(wc -l $outputdir/urls.txt | cut -d' ' -f1) -ge $numsites ]]; then
        break
    fi
done < $1

# cleanup

# rm -rf $tmpdir


