#!/bin/bash
# $1 -> path to the recorded pages
# $2 -> path to the output directory
# $3 -> Mode ( record or replay)
# $4 -> live or archive
# $5 -> list of pages
# Example: ./replay_mahimahi.sh datadir logdir replay live $i" 

# set -v

machine=$(uname -n)
echo machine is $machine


_dir=`shuf -i 9600-9900 -n 1`
CUSTOMCHROMEDIR=/vault-home/goelayu/CHROMEDIR/${_dir}

# mm binaries in /usr/local/bin are ones which inject code while crawling, and no smart match while replay

# mmwebreplay=/home/goelayu/research/mahimahi/build/bin/mm-webreplay #best match
mmwebreplay=mm-webreplay
# mmnoop=/home/goelayu/research/mahimahi/build/bin/mm-noop
mmwebrecord=/home/goelayu/research/mahimahi/build/bin/mm-webrecord #no dyn patches
# mmwebrecord=/usr/local/bin/mm-webrecord #inject dyn patches
# mmwebreplay=/usr/local/bin/mm-webreplay #exact match
if [[ $machine == 'wolverines' || $machine == 'lions' || $machine == 'redwings' || $machine == 'pistons' ]]; then
    echo 'Running on wolverines'
    mmwebreplay=mm-webreplay
    mmwebrecord=mm-webrecord
fi


echo "DATA FLAGS: " $DATAFLAGS
nodeTIMEOUT=0

if [[ $DATAFLAGS == *"testing"* ]]; then
    echo "Running in testing mode..."
    nodeTIMEOUT=1100000
fi

help(){
    echo "Note: The 3rd argument (path to the output directory) shouldn't contain a backslash at the end"
}

clean(){
    rm fetchErrors
    rm loadErrors
}

cleanChromeCache(){
    rm -rf $CUSTOMCHROMEDIR/*
}

# @params: <path to mm dir> <url> <output directory> <url> <mode> <conf file> <multi-loads>
replay(){
    echo "$@"
    echo "url is",$url
    mkdir -p $3
    echo "Launching chrome"
    cmd=""
    if [[ $5 == *"replay"* ]]; then
        cmd="$mmwebreplay $1"
        echo "REPLAY MODE"
    elif [[ $5 == *"record"* ]]; then
        cmd="$mmwebrecord $1"
        echo "RECORD MODE";
    fi;
    
    #avoid 9600 range because a certain kworker runs on port 9645
    port=`shuf -i 9600-9900 -n 1`
    echo "Running on port" $port
    echo "$cmd node chrome-each.js -u $2 -l -o $3 $DATAFLAGS"
    oldhome=$HOME
    export HOME=/home/goelayu
    
    time $cmd node  chrome-each.js -u $2 -l -o $3 $DATAFLAGS
    export HOME=$oldhome
    replay_pid=$!
    echo "Done waiting"
}


# The comparison of count variable is with 2, because for some reason there is an additional
# process started by root on the same node port
waitForNode(){
    count=0
    start_time=`date +'%s'`
    while [[ $count != 1 ]]; do
        count=`ps aux | grep -w $1 | grep -v "mm-" | awk '{print $2}' | wc -l`
        echo "Current count is", $count
        curr_time=`date +'%s'`
        elapsed=`expr $curr_time - $start_time`
        echo $elapsed
        if [ $elapsed -gt $nodeTIMEOUT ]; then
            echo "TIMED OUT..."
            ps aux | grep -w $1 | grep -v "mm-" | awk '{print $2}' | xargs kill -9
        fi
        sleep 2
    done
}


waitForChrome(){
    count=0
    echo "waiting["
    curr_time=`date +'%s'`
    while [[  $count != 3 ]]; do
        count=`ps aux | grep chromium-browser | wc | awk '{print $1}'`
        echo "current count is" $count
        n_time=`date +'%s'`
        elapsed=`expr $n_time - $curr_time`
        echo "Elapsed time since: ", $elapsed
        if [ $elapsed -gt 30 ]; then
            echo "TIMED OUT..."
            ps aux | grep 9222 | awk '{print $2}' | xargs kill -9
        fi
        sleep 1;
    done
}

# help
# clean

# while read url; do
url=$5
echo "replaying url: " $url
clean_url=`echo $url | cut -d'/' -f3-`
clean_url=`echo ${clean_url} | sed 's/\//_/g' | sed 's/\&/-/g'`
if [[ $4 == 'live' ]]; then
    mmpath=$1/${clean_url}
    out=$2/${clean_url}
else
    new_url=`echo $url | cut -d/ -f6`
    echo 'new url is ' $new_url
    ts=`echo $url | cut -d/ -f5`
    # mmpath=$1/${new_url}
    mmpath=$1
    out=$2
fi
toolmode=$3
conf=./chromeConfigs/$4
replay $mmpath $url $out $clean_url $toolmode $conf
# replay $mmpath/1/${clean_url} $url $out/1/${clean_url} $clean_url $4
sleep 2
# done<"$5"