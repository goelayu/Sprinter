#! /usr/bin/env bash

# Sanity test the recorded trace

# $1 -> path to the recorded directory of the trace
# $2 -> path to the output directory of the trace

sizerecord=$(du -sh "$1" | cut -f1)
sizeoutput=$(du -sh "$2" | cut -f1)

tmpfile=`mktemp`
getstatuscodedist(){
    find $1 -iname network.json | while read i; do
        cat $i | jq -r '.[]["Network.responseReceived"].response.status' ;
    done | grep -v null > $2
    sort -n $2 | uniq -c | sort -n | sponge $2
}

getstatuscodedist $2 $tmpfile &

wait

echo "Recorded size $1 : $sizerecord"
echo "Output size $1 : $sizeoutput"

echo "Status code distribution"
cat $tmpfile | tail -n5
rm $tmpfile