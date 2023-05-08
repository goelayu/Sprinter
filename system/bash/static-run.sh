#! /usr/bin/env bash

# launches crawlerlcm.go twice.

# $1 -> path to the output directory
# $2 -> list of pages to crawl

parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
sysprofiler=$parent_path/../../bash/profiling/sys-usage-track.sh
crawlerpath=$parent_path/../go/wpr

mkdir -p $1/output/sys
mkdir -p $1/output/static

$sysprofiler $1/output/sys/ &
syspid=$!

cd $crawlerpath;
pages=pages
cat $2 | shuf > $pages
len=$(wc -l $pages | awk '{print $1}')
half=$(($len/3))
half=10

time GOROOT=/w/goelayu/uluyol-sigcomm/go go run src/static/crawler* src/static/parser.go  \
-az 0 -wpr /w/goelayu/bcrawling/wprdata -n 10 -v -proxy $1/output/ -pages <(cat $pages | head -n $half) \
-azlog /w/goelayu/bcrawling/system/fidelity/dynamic/memoize/logs/az.log -sleep 3 -remote lions &>  $1/output/static.remote.300.1 &
pids[0]=$!

# time GOROOT=/w/goelayu/uluyol-sigcomm/go go run src/static/crawler* src/static/parser.go  \
# -az 0 -wpr /w/goelayu/bcrawling/500pages -n 150 -v -proxy $1/output/ -pages <(cat $pages | tail -n $half) \
# -azlog /w/goelayu/bcrawling/system//hybrid/dynamic/logs/azz.log -sleep 3 -remote redwings &>  $1/output/static.remote.300.2 &
# pids[1]=$!

# time GOROOT=/w/goelayu/uluyol-sigcomm/go go run src/static/crawler* src/static/parser.go  \
# -az 0 -wpr /w/goelayu/bcrawling/500pages -n 130 -v -proxy $1/output/ -pages <(cat $pages | tail -n $half) \
# -azlog /w/goelayu/bcrawling/system//hybrid/dynamic/logs/azz.log -sleep 3 -remote pistons &>  $1/output/static.remote.300.3 &
# pids[2]=$!

for pid in ${pids[*]}; do
    wait $pid
done

ps aux | grep sys-usage | grep -v grep | awk '{print $2}' | xargs kill -9