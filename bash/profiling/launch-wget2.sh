#!/usr/bin/env bash

# Profile the total cpu usage of the wget application
# $1 -> file containing list of pages
# $2 -> path to the output directory
# $3 -> page requisites flag

mkdir -p $2
site=$1
echo "site is",$site
sitedir=`echo $site | sanitize`
dir=$2/$sitedir
mkdir -p $dir
cmd="wget2 -P$dir --timeout 30 --no-verbose --no-directories --span-hosts \
--no-parent -e robots=off \
--user-agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36 Crawls for Research project: https://webresearch.eecs.umich.edu/jawa/' \
--compression=gzip \
$3 \
$site"
echo Running cmd $cmd
eval timeout 15 $cmd >> $2/wget.log 2>&1
# done < $1

