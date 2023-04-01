#! /usr/bin/env bash

# A hybrid run script that launched both dynamic and static crawlers
# First spawns a dynamic crawler (using set cover information) and then
# spawns static crawlers

# Usage: ./run.sh <sites_file> <pages_dst> <output> <proxypath> <args> <nCrawlers>
# sites_file: file containing list of URLs
# pages_dst: directory to store downloaded pages
# output: output directory
# proxypath: path to recorded pages
# args: arguments to pass to crawler
# nCrawlers: number of crawlers to spawn

# Example: ./run.sh sites.txt ../../pageshere ../data/output `../data/record/output` "-t 10" 30

parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
DYNRUN=$parent_path/run.sh
AZPORT=11909
# LOGFILE=hybrid

crawl_rate(){
    t=0;
    while true; do
        t=$((t + 1));
        echo -n $t " "; cat $1/static.log  | grep -a "Finished crawling Page" | wc -l ; sleep 1;
    done > $1/crawl_rate.log
}

sites=$(mktemp)

cat $1 > $sites

AZPORT=11909 URLS=1 COPY=0 RUN=opt LOGFILE=$LOGFILE $DYNRUN $sites $2/dynamic $3 $4 "$5" $6

echo "Dynamic run complete. Starting static crawlers"

GOROOT=/w/goelayu/uluyol-sigcomm/go
WPRDIR=$parent_path/../go/wpr;
WPRDATA=/w/goelayu/bcrawling/wprdata/
mkdir -p $3/$LOGFILE/static
rm -rf $3/$LOGFILE/static/*
mkdir -p $3/$LOGFILE/static/output/

cat $sites | while read i; do
    cat $2/static/$i.txt | head -n10 >> $3/$LOGFILE/static/urls.txt
done

crawl_rate $3/$LOGFILE/static/output/ &
crawlratepid=$!


cd $WPRDIR && GOROOT=$GOROOT time go run src/static/crawler* -az $AZPORT -wpr $WPRDATA -n 1 -v \
-proxy $3/$LOGFILE/static/output/  -pages $3/$LOGFILE/static/urls.txt -azlog $3/$LOGFILE/logs/az.log -sleep 2 &> $3/$LOGFILE/static/output/static.log

echo "Static crawlers complete"

ps aux | grep $AZPORT | awk '{print $2}' | xargs kill -SIGINT
kill $crawlratepid;

sleep 2