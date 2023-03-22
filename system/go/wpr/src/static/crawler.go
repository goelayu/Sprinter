// Copyright 2023 All Rights Reserved.
// Path: system/go/wpr/src/static/crawler.go

package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
)

type logprintf func(msg string, args ...interface{})

type Crawler struct {
	HttpServer  string
	HttpsServer string
	Client      *http.Client
	url2scheme  map[string]string
	logf        logprintf
	forceExit   bool
	net         *NWLog
}

type NWRequest struct {
	Url    string
	Status int
}

type NWLog struct {
	Reqs []NWRequest
}

func HTMLParser(body io.ReadCloser, logf logprintf) ([][2]string, error) {
	doc, err := goquery.NewDocumentFromReader(body)
	if err != nil {
		return nil, err
	}

	var urls []string

	doc.Find("script, img, link").Each(func(i int, s *goquery.Selection) {
		src, exists := s.Attr("src")
		if exists {
			urls = append(urls, src)
		}
		href, exists := s.Attr("href")
		if exists {
			urls = append(urls, href)
		}
	})

	var urls2 [][2]string

	for _, u := range urls {
		pu, _ := url.Parse(u)
		switch filepath.Ext(pu.Path) {
		case ".js":
			urls2 = append(urls2, [2]string{u, "js"})
		case ".css":
			urls2 = append(urls2, [2]string{u, "css"})
		case ".png", ".jpg", ".jpeg", ".gif":
			urls2 = append(urls2, [2]string{u, "image"})
		}
		if strings.Contains(u, "css") {
			urls2 = append(urls2, [2]string{u, "css"})
		}
	}

	dhtml, _ := doc.Html()
	logf("Htmlbody: %s", dhtml)
	logf("Urls: %v", urls2)
	return urls2, nil
}

func constURL(target string, main string) (host string, path string, err error) {
	mainP, err := url.Parse(main)
	if err != nil {
		return "", "", err
	}
	targetP, err := url.Parse(target)
	if err != nil {
		return "", "", err
	}

	res := mainP.ResolveReference(targetP)
	return res.Host, res.Path, nil
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
	if c.forceExit {
		c.logf("Force exiting Crawl")
		return nil, nil
	}

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
	nr := NWRequest{Url: reqURL.String(), Status: resp.StatusCode}
	c.net.Reqs = append(c.net.Reqs, nr)
	return &resp.Body, nil
}

func (c *Crawler) DumpNetLog(outPath string, u string) {
	sanitizecmd := fmt.Sprintf("echo '%s' | sanitize", u)
	sanpage, _ := exec.Command("bash", "-c", sanitizecmd).Output()
	fullpath := fmt.Sprintf("%s/%s.net", outPath, string(sanpage))
	f, err := os.Create(fullpath)
	if err != nil {
		c.logf("Error creating netlog file: %s", err)
		return
	}
	writer := bufio.NewWriter(f)
	defer writer.Flush()
	defer f.Close()

	for _, v := range c.net.Reqs {
		writer.WriteString(fmt.Sprintf("%s %d\n", v.Url, v.Status))
	}
}

func (c *Crawler) HandleCSS(path string, host string, useHttps bool) error {
	if c.forceExit {
		c.logf("Force exiting Crawl")
		return nil
	}

	cssbody, err := c.Crawl(path, &host, useHttps)
	if err != nil {
		return err
	}

	b, err := io.ReadAll(*cssbody)
	if err != nil {
		return err
	}

	rgx, _ := regexp.Compile(`url\((\S*)\)`)
	m := rgx.FindAllStringSubmatch(string(b), -1)

	for _, v := range m {
		h, p, err := constURL(v[1], host+path)
		if err != nil {
			continue
		}
		c.Crawl(p, &h, useHttps)
	}

	return nil
}

func (c *Crawler) HandleJS(path string, host string) error {
	if c.forceExit {
		c.logf("Force exiting Crawl")
		return nil
	}

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

			jsHost, jsPath, err := constURL(jsurl, host+path)
			if err != nil {
				c.logf("Error while parsing URL %s: %v", jsurl, err)
				return
			}
			c.HandleJS(jsPath, jsHost)
		}(jsurl)
	}
	wg.Wait()

	return nil
}

func (c *Crawler) Visit(u string) error {

	mainParsed, err := url.Parse(u)
	if err != nil {
		c.logf("[Visiting page] Error while parsing URL %s: %v", u, err)
		return nil
	}

	useHttps := false

	if mainParsed.Scheme == "https" {
		useHttps = true
	}

	htmlBody, err := c.Crawl(mainParsed.Path, &mainParsed.Host, useHttps)
	c.logf("value of mainParsed.Host is %s", mainParsed.Host)
	if err != nil {
		c.logf("[Visiting page] Error while crawling %s: %v", u, err)
		return err
	}
	urls, err := HTMLParser(*htmlBody, c.logf)
	if err != nil {
		c.logf("[Visiting page] Error while parsing HTML %s: %v", u, err)
		return err
	}

	var wg sync.WaitGroup
	wg.Add(len(urls))

	for _, tup := range urls {
		go func(tup [2]string) {
			url := tup[0]
			t := tup[1]
			// c.logf("Crawling %s from %s", jsurl, u)
			defer wg.Done()
			host, path, err := constURL(url, u)
			if err != nil {
				c.logf("Error while parsing URL %s: %v", url, err)
				return
			}
			switch t {
			case "js":
				err = c.HandleJS(path, host)
				if err != nil {
					c.logf("Error while crawling %s: %v", host+path, err)
				}
			case "image":
				c.Crawl(path, &host, useHttps)
			case "css":
				err = c.HandleCSS(path, host, useHttps)
				if err != nil {
					c.logf("Error while crawling %s: %v", host+path, err)
				}
			}
		}(tup)
	}

	wg.Wait()
	c.logf("Finished crawling Page %s", u)

	return nil
}

func (c *Crawler) VisitWithTimeout(u string, timeout time.Duration, outPath string) error {
	c.logf("Visiting %s with timeout %d", u, timeout)

	c.net = &NWLog{}
	c.net.Reqs = make([]NWRequest, 0)

	defer c.DumpNetLog(outPath, u)

	res := make(chan error)
	go func() {
		res <- c.Visit(u)
	}()

	select {
	case err := <-res:
		return err
	case <-time.After(timeout):
		c.logf("Timeout while visiting %s", u)
		c.logf("Finished crawling Page %s", u)
		c.forceExit = true
		return nil
	}

}
