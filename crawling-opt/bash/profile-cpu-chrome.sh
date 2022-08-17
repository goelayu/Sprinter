#!/usr/bin/env bash

# Profile the total cpu usage of the chrome browser
# Uses the time command, to get the total user + kernel space usage, in seconds. 

# $1 -> path to the output directory
# $2 -> the name of the output file for storing benchmark results
# $3 -> Launch chrome browser
# $4 -> port for chrome debugging
# $5 -> top site index
# $6 -> bottom site index

echo launching chrome with arguments $3 $4 $5 $6
mkdir -p ${1}
#launch the chrome browser
flags=`cat flags`
# port=`shuf -i 9100-9900 -n 1`
if [[ $3 == "1" ]]; then
  echo launching chrome browser
  { time google-chrome-stable $flags $CHROME_EXTRA_ARGS --remote-debugging-port=${4} &> /dev/null; } 2>$2 &
  sleep 1
  node ../node/chrome-single.js -k  -i <(cat tmpfile | awk '{print "https://"$0}' | head -n${5}  | tail -n${6} ) -e "http://127.0.0.1:${4}" -o $1 --timeout 15000 &>${1}/out
else
  echo launching with chrome extra args $CHROME_EXTRA_ARGS
  CHROME_EXTRA_ARGS=$CHROME_EXTRA_ARGS node ../node/chrome-single.js -k  -i <(cat tmpfile | awk '{print "https://"$0}' | head -n${5}  | tail -n${6} ) -o $1 --timeout 15000 &>${1}/out  
fi

