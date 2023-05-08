#!/usr/bin/env bash

# Extracts list of URLs and generates an input file
# for the chrome-distributed crawler

# Usage: ./run.sh <sites_file> <pages_dst> <output> <proxypath> <args> <nCrawlers>
# sites_file: file containing list of URLs
# pages_dst: directory to store downloaded pages
# output: output directory
# proxypath: path to recorded pages
# args: arguments to pass to crawler
# nCrawlers: number of crawlers to spawn

# Example: ./run.sh sites.txt ../../pageshere ../data/output `../data/record/output` "-t 10" 30

# ensure ulimit is large enough
# sudo ulimit -n 100000

trap ctrl_c SIGINT

function ctrl_c() {
    echo "** Trapped CTRL-C"
    echo "** Stopping all processes"
    ps aux | grep sys-usage-track | awk '{print $2}' | xargs kill -9
}

echo "number of arguments: $#"
echo "arguments: $@"
if [ $# -ne 6 ]; then
    echo "Usage: ./run.sh <sites_file> <pages_dst> <output> <wprpath> <args>"
    echo "sites_file: file containing list of URLs"
    echo "pages_dst: directory containing pages per site"
    echo "rundir: run directory -- stored output and copies wprdata to this"
    echo "wprpath: path to recorded pages"
    echo "args: arguments to pass to crawler"
    exit 1
fi

PAGESPERSITE=220
PERSCRIPTCRAWLERS=5
CHROMESCRIPT=../node/chrome-distributed.js
WPRDATA=/w/goelayu/bcrawling/wprdata/500pages

sites_file=$1
pages_dst=$2
rundir=$3/$LOGFILE
urldir=$rundir/urls/
logdir=$rundir/logs
wprpath=$4
args=$5

rm -rf $rundir
mkdir -p $rundir $urldir $logdir $rundir/sys
echo "Created dirs: $rundir $urldir $logdir $rundir/sys"

urlfile=$urldir/urls.txt
infile=$urldir/infile.txt

cat $sites_file > $infile

create_url_file(){
    cat $1 > tmp
    infile=tmp
    urlfile=$2
    rm $urlfile
    for i in $(seq 1 $PAGESPERSITE); do
        while read site; do
            p=`sed -n ${i}p $pages_dst/${site}.txt`;
            [ ! -z "$p" ] && echo $p  >> $urlfile
        done < $infile
    done
    rm tmp
    # head -n1 $urlfile | sponge $urlfile
    # shuffle urlfile
    shuf $urlfile | sponge $urlfile
}

create_url_dist(){
    pagesfile=$1
    ncrawlers=$2
    nscripts=$((ncrawlers / PERSCRIPTCRAWLERS))
    NPAGES=`cat $pagesfile | wc -l`
    disturldir=$urldir/dist
    mkdir -p $disturldir
    
    pageperscript=$((NPAGES / nscripts))
    t=$pageperscript
    h=0
    for i in $(seq 1 $nscripts); do
        h=$((h + pageperscript))
        urlfile=$disturldir/urls-$i.txt
        rm -f $urlfile
        create_url_file <(cat $pagesfile | head -n $h | tail -n $t) $urlfile;
        #  | while read site; do
        #     cat $pages_dst/${site}.txt | head -n $PAGESPERSITE >> $urlfile
        # done
    done
}

crawl_rate(){
    t=0;
    sleep 1; # wait for the first crawl to start
    while true; do
        t=$((t + 1));
        echo -n $t " "; cat $logdir/*-*.log  | grep "Page load time" | wc -l ; sleep 1;
    done > $logdir/crawl_rate.log
}

if [[ "$COPY" == "1" ]]; then
    echo "Copying wprdata"
    while read line; do
        site=`echo $line | cut -d' ' -f1`
        page=`echo $line | cut -d' ' -f2 | sanitize`
        cp $wprpath/$site/$page/data.wprgo $WPRDATA/${page}.wprgo 2>/dev/null &
    done < $urlfile
    wait
    echo "Done copying wprdata"
else
    echo "Not copying wprdata"
fi

# sys usage tracking
sysscript=../../bash/profiling/sys-usage-track.sh

$sysscript $rundir/sys &
sysupid=$!;


# copy the static analysis tool to tmpfs
cp -r /vault-swift/goelayu/balanced-crawler/node/program_analysis/ /run/user/99542426/goelayu/panode/

echo "Starting the az server"
# start the az server
GOROOT="/w/goelayu/uluyol-sigcomm/go";
AZDIR=/vault-swift/goelayu/balanced-crawler/system/go/wpr
[ -z "$AZPORT" ] && AZPORT=`shuf -i 8000-16000 -n 1` && echo "AZPORT: $AZPORT" && KILLAZ=1
(cd $AZDIR; { time GOGC=off GOROOT=${GOROOT} go run src/analyzer/main.go src/analyzer/rewriter.go src/analyzer/genjs.go --port $AZPORT ; } &> $logdir/az.log ) &
azpid=$!

create_crawl_instances_baseline(){
    ncrawlers=$1
    nscripts=$((ncrawlers / PERSCRIPTCRAWLERS))
    echo "Creating $nscripts scripts"
    first=0
    for i in $(seq 1 $nscripts); do
        totalurls=`cat $urlfile | wc -l`;
        scripturls=`echo $totalurls / $nscripts | bc`;
        first=$((first + scripturls));
        echo "Running cmd: node $CHROMESCRIPT -u <(cat $urlfile | awk '{print \$2}' | head -n $first | tail -n $scripturls)\
        -o $rundir --proxy $WPRDATA $args --azaddr "localhost:$AZPORT" -c $PERSCRIPTCRAWLERS"
        { time node $CHROMESCRIPT -u <(cat $urlfile | awk '{print $1}' | head -n $first | tail -n $scripturls) -o $rundir \
        --proxy $WPRDATA $args --azaddr "localhost:$AZPORT" -c $PERSCRIPTCRAWLERS ; } &> $logdir/$LOGFILE-$i.log &
        pids[${i}]=$!
    done
    echo "Waiting for all scripts to finish"
    for pid in ${pids[*]}; do
        wait $pid
    done
    echo "All scripts finished"
}

create_crawl_instances_opt(){
    ncrawlers=$1
    nscripts=$((ncrawlers / PERSCRIPTCRAWLERS))
    for i in $(seq 1 $nscripts); do
        [ ! -f $urldir/dist/urls-$i.txt ] && echo "File $urldir/dist/urls-$i.txt does not exist" && exit 1
        
        urlfile=$urldir/dist/urls-$i.txt
        echo "Running cmd: node $CHROMESCRIPT -u $urlfile -o $rundir --proxy $WPRDATA $args --azaddr "localhost:$AZPORT" -c $PERSCRIPTCRAWLERS &> $logdir/$LOGFILE-$i.log "
        { time node $CHROMESCRIPT -u $urlfile -o $rundir --id $((i-1)) --proxy $WPRDATA $args --azaddr "localhost:$AZPORT" -c $PERSCRIPTCRAWLERS ; } &> $logdir/$LOGFILE-$i.log &
        pids[${i}]=$!
    done
    echo "Waiting for all scripts to finish"
    for pid in ${pids[*]}; do
        wait $pid
    done
}

if [[ "$RUN" == "baseline" ]]; then
    if [[ "$URLS" == 1 ]]; then
        echo "Creating the default url file"
        create_url_file $infile $urlfile
    else
        echo "Skipping url file creation"
        shuf $infile > $urlfile
    fi
    echo "Starting the baseline crawling script"
    crawl_rate &
    crawlratepid=$!
    create_crawl_instances_baseline $6
    elif [[ "$RUN" == "opt" ]]; then
    if [[ "$URLS" == 1 ]]; then
        echo "Creating the optimized url file"
        create_url_dist $infile $6
    else
        echo "Skipping url file creation"
    fi
    echo "Starting the optimized crawling script"
    crawl_rate &
    crawlratepid=$!
    create_crawl_instances_opt $6
else
    echo "Invalid run type"
fi


# kill the resource usage scripts
echo "Sending ctrl-c to the monitoring tools" $sysupid
kill -SIGUSR1 $sysupid;
# kill all usage scripts
ps aux | grep sys-usage-track | grep -v grep | awk '{print $2}' | xargs kill -9

# kill the az server
# [ ! -z "$KILLAZ" ] && echo "Killing the az server" && ps aux | grep $AZPORT | grep -v grep | awk '{print $2}' | xargs kill -SIGINT


kill $crawlratepid;
# wait a couple seconds for the az server to finish
sleep 2