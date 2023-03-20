// Copyright 2023 All Rights Reserved.
// Path: system/go/wpr/src/static/crawler.go

package main

import (
	"bytes"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"

	"github.com/PuerkitoBio/goquery"
)

type logprintf func(msg string, args ...interface{})

type Crawler struct {
	HttpServer  string
	HttpsServer string
	Client      *http.Client
	url2scheme  map[string]string
	logf        logprintf
}

func HTMLParser(body io.ReadCloser, logf logprintf) ([]string, error) {
	doc, err := goquery.NewDocumentFromReader(body)
	if err != nil {
		return nil, err
	}

	var jsurls []string
	doc.Find("script").Each(func(i int, s *goquery.Selection) {
		src, exists := s.Attr("src")
		if exists {
			jsurls = append(jsurls, src)
		}
	})

	dhtml, _ := doc.Html()
	logf("Htmlbody: %s", dhtml)
	return jsurls, nil
}

func constURL(u string) (host string, path string, err error) {
	if strings.Index(u, "http") == 0 || strings.Index(u, "//") == 0 {
		pu, err := url.Parse(u)
		if err != nil {
			return "", "", err
		}
		return pu.Host, pu.Path, nil
	} else if strings.Index(u, "/") == 0 {
		return "/", u, nil
	} else {
		return "", u, nil
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

func (c *Crawler) Crawl(u string, host *string, useHttps bool) (*io.ReadCloser, error) {
	h := *host
	c.logf("Crawling %s from host %s", u, h)

	var portaddr string
	if useHttps {
		portaddr = c.HttpsServer
	} else {
		portaddr = c.HttpServer
	}

	reqURL, _ := url.Parse(portaddr + u)

	c.logf("Requesting %s", reqURL)
	c.logf("Host is %s", h)

	req := &http.Request{
		Method: "GET",
		URL:    reqURL,
		Host:   h,
	}

	var location string

	c.Client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		location = req.URL.String()
		c.logf("Redirecting to %s", location)
		return nil
	}

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}

	if location != "" {
		c.logf("Updating host to %s", location)
		lParsed, _ := url.Parse(location)
		*host = lParsed.Host
	}
	c.logf("Received response from %s with status code %d", reqURL, resp.StatusCode)
	return &resp.Body, nil
}

func (c *Crawler) HandleJS(path string, host string) error {
	useHttps := false
	c.logf("Url %s, has scheme %s", host+path, c.url2scheme[host+path])
	if c.url2scheme[host+path] == "https" {
		useHttps = true
	}
	jsbody, err := c.Crawl(path, &host, useHttps)
	if err != nil {
		return err
	}

	jsurls := xtractJSURLS(*jsbody)

	if len(jsurls) == 0 {
		c.logf("No template OR no embedded URLS found in %s", host+path)
		return nil
	} else {
		c.logf("Found %d embedded URLS in %s", len(jsurls), host+path)
	}

	var wg sync.WaitGroup
	wg.Add(len(jsurls))

	for _, jsurl := range jsurls {
		go func(jsurl string) {
			c.logf("Crawling %s", jsurl)
			defer wg.Done()

			jsHost, jsPath, err := constURL(jsurl)
			if err != nil {
				c.logf("Error while parsing URL %s: %v", jsurl, err)
				return
			}
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
		c.logf("[Visiting page] Error while parsing URL %s: %v", u, err)
		return
	}

	useHttps := false

	if mainParsed.Scheme == "https" {
		useHttps = true
	}

	htmlBody, err := c.Crawl(mainParsed.Path, &mainParsed.Host, useHttps)
	c.logf("value of mainParsed.Host is %s", mainParsed.Host)
	if err != nil {
		c.logf("[Visiting page] Error while crawling %s: %v", u, err)
		return
	}
	jsurls, err := HTMLParser(*htmlBody, c.logf)
	if err != nil {
		c.logf("[Visiting page] Error while parsing HTML %s: %v", u, err)
		return
	}

	var wg sync.WaitGroup
	wg.Add(len(jsurls))

	for _, jsurl := range jsurls {
		go func(jsurl string) {
			// c.logf("Crawling %s from %s", jsurl, u)
			defer wg.Done()
			jsHost, jsPath, err := constURL(jsurl)
			if err != nil {
				c.logf("Error while parsing URL %s: %v", jsurl, err)
				return
			}
			if jsHost == "" {
				jsHost = mainParsed.Host
				jsPath = mainParsed.Path + jsPath
			} else if jsHost == "/" {
				jsHost = mainParsed.Host
			}
			err = c.HandleJS(jsPath, jsHost)
			if err != nil {
				c.logf("Error while crawling %s: %v", jsHost+jsPath, err)
			}
		}(jsurl)
	}

	wg.Wait()
	c.logf("Finished crawling Page %s", u)
}
