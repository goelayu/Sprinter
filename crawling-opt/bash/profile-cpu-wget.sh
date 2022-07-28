#!/usr/bin/env bash

# Profile the total cpu usage of the wget application
# $1 -> file containing list of pages
# $2 -> page requisites flag

mkdir tmpdir

while read site; do
  echo "site is",$site
  mkdir tmpdir/$site
  
  cmd="wget -q -Ptmpdir/$site/ --timeout 30 --no-verbose --adjust-extension --convert-links --force-directories --backup-converted --span-hosts \
    --no-parent -e robots=off \
    --user-agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36' \
    $2 \
    https://$site"
    echo Running cmd $cmd
    eval $cmd
done<$1

#clean up
# rm -r tmpdir