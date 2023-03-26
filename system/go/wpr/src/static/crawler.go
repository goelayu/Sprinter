// Copyright 2023 All Rights Reserved.
// Path: system/go/wpr/src/static/crawler.go

package main

import (
	"bufio"
	"bytes"
	"errors"
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
	dupMap      map[string]bool
}

type NWRequest struct {
	Url    string
	Status int
}

type NWLog struct {
	Reqs []NWRequest
	mu   sync.Mutex
}

func HTMLREParser(body string, logf logprintf) ([]string, error) {
	re := regexp.MustCompile(`(http| src="\/\/|\/\/)s?:?[^\s"&')]+\.(svg|png|jpg|jpeg|js|css)[^\s>)'"&]*`)
	matches := re.FindAllString(body, -1)

	urls := []string{}
	for _, m := range matches {
		u := strings.ReplaceAll(m, "\\", "")
		u = strings.ReplaceAll(u, "\"", "")
		u = strings.ReplaceAll(u, "'", "")
		u = strings.ReplaceAll(u, "src=", "")
		logf("Found url using regex from HTML: %s", u)
		urls = append(urls, u)
	}
	return urls, nil
}

func HTMLParser(body io.ReadCloser, logf logprintf) ([]string, error) {
	doc, err := goquery.NewDocumentFromReader(body)
	if err != nil {
		return nil, err
	}

	var urls []string

	doc.Find("script, img, link").Each(func(i int, s *goquery.Selection) {
		src, exists := s.Attr("src")
		if exists {
			logf("Found url using jquery from HTML: %s", src)
			urls = append(urls, src)
		}
		href, exists := s.Attr("href")
		if exists {
			rel, re := s.Attr("rel")
			if re && (rel == "canonical" || rel == "shortlink" || rel == "alternate") {
				logf("Skipping link %s with rel %s", href, rel)
				return
			}
			logf("Found url using jquery from HTML: %s", href)
			urls = append(urls, href)
		}
	})

	dhtml, _ := doc.Html()
	reurls, _ := HTMLREParser(dhtml, logf)

	for _, u := range reurls {
		inurls := false
		for _, u2 := range urls {
			if u == u2 {
				inurls = true
				break
			}
		}
		if !inurls {
			urls = append(urls, u)
		}
	}

	logf("Htmlbody: %s", dhtml)
	logf("Urls: %v", urls)
	return urls, nil
}

func constURL(target string, main string, useHttps bool) (host string, path string, s bool, err error) {

	if !strings.HasPrefix(main, "http") {
		main = "http://" + main
	}
	mainP, err := url.Parse(main)
	if err != nil {
		return "", "", false, err
	}
	targetP, err := url.Parse(target)
	if err != nil {
		return "", "", false, err
	}

	res := mainP.ResolveReference(targetP)
	if res.Host == "" && res.Path == "" {
		return "", "", false, errors.New("Could not resolve url")
	}

	if res.Scheme == "https" {
		useHttps = true
	}
	return res.Host, res.Path, useHttps, nil
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

func (c *Crawler) HandleResp(resp *http.Response, referrer string, useHttps bool) error {
	if resp == nil {
		return nil
	}

	if resp.StatusCode != 200 {
		c.logf("Non 200 status for code for %s: %d", resp.Request.URL, resp.StatusCode)
		return nil
	}

	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "html") {
		return c.HandleHTML(resp, referrer, useHttps)
	} else if strings.Contains(ct, "javascript") {
		return c.HandleJS(resp, referrer, useHttps)
	} else if strings.Contains(ct, "image") {
		return nil
	} else if strings.Contains(ct, "css") {
		return c.HandleCSS(resp, referrer, useHttps)
	} else {
		c.logf("Unknown content type: %s", ct)
	}

	return nil
}

func (c *Crawler) Crawl(target string, referrer string, useHttps bool, caller string) error {
	if c.forceExit {
		c.logf("Force exiting Crawl")
		return errors.New("Force exiting Crawl")
	}

	c.logf("Initiating crawl for %s (referrer: %s): %s", target, referrer, caller)

	h, p, s, err := constURL(target, referrer, useHttps)
	if err != nil {
		return err
	}

	c.net.mu.Lock()
	_, ok := c.dupMap[h+p]
	c.net.mu.Unlock()
	if ok {
		c.logf("Already crawled %s", h+p)
		return nil
	}

	var portaddr string
	if s {
		portaddr = c.HttpsServer
	} else {
		portaddr = c.HttpServer
	}

	reqURL, err := url.Parse(portaddr + p)
	if err != nil {
		return err
	}

	c.logf("Requesting %s from host %s", reqURL, h)

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
		return err
	}

	if location != "" {
		c.logf("Updating host to %s", location)
		lParsed, err := url.Parse(location)
		if err != nil {
			return err
		}
		h = lParsed.Host
	}
	c.logf("Received response from %s with status code %d", reqURL, resp.StatusCode)
	nr := NWRequest{Url: h + p, Status: resp.StatusCode}
	c.net.mu.Lock()
	c.net.Reqs = append(c.net.Reqs, nr)
	if resp.StatusCode == 200 {
		c.dupMap[h+p] = true
	}
	c.net.mu.Unlock()

	c.HandleResp(resp, h+p, s)
	return nil
}

