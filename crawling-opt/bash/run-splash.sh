#!/bin/bash

# $1 -> path to output directory
# $2 -> list of pages
# Example run: ./run-splash.sh datadir file-descriptor
# Start the docker service once

# sudo docker run -d -it -p 8050:8050 --rm scrapinghub/splash

restart_docker(){
  sudo docker kill $(sudo docker ps -q)
  sudo docker run -d -it -p 8050:8050 -v ${PWD}/../adblock:/app/filters/ --rm scrapinghub/splash --disable-ui --filters-path=/app/filters &
  sleep 15
}

restart_docker
count=0
# Iterate through the list of pages
while read site; do
  echo "site is",$site
  count=$((count+1))
  if ! (( $count % 10 )) ; then
    restart_docker
  fi
  mkdir $1/$site
  timeout 10 python3 basic.py https://$site $1/$site/network.har
done<$2
