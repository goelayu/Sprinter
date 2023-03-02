#!/usr/bin/env bash

# Fetch pages using wget and redirect requests using proxy
# so that only the recorded files are fetched

# Usage: ./wget_fidelity.sh <pages> <recordeddir> <outputdir> <nCrawlers>

GOSYSDIR="/vault-swift/goelayu/balanced-crawler/system/go/wpr";

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
  port=$2
  wgetcmd="wget -q -P$1 --timeout 30 --no-verbose --force-directories --span-hosts \
    --no-parent -e robots=off  \
    -e use_proxy=on \
    -e http_proxy=$port \
    -e https_proxy=$((port+1000) \
    --user-agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36' \
    --warc-file=$1/warc \
    --warc-cdx=on \
    --page-requisites \
    $3"
}


AZPORT=1234
start_az_server $4 $AZPORT $3

start_proxy $2 $4 $AZPORT $3

allcmdfile=$(mktemp)


for i in $(seq 1 $2); do
    http=$((8000+i))
    https=$((9000+i))
    while read site; do
        wgetcmd=$(get_wget_cmd $3 $http $site)
        echo $wgetcmd >> $allcmdfile
    done<$1
done
