// Copyright 2023 All Rights Reserved.
// Path: system/go/wpr/src/static/crawler.go

package main

import (
	"flag"
	"log"
	"net/http"
	"net/url"
)

type Crawler struct {
	httpServer  string
	httpsServer string
	client      *http.Client
}

func (c *Crawler) Crawl(u string) {
	// extract hostname and path from url
	pu, err := url.Parse(u)
	if err != nil {
		panic(err)
	}

	reqURL, _ := url.Parse(c.httpServer + pu.Path)

	req := &http.Request{
		Method: "GET",
		URL:    reqURL,
		Host:   pu.Host,
	}

	resp, err := c.client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	log.Printf("Received response from %s with status code %d", reqURL, resp.StatusCode)
}

func main() {

	var u string
	var addr string

	flag.StringVar(&addr, "addr", "localhost:8080/", "server address")
	flag.StringVar(&u, "url", "http://www.example.com", "url to crawl")
	flag.Parse()

	c := &Crawler{
		client:      &http.Client{},
		httpServer:  "http://" + addr,
		httpsServer: "https://" + addr,
	}

	c.Crawl(u)
}
