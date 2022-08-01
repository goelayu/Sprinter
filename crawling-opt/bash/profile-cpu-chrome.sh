#!/usr/bin/env bash

# Profile the total cpu usage of the chrome browser
# Uses the time command, to get the total user + kernel space usage, in seconds. 

# $1 -> path to the output directory

mkdir -p $1
#launch the chrome browser
flags=`cat flags`
{ time google-chrome-stable $flags &> /dev/null; } &

# Connect to this browser 
# and load individual pages
sleep 1
node ../node/chrome-single.js -i <(cat ../pages/alexa_100_news | awk '{print "https://"$0}' | head -n70  | tail -n15  ) -e 'http://127.0.0.1:9222' -o $1 --timeout 10000 -s 2>/dev/null

pkill chrome