func (c *Crawler) DumpNetLog(outPath string, u string) {
	sanitizecmd := fmt.Sprintf("echo '%s' | sanitize", u)
	sanpage, _ := exec.Command("bash", "-c", sanitizecmd).Output()
	fullpath := fmt.Sprintf("%s/%s/net.log", outPath, string(sanpage))
	err := os.MkdirAll(filepath.Dir(fullpath), 0755)
	if err != nil {
		c.logf("Error creating netlog directory: %s", err)
		return
	}
	f, err := os.Create(fullpath)
	if err != nil {
		c.logf("Error creating netlog file: %s", err)
		return
	}
	writer := bufio.NewWriter(f)

	c.net.mu.Lock()
	for _, v := range c.net.Reqs {
		writer.WriteString(fmt.Sprintf("%s %d\n", v.Url, v.Status))
	}
	c.net.mu.Unlock()
	writer.Flush()
	f.Close()
}

func (c *Crawler) HandleCSS(resp *http.Response, referrer string, useHttps bool) error {
	if c.forceExit {
		c.logf("Force exiting Crawl")
		return nil
	}

	cssu := resp.Request.URL.String()

	c.logf("Handling CSS response from %s", cssu)

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	c.logf("Extracting CSS URLs from %s with body %s", cssu, string(b))

	rgx, _ := regexp.Compile(`url\(['"]?([^\s"']*)['"]?\)`)
	m := rgx.FindAllStringSubmatch(string(b), -1)

	var wg sync.WaitGroup
	wg.Add(len(m))

	for _, v := range m {
		go func(u string) {
			defer wg.Done()
			c.Crawl(u, referrer, useHttps, "HandleCSS")
		}(v[1])
	}

	wg.Wait()

	return nil
}

func (c *Crawler) HandleJS(resp *http.Response, referrer string, useHttps bool) error {
	if c.forceExit {
		c.logf("Force exiting Crawl")
		return nil
	}

	c.logf("Handling JS response from %s", resp.Request.URL)

	jsurls := xtractJSURLS(resp.Body)

	u := resp.Request.URL.String()

	if len(jsurls) == 0 {
		c.logf("No template OR no embedded URLS found in %s", u)
		return nil
	} else {
		c.logf("Found %d embedded URLS in %s", len(jsurls), u)
	}

	var wg sync.WaitGroup
	wg.Add(len(jsurls))

	for _, jsurl := range jsurls {
		go func(jsurl string) {
			c.logf("Crawling %s using signature", jsurl)
			defer wg.Done()
			c.Crawl(jsurl, referrer, useHttps, "HandleJS")
		}(jsurl)
	}
	wg.Wait()

	return nil
}

func (c *Crawler) HandleHTML(resp *http.Response, referrer string, useHttps bool) error {
	if c.forceExit {
		c.logf("Force exiting Crawl")
		return nil
	}

	htmlu := resp.Request.URL.String()

	c.logf("Handling HTML response from %s", htmlu)

	urls, err := HTMLParser(resp.Body, c.logf)
	if err != nil {
		return err
	}

	var wg sync.WaitGroup
	wg.Add(len(urls))

	for _, u := range urls {
		go func(u string) {
			defer wg.Done()
			c.Crawl(u, referrer, useHttps, "HandleHTML")
		}(u)
	}
	wg.Wait()

	return nil
}

func (c *Crawler) Visit(u string) error {

	parsed, err := url.Parse(u)
	if err != nil {
		c.logf("[Visiting page] Error while parsing URL %s: %v", u, err)
		return nil
	}

	useHttps := false

	if parsed.Scheme == "https" {
		useHttps = true
	}

	err = c.Crawl(u, parsed.Host, useHttps, "Visit")
	c.logf("value of parsed.Host is %s", parsed.Host)
	if err != nil {
		c.logf("[Visiting page] Error while crawling %s: %v", u, err)
		return err
	}

	c.logf("Finished crawling Page %s", u)

	return nil
}

func (c *Crawler) VisitWithTimeout(u string, timeout time.Duration, outPath string) error {
	c.logf("Visiting %s with timeout %d", u, timeout)

	c.net = &NWLog{}
	c.net.Reqs = make([]NWRequest, 0)

	c.dupMap = make(map[string]bool)

	c.forceExit = false

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
