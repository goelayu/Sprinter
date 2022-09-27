#! /usr/bin/env bash

# This script is a wrapper around grab-site that makes it easier to use

cat ../pages/testcorpus/100pages | while read page; 
do 
  dir=`echo $page | sanitize`;  
  mkdir -p ../data/reuse/100pages/single/$dir/static; 
  echo "(cd ../data/reuse/100pages/single/$dir/static; \
  /vault-swift/goelayu/balanced-crawler/crawlers/grab-site/gs-venv/bin/grab-site --1 \
  --page-requisites-level 2 --no-video --no-sitemaps $page)"; 
done | parallel -j 5