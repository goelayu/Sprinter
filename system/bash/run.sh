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

# ensure ulimit is large enough
sudo ulimit -n 100000

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

# sys usage tracking
sysscript=../../bash/profiling/sys-usage-track.sh
mkdir -p $rundir/sys
rm -rf $rundir/sys/*
$sysscript $rundir/sys &
sysupid=$!;

mkdir -p $rundir/output
# rm -rf $rundir/output/*

# copy the static analysis tool to tmpfs
cp -r /vault-swift/goelayu/balanced-crawler/node/program_analysis/ /run/user/99542426/goelayu/node/

# start the az server
GOROOT="/w/goelayu/uluyol-sigcomm/go";
AZDIR=/vault-swift/goelayu/balanced-crawler/system/go/wpr
AZPORT=`shuf -i 8000-16000 -n 1`
(cd $AZDIR; GOGC=off GOROOT=${GOROOT} go run src/analyzer/main.go src/analyzer/rewriter.go src/analyzer/genjs.go --port $AZPORT &> $rundir/output/az.log ) &
# azpid=$!

{ time node $CHROMESCRIPT -u <(cat $urlfile | awk '{print $2}' | grep sanrio ) -o $rundir/output --proxy $WPRDATA $args --azport $AZPORT ; } &> $LOGDIR/$LOGFILE.log

# kill the resource usage scripts
echo "Sending ctrl-c to the monitoring tools" $sysupid
kill -SIGUSR1 $sysupid;

# kill the az server
ps aux | grep $AZPORT | grep -v grep | awk '{print $2}' | xargs kill -SIGINT