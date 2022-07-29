#!/usr/bin/env bash

# Profile the total cpu usage of the wget application
# $1 -> file containing list of pages
# $2 -> path to the output directory
# $3 -> page requisites flag

mkdir -p $2

while read site; do
  echo "site is",$site
  mkdir $2/$site
  
  cmd="wget -q -O$2/$site.noio -P$2/$site/ --timeout 30 --no-verbose --force-directories --span-hosts \
    --no-parent -e robots=off \
    --user-agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36' \
    --timeout=10 \
    $3 \
    https://$site" 
    echo Running cmd $cmd
    eval timeout 10 $cmd
done<$1

#clean up
# rm -r tmpdir