// Copyright 2023 All Rights Reserved.
// Path: system/go/wpr/src/static/crawler.go

package main

import (
	"crypto/tls"
	"flag"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"

	"github.com/PuerkitoBio/goquery"
)

type Crawler struct {
	httpServer  string
	httpsServer string
	client      *http.Client
}

func HTMLParser(body io.ReadCloser) []string {
	doc, err := goquery.NewDocumentFromReader(body)
	if err != nil {
		panic(err)
	}

	var jsurls []string
	doc.Find("script").Each(func(i int, s *goquery.Selection) {
		src, exists := s.Attr("src")
		if exists {
			jsurls = append(jsurls, src)
		}
	})

	return jsurls
}

func (c *Crawler) Crawl(u string, host string) *io.ReadCloser {
	log.Printf("Crawling %s from host %s", u, host)

	reqURL, _ := url.Parse(c.httpsServer + u)

	req := &http.Request{
		Method: "GET",
		URL:    reqURL,
		Host:   host,
	}

	resp, err := c.client.Do(req)
	if err != nil {
		panic(err)
	}
	log.Printf("Received response from %s with status code %d", reqURL, resp.StatusCode)
	return &resp.Body
}

func constURL(u string) (host string, path string) {
	if strings.Index(u, "http") == 0 || strings.Index(u, "//") == 0 {
		pu, err := url.Parse(u)
		if err != nil {
			panic(err)
		}
		return pu.Host, pu.Path
	} else if strings.Index(u, "/") == 0 {
		return "/", u
	} else {
		return "", u
	}
}

func (c *Crawler) MainHTML(u string) {

	mainParsed, err := url.Parse(u)
	if err != nil {
		panic(err)
	}

	htmlBody := c.Crawl(mainParsed.Path, mainParsed.Host)
	jsurls := HTMLParser(*htmlBody)

	var wg sync.WaitGroup
	wg.Add(len(jsurls))

	for _, jsurl := range jsurls {
		go func(jsurl string) {
			defer wg.Done()

			jsHost, jsPath := constURL(jsurl)
			if jsHost == "" {
				jsHost = mainParsed.Host
				jsPath = mainParsed.Path + jsPath
			} else if jsHost == "/" {
				jsHost = mainParsed.Host
			}
			c.Crawl(jsPath, jsHost)
		}(jsurl)
	}

	wg.Wait()
	log.Printf("Finished crawling Page %s", u)

}

func main() {

	var u string
	var httpPort int
	var httpsPort int

	flag.IntVar(&httpPort, "http_port", 8080, "http server address")
	flag.IntVar(&httpsPort, "https_port", 8081, "https server address")
	flag.StringVar(&u, "url", "http://www.example.com", "url to crawl")
	flag.Parse()

	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	c := &Crawler{
		client: &http.Client{
			Transport: tr,
		},
		httpServer:  "http://127.0.0.1:" + strconv.Itoa(httpPort),
		httpsServer: "https://127.0.0.1:" + strconv.Itoa(httpsPort),
	}

	c.MainHTML(u)
}
