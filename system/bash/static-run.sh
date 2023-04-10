#! /usr/bin/env bash

# launches crawlerlcm.go twice.

# $1 -> path to the output directory

parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
sysprofiler=$parent_path/../../bash/profiling/sys-usage-track.sh
crawlerpath=$parent_path/../go/wpr

$sysprofiler $1/output/sys/ &
syspid=$!

cd $crawlerpath;

time GOROOT=/w/goelayu/uluyol-sigcomm/go go run src/static/crawler* src/static/parser.go  \
-az 0 -wpr /mnt/tmpfs/wprdata/ -n 150 -v -proxy $1/output/ -pages <(cat ../../../pages/evaltrace/scapprox/static/*txt | head -n3900) \
-azlog /w/goelayu/bcrawling/system//hybrid/dynamic/logs/azz.log -sleep 3 -remote lions &>  $1/output/static.remote.300.1 &
pids[0]=$!

time GOROOT=/w/goelayu/uluyol-sigcomm/go go run src/static/crawler* src/static/parser.go  \
-az 0 -wpr /mnt/tmpfs/wprdata/ -n 150 -v -proxy $1/output/ -pages <(cat ../../../pages/evaltrace/scapprox/static/*txt | tail -n3900) \
-azlog /w/goelayu/bcrawling/system//hybrid/dynamic/logs/azz.log -sleep 3 -remote redwings &>  $1/output/static.remote.300.2 &
pids[1]=$!

for pid in ${pids[*]}; do
    wait $pid
done

ps aux | grep sys-usage | grep -v grep | awk '{print $2}' | xargs kill -9