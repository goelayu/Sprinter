#!/usr/bin/env bash

# Profile the total cpu usage of the chrome browser
# Uses the time command, to get the total user + kernel space usage, in seconds. 

# $1 -> path to the output directory
# $2 -> the name of the output file for storing benchmark results
# $3 -> Launch chrome browser

mkdir -p $1
#launch the chrome browser
flags=`cat flags`
port=`shuf -i 9100-9900 -n 1`
if [[ $3 == "1" ]]; then
  echo launching chrome browser
  { time google-chrome-stable $flags --remote-debugging-port=${port} &> /dev/null; } 2>$2 &
fi;

# Connect to this browser 
# and load individual pages
sleep 1
node ../node/chrome-single.js -i <(cat ../pages/alexa_100_news | awk '{print "https://"$0}' | head -n70  | tail -n20  ) -e "http://127.0.0.1:${port}" -o $1 --timeout 10000 &>$1/out

# pkill chrome
ps aux | grep ${port} | grep chrome | awk '{print $2}' | xargs kill -9


