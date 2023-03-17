// Copyright 2023 All Rights Reserved.
// Path: system/go/wpr/src/static/crawler.go

package main

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"

	"github.com/PuerkitoBio/goquery"
)

type Crawler struct {
	HttpServer  string
	HttpsServer string
	Client      *http.Client
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

func xtractJSURLS(body io.ReadCloser) []string {
	buf := new(bytes.Buffer)
	io.Copy(buf, body)
	tregex, _ := regexp.Compile(`CODE BEGIN[\s\S]*CODE END`)
	tmplt := tregex.FindString(buf.String())

	if tmplt == "" {
		return []string{}
	}

	var jsurls []string
	urlrgx, _ := regexp.Compile(`fetchVia(DOM|XHR)\("(\S*)"\)`)
	m := urlrgx.FindAllStringSubmatch(tmplt, -1)
	for _, v := range m {
		jsurls = append(jsurls, v[2])
	}

	return jsurls
}

func (c *Crawler) Crawl(u string, host string) (*io.ReadCloser, error) {
	log.Printf("Crawling %s from host %s", u, host)

	var portaddr string
	if strings.Index(u, "https") == 0 {
		portaddr = c.HttpsServer
	} else {
		portaddr = c.HttpServer
	}

	reqURL, _ := url.Parse(portaddr + u)

	req := &http.Request{
		Method: "GET",
		URL:    reqURL,
		Host:   host,
	}

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	log.Printf("Received response from %s with status code %d", reqURL, resp.StatusCode)
	return &resp.Body, nil
}

func (c *Crawler) HandleJS(path string, host string) error {
	jsbody, err := c.Crawl(path, host)
	if err != nil {
		return err
	}

	jsurls := xtractJSURLS(*jsbody)

	if len(jsurls) == 0 {
		log.Printf("No template OR no embedded URLS found in %s", host+path)
		return nil
	}

	var wg sync.WaitGroup
	wg.Add(len(jsurls))

	for _, jsurl := range jsurls {
		go func(jsurl string) {
			defer wg.Done()

			jsHost, jsPath := constURL(jsurl)
			if jsHost == "" {
				jsHost = host
				jsPath = path + jsPath
			} else if jsHost == "/" {
				jsHost = host
			}
			c.HandleJS(jsPath, jsHost)
		}(jsurl)
	}
	wg.Wait()

	return nil
}

func (c *Crawler) Visit(u string) {

	mainParsed, err := url.Parse(u)
	if err != nil {
		panic(err)
	}

	htmlBody, _ := c.Crawl(mainParsed.Path, mainParsed.Host)
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
			err := c.HandleJS(jsPath, jsHost)
			if err != nil {
				log.Printf("Error while crawling %s: %v", jsHost+jsPath, err)
			}
		}(jsurl)
	}

	wg.Wait()
	log.Printf("Finished crawling Page %s", u)
}

// func main() {

// 	var u string
// 	var httpPort int
// 	var httpsPort int

// 	flag.IntVar(&httpPort, "http_port", 8080, "http server address")
// 	flag.IntVar(&httpsPort, "https_port", 8081, "https server address")
// 	flag.StringVar(&u, "url", "http://www.example.com", "url to crawl")
// 	flag.Parse()

// 	tr := &http.Transport{
// 		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
// 	}

// 	c := &Crawler{
// 		client: &http.Client{
// 			Transport: tr,
// 		},
// 		httpServer:  "http://127.0.0.1:" + strconv.Itoa(httpPort),
// 		httpsServer: "https://127.0.0.1:" + strconv.Itoa(httpsPort),
// 	}

// 	c.MainHTML(u)
// }
