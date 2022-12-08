# Lightening Fast Dynamic Web Crawler

## What is it?

Crawling modern web pages involves executing JavaScript code, otherwise a lot of critical resources
will not be loaded. Most crawlers use a headless browser to execute JavaScript code, 
however do so in all its glory, which is extremely computationally expensive. 

For example crawling a corpus of even 100 pages with JavaScript execution enabled can be
as much as 10x slower than crawling the same corpus with JavaScript execution disabled.

This project aims to extract JavaScript's runtime properties, i.e., characteristics about its
execution -- specifically what data is being read and written from the JavaScript heap. 
Based on this information, this crawler safely eliminates JavaScript execution and simply
predicts the output of that code. 

## Potential Savings!

This prototype crawler can save up to 30\% of the time it takes to crawl a corpus of pages.