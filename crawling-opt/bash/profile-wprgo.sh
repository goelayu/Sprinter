#! /usr/bin/env bash

# set -x

# Bash script to launch Chrome based crawling, and 
# using web page replay go to be used as a mitm proxy

# $1 -> Path to archive file containing archived data
# $2 -> path to the output directory containing benchmaking data
# $3 -> Number of parallel browsers
# $4 -> file containing list of sites to crawl

if [ $# -lt 3 ]; then
    echo "insufficient arguments provided"
    cat << EOF
    Usage: bash profile-wprgo.sh <output_dir> <performance_directory> <num_browsers> <file_containing_list_of_sites>
    \$1 -> Path to the output directory for storing archived data
    \$2 -> path to the output directory containing benchmaking data
    \$3 -> Number of parallel browsers
    
EOF
    exit 1
fi 

GOROOT=/w/goelayu/uluyol-sigcomm/go
GOPATH=/vault-swift/goelayu/research-ideas/crawling-opt/crawlers/wprgo/go
http_port=8020
https_port=8080
proxyports=()
top=0
bottom=0

WPRDIR='/vault-swift/goelayu/research-ideas/crawling-opt/crawlers/wprgo/pkg/mod/github.com/catapult-project/catapult/web_page_replay_go@v0.0.0-20220815222316-b3421074fa70'

# clear the mounted volume
mkdir -p $1;
mkdir -p $2;
sudo rm -rf $1/*; 
sudo rm -rf $2/*;

# $1 -> proxy rank
# $2 -> total number of proxies
# $3 -> output directory
launch_wprgo(){
    mkdir -p $3/$2;
    http_port=$(($http_port+1));
    https_port=$(($https_port+1));
    echo "Starting wprgo on port $http_port and $https_port"
    GOROOT=$GOROOT GOPATH=$GOPATH go run src/wpr.go record --http_port $http_port --https_port $https_port $3/$2/$1.wprgo &> $3/$2/$1.wprgo.out &
    wprgo_pid=$!;
    proxyports+=("$http_port");
    sleep 1
}

update_range2(){
  factor=`echo $NPAGES $1 | awk '{print int($1/$2)}'`
  top=`echo $top $factor | awk '{print $1+$2}'`
  bottom=$factor
}

create_tempfile(){
  cat ../pages/alexa_1000 | head -n $NPAGES | shuf > tmpfile
}

# start monitoring tools
echo 'Starting monitoring tools'
./sys-usage-track.sh $2/$3 &
sysupid=$!;

create_tempfile

for i in $(eval echo {1..${3}}); do
  # start proxy
  cd $WPRDIR; launch_wprgo $i $3 $1
  cd -
  update_range2 $3
  CHROME_EXTRA_ARGS="--host-resolver-rules=\"MAP *:80 127.0.0.1:$http_port,MAP *:443 127.0.0.1:$https_port,EXCLUDE localhost\";;--ignore-certificate-errors;;--ignore-certificate-errors-spki-list=PhrPvGIaAMmd29hj8BCZOq096yj7uMpRNHpn5PDxI6I=;;--proxy-server=http=https://127.0.0.1:$https_port";
  echo "CHROME_EXTRA_ARGS='$CHROME_EXTRA_ARGS' ./profile-cpu-chrome.sh ${1}/${3}/${i} ${2}/${3}/${i}.time 0 cur_port $top $bottom";
done | parallel

proxyports+=(55)
# kill the proxies
# for port in ${proxyports[@]}; do
#     echo "killing proxy on port $port"
#     ps aux | grep "http_port=$port" | awk '{print $2}' | xargs kill -SIGINT
# done

ps aux | grep "http_port=*" | awk '{print $2}' | xargs kill -9


# kill the resource usage scripts
echo "Sending ctrl-c to the monitoring tools" $sysupid
kill -SIGUSR1 $sysupid;