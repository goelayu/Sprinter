#!/usr/bin/env bash

# Extracts the caching statistics from the output folder
# by grepping for certain keywords in the browser console logs

# Usage: ./cachestats.sh <outputdir>
# Example: ./cachestats.sh ../data/output/system/opt/
# outputdir: directory containing the output of the crawler

grep -inr 'all reads satisfied' $1 | grep 'console.json' | wc -l > h &
grep -inr "reads not satisfied" $1 | grep 'console.json' | wc -l > m &
grep -inr "Error in evalReads" $1 | grep 'console.json' | wc -l > e &

wait

hits=`cat h`
misses=`cat m`
errors=`cat e`

rm h m e

#total is sum of all three
total=$((hits + misses + errors))
hitspercentage=`echo "scale=2; $hits / $total * 100" | bc`
missespercentage=`echo "scale=2; $misses / $total * 100" | bc`

echo "Hits: $hits ($hitspercentage%)"
echo "Misses: $misses ($missespercentage%)"
echo "Errors: $errors"

