#! /usr/bin/env bash

# Bash script that takes a list of URL
# and using curl identifies the length of each URL
# output format: <url> <length>

# put sleep between curl to avoid getting blocked

# $1 -> Path to the input file
# $2 -> Path to the output file

while read line; do
    l=` curl -sL -A 'Mozilla/5.0 (X11; Linux x86_64; rv:60.0) Gecko/20100101 Firefox/81.0'\
    -o /dev/null -H 'Accept-Encoding: gzip,deflate,br,identity'\
    $line -w '%{size_download}\n'`
    echo $line $l
    sleep 3
done < $1 > $2