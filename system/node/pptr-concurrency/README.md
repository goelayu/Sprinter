
## New Puppeteer concurrency model
https://github.com/thomasdondorf/puppeteer-cluster#concurreny-models

### Hybrid of Browser and Page concurrency model

Instead of creating new incognito context for every URL 
I reuse the same context, and simply create new page for every URL.

TODO: Can we also reuse the same exact page for every URL?