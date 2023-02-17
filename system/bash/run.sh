#!/usr/bin/env bash

# Extracts list of URLs and generates an input file
# for the chrome-distributed crawler

# Usage: ./run.sh <sites_file> <pages_dst> <output> <proxypath> <args>
# sites_file: file containing list of URLs
# pages_dst: directory to store downloaded pages
# output: output directory
# proxypath: path to recorded pages
# args: arguments to pass to crawler

# Example: ./run.sh sites.txt ../../pageshere ../data/output `../data/record/output` -t 10

echo "number of arguments: $#"
echo "arguments: $@"
if [ $# -ne 5 ]; then
    echo "Usage: ./run.sh <sites_file> <pages_dst> <output> <wprpath> <args>"
    echo "sites_file: file containing list of URLs"
    echo "pages_dst: directory containing pages per site"
    echo "rundir: run directory -- stored output and copies wprdata to this"
    echo "wprpath: path to recorded pages"
    echo "args: arguments to pass to crawler"
    exit 1
fi

NPAGES=100
CHROMESCRIPT=../node/chrome-distributed.js
WPRDATA=/run/user/99542426/goelayu/system/wprdata
LOGDIR=../../logs/eval
tmpdir=/run/user/99542426/goelayu/tmp
mkdir -p $tmpdir

sites_file=$1
pages_dst=$2
rundir=$3
wprpath=$4
args=$5

urlfile=$tmpdir/urls.txt
infile=$tmpdir/infile.txt
rm -f $urlfile

cat $sites_file > $infile

for i in $(seq 1 $NPAGES); do
    while read site; do
        p=`sed -n ${i}p $pages_dst/${site}.txt`;
        echo $site $p >> $urlfile
    done < $infile
done

if [[ -z $COPY ]]; then
    echo "Not copying wprdata"
else
    while read line; do
        site=`echo $line | cut -d' ' -f1`
        page=`echo $line | cut -d' ' -f2 | sanitize`
        cp $wprpath/$site/$page/data.wprgo $WPRDATA/${page}.wprgo &
    done < $urlfile
    wait
fi

mkdir -p $rundir/output
{ time node $CHROMESCRIPT -u <(cat $urlfile | awk '{print $2}') -o $rundir/output --proxy $WPRDATA $args ; } &> $LOGDIR/$LOGFILE.log

