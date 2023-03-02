#!/usr/bin/env bash

# Fetch pages using wget and redirect requests using proxy
# so that only the recorded files are fetched

# Usage: ./wget_fidelity.sh <pages> <recordeddir> <outputdir> <nCrawlers>

cleanup(){
    ps aux | grep 'go run' | awk '{print $2}' | xargs kill -9
    ps aux | grep 'exe/wpr' | awk '{print $2}' | xargs kill -9
    rm $sitesfile
    ps aux | grep $AZPORT | awk '{print $2}' | xargs kill -9
}

trap ctrl_c SIGINT

function ctrl_c() {
    echo "** Trapped CTRL-C"
    echo "** Stopping all processes"
    cleanup
}

GOSYSDIR="/vault-swift/goelayu/balanced-crawler/system/go/wpr";
GOROOT="/w/goelayu/uluyol-sigcomm/go"

start_proxy(){
    DUMMYDATA="/vault-swift/goelayu/balanced-crawler/data/record/wpr/test/dummy.wprgo"
    # $1 -> number of proxy instances
    # $2 -> azport
    # $3 -> outputdir
    http=8000
    https=9000
    for i in $(seq 1 $1); do
        http=$((http+1))
        https=$((https+1))
        datapath=$3/$http
        echo $DUMMYDATA > $datapath
        echo "Starting proxy instance $i"
        (cd $GOSYSDIR; GOROOT=$GOROOT go run src/wpr.go replay \
            --http_port $http --https_port $https \
        --az_port $2 $datapath &> $3/proxy-$i.log ) &
    done
}

start_az_server(){
    (cd $GOSYSDIR; GOROOT=$GOROOT go run src/analyzer/main.go \
    src/analyzer/rewriter.go src/analyzer/genjs.go --port $1 &> $2/az.log ) &
}

get_wget_cmd(){
    # $1 -> outputdir
    # $2 -> http port
    # $3 -> site
    # #-S --header='accept-encoding: gzip' \
    port=$2
    mkdir -p $1
    wgetcmd="wget -q -P$1 --no-check-certificate --no-verbose --no-hsts --timeout 30 \
    --force-directories --span-hosts \
    -t 1 \
    --no-parent -e robots=off  \
    -e use_proxy=on \
    -e http_proxy=127.0.0.1:$port \
    -e https_proxy=127.0.0.1:$((port+1000)) \
    --user-agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36' \
    --warc-file=$1/warc \
    --warc-cdx=on \
    --page-requisites \
    $3"
}


AZPORT=1234
start_az_server $AZPORT $3

start_proxy $4 $AZPORT $3

sleep 2

sitesfile=$(mktemp)

cat $1 | awk '{print $2}' > $sitesfile

first=0
for i in $(seq 1 $4); do
    http=$((8000+i))
    https=$((9000+i))
    totalurls=`cat $sitesfile | wc -l`
    perinst=`echo $totalurls / $4 | bc`
    first=$((first+perinst))
    ( cat $sitesfile | head -n $first | tail -n $perinst | while read site; do
            sitename=$(echo $site | sanitize)
            echo $2/$sitename.wprgo > $3/$http
            get_wget_cmd $3/$sitename $http $site
            echo "Running cmd $wgetcmd"
            eval $wgetcmd
    done )
    # pid=$!
    # pids[${i}]=${pid}
done

# wait for all wget instances to finish
# for pid in ${pids[*]}; do
#     wait $pid
# done

#clean up
# sleep 20

cleanup

