// Copyright 2023 All Rights Reserved.
// Path: system/go/wpr/src/static/crawler.go

package main

import (
	"bufio"
	"bytes"
	"context"
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
	"sync/atomic"
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
	net         *NWLog
	dupMap      map[string]bool
	tBytes      *int64
	pending     sync.WaitGroup
	reqs        chan Req
	concurrency int
}

type Req struct {
	target   string
	referrer string
	useHttps bool
	caller   string
}

type NWRequest struct {
	Url    string
	Status int
	Err    error
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

func HTMLParser(body io.ReadCloser, logf logprintf, tBytes *int64) ([]string, error) {
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
	atomic.AddInt64(tBytes, int64(len(dhtml)))
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

	// logf("Htmlbody: %s", dhtml)
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

func xtractJSURLS(body io.ReadCloser, tBytes *int64) []string {
	buf := new(bytes.Buffer)
	io.Copy(buf, body)
	atomic.AddInt64(tBytes, int64(len(buf.String())))
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
		imBody, err := io.ReadAll(resp.Body)
		if err == nil {
			atomic.AddInt64(c.tBytes, int64(len(imBody)))
		}
		return nil
	} else if strings.Contains(ct, "css") {
		return c.HandleCSS(resp, referrer, useHttps)
	} else {
		c.logf("Unknown content type: %s", ct)
	}

	return nil
}

func (c *Crawler) logRR(u string, s int, e error) {
	c.logf("Logging request for %s: %d %v", u, s, e)
	nr := NWRequest{Url: u, Status: s, Err: e}
	c.net.mu.Lock()
	c.net.Reqs = append(c.net.Reqs, nr)
	c.net.mu.Unlock()
	c.pending.Done()
}

func (c *Crawler) Crawl(ctx context.Context) {

	for {
		c.logf("Waiting for request")
		select {
		case <-ctx.Done():
			c.logf("Context done")
			return
		case r := <-c.reqs:
			target := r.target
			referrer := r.referrer
			useHttps := r.useHttps
			caller := r.caller
			c.logf("Initiating crawl for %s (referrer: %s): %s", target, referrer, caller)

			h, p, s, err := constURL(target, referrer, useHttps)
			if err != nil {
				c.logRR(target, 0, err)
				continue
			}

			// c.net.mu.Lock()
			// _, ok := c.dupMap[h+p]
			// c.net.mu.Unlock()
			// if ok {
			// 	c.logf("Already crawled %s", h+p)
			// 	return nil
			// }

			var portaddr string
			if s {
				portaddr = c.HttpsServer
			} else {
				portaddr = c.HttpServer
			}

			reqURL, err := url.Parse(portaddr + p)
			if err != nil {
				c.logRR(h+p, 0, err)
				continue
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
				c.logRR(h+p, 0, err)
				continue
			}

			if location != "" {
				c.logf("Updating host to %s", location)
				lParsed, err := url.Parse(location)
				if err != nil {
					c.logRR(h+p, 0, err)
					continue
				}
				h = lParsed.Host
			}
			c.logf("Received response from %s with status code %d", reqURL, resp.StatusCode)
			// nr := NWRequest{Url: h + p, Status: resp.StatusCode}
			// c.net.mu.Lock()
			// c.net.Reqs = append(c.net.Reqs, nr)
			// // if resp.StatusCode == 200 {
			// // 	c.dupMap[h+p] = true
			// // }
			// c.net.mu.Unlock()

			c.HandleResp(resp, h+p, s)
			c.logRR(h+p, resp.StatusCode, nil)
		}
	}
}

func (c *Crawler) queue(urls []Req) {
	c.logf("Received new url with value %v", urls)
	for _, u := range urls {
		c.logf("Queueing %v", u)
		c.reqs <- u
	}
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

	cssu := resp.Request.URL.String()

	c.logf("Handling CSS response from %s", cssu)

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	atomic.AddInt64(c.tBytes, int64(len(b)))

	// c.logf("Extracting CSS URLs from %s with body %s", cssu, string(b))

	rgx, _ := regexp.Compile(`url\(['"]?([^\s"']*)['"]?\)`)
	m := rgx.FindAllStringSubmatch(string(b), -1)

	if len(m) == 0 {
		c.logf("No URLS found in %s", referrer)
		return nil
	}
	c.pending.Add(len(m))
	reqs := make([]Req, len(m))
	for i, v := range m {
		reqs[i] = Req{target: v[1], referrer: referrer, useHttps: useHttps, caller: "HandleCSS"}
	}

	go c.queue(reqs)

	return nil
}

func (c *Crawler) HandleJS(resp *http.Response, referrer string, useHttps bool) error {

	c.logf("Handling JS response from %s", resp.Request.URL)

	jsurls := xtractJSURLS(resp.Body, c.tBytes)

	u := resp.Request.URL.String()

	if len(jsurls) == 0 {
		c.logf("No template OR no embedded URLS found in %s", u)
		return nil
	} else {
		c.logf("Found %d embedded URLS in %s", len(jsurls), u)
	}

	c.pending.Add(len(jsurls))
	reqs := make([]Req, len(jsurls))

	for i, jsurl := range jsurls {
		reqs[i] = Req{target: jsurl, referrer: referrer, useHttps: useHttps, caller: "HandleJS"}
	}

	go c.queue(reqs)

	return nil
}

func (c *Crawler) HandleHTML(resp *http.Response, referrer string, useHttps bool) error {
	htmlu := resp.Request.URL.String()

	c.logf("Handling HTML response from %s", htmlu)

	urls, err := HTMLParser(resp.Body, c.logf, c.tBytes)
	if err != nil {
		return err
	}

	if len(urls) == 0 {
		c.logf("No URLs found in %s", referrer)
		return nil
	}

	c.pending.Add(len(urls))
	reqs := make([]Req, len(urls))

	for i, u := range urls {
		r := Req{target: u, referrer: referrer, useHttps: useHttps, caller: "HandleHTML"}
		reqs[i] = r
	}
	go c.queue(reqs)

	return nil
}

func (c *Crawler) Visit(u string, timeout time.Duration, outPath string) error {
	c.logf("Visiting %s with timeout %d", u, timeout)

	c.net = &NWLog{}
	c.net.Reqs = make([]NWRequest, 0)
	c.dupMap = make(map[string]bool)

	waitCh := make(chan struct{})
	c.reqs = make(chan Req)
	defer c.DumpNetLog(outPath, u)

	ctx, cancel := context.WithCancel(context.Background())

	parsed, err := url.Parse(u)
	if err != nil {
		c.logf("[Visiting page] Error while parsing URL %s: %v", u, err)
		return nil
	}

	useHttps := false
	if parsed.Scheme == "https" {
		useHttps = true
	}

	c.pending.Add(1)
	req := Req{target: u, referrer: "", useHttps: useHttps, caller: "Visit"}

	go c.queue([]Req{req})

	for i := 0; i < c.concurrency; i++ {
		go c.Crawl(ctx)
	}

	go func() {
		c.pending.Wait()
		c.logf("Done waiting for pending requests")
		cancel()
		close(waitCh)
	}()

	select {
	case <-waitCh:
		c.logf("Finished crawling page %s", u)
		return nil
	case <-time.After(timeout):
		c.logf("Timeout while crawling Page %s", u)
		cancel()
		// close(c.reqs)
		return nil
	}

}
