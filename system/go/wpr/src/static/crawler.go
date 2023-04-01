// Copyright 2023 All Rights Reserved.
// Path: system/go/wpr/src/static/crawler.go

package main

import (
	"bufio"
	"bytes"
	"compress/flate"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/andybalholm/brotli"
)

type logprintf func(msg string, args ...interface{})

type Crawler struct {
	HttpServer  string
	HttpsServer string
	Client      *http.Client
	url2scheme  map[string]string
	logf        logprintf
	net         *NWLog
	lmu         sync.Mutex
	ns          *Netstat
	pending     sync.WaitGroup
	reqs        chan Req
	concurrency int
	dMap        *DupMap
	localDMap   map[string]bool
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

func decompressBody(ce string, compressed []byte) ([]byte, error) {
	var r io.Reader
	switch strings.ToLower(ce) {
	case "gzip":
		var err error
		r, err = gzip.NewReader(bytes.NewReader(compressed))
		if err != nil {
			return nil, err
		}
	case "deflate":
		r = flate.NewReader(bytes.NewReader(compressed))
	case "brotli":
		r = brotli.NewReader(bytes.NewReader(compressed))
	default:
		// Unknown compression type or uncompressed.
		return compressed, errors.New("unknown compression: " + ce)
	}
	// defer r.Close()
	return ioutil.ReadAll(r)
}

func (c *Crawler) HandleResp(resp http.Response, referrer string, useHttps bool, fromCache bool) error {

	if resp.StatusCode != 200 {
		c.logf("Non 200 status for code for %s: %d", resp.Request.URL, resp.StatusCode)
		return nil
	}

	cl := resp.Header.Get("Content-Length")
	c.logf("Headers from server: %v", resp.Header)
	body, _ := io.ReadAll(resp.Body)
	var l int64
	if cl != "" {
		i, _ := strconv.Atoi(cl)
		l = int64(i)
	} else {
		l = int64(len(body))
	}
	if fromCache {
		c.ns.UpdateTotal(l)
	} else {
		c.ns.UpdateWire(l)
		c.ns.UpdateTotal(l)
	}

	ce := resp.Header.Get("Content-Encoding")
	if ce != "" {
		c.logf("Decompressing body")
		var err error
		body, err = decompressBody(ce, body)
		if err != nil {
			c.logf("Error decompressing body: %s %s %v", resp.Request.URL, ce, err)
			return err
		}
	}

	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "html") {
		return c.HandleHTML(&resp, string(body), referrer, useHttps)
	} else if strings.Contains(ct, "javascript") {
		return c.HandleJS(&resp, string(body), referrer, useHttps)
	} else if strings.Contains(ct, "image") {
		return nil
	} else if strings.Contains(ct, "css") {
		return c.HandleCSS(&resp, string(body), referrer, useHttps)
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

			cresp, exists := c.dMap.Get(h, target)
			if exists {
				c.logf("Found cached response for %s", h+p)
				c.HandleResp(cresp, h+p, s, true)
				c.logRR(h+p, 200, err)
				continue
			}

			var portaddr string
			if s {
				portaddr = c.HttpsServer
			} else {
				portaddr = c.HttpServer
			}

			reqURL, err := url.Parse(portaddr + p)
			if err != nil {
				c.logRR(h+p, 0, nil)
				continue
			}

			c.logf("Requesting %s from host %s", reqURL, h)

			req := &http.Request{
				Method: "GET",
				URL:    reqURL,
				Host:   h,
				Header: http.Header{
					"Accept-Encoding": []string{"gzip, deflate, br"},
				},
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
			if resp.StatusCode == 200 {
				c.lmu.Lock()
				c.localDMap[h+p] = true
				c.lmu.Unlock()

				c.dMap.Add(h, target, *resp)
			}

			c.HandleResp(*resp, h+p, s, false)
			c.logRR(h+p, resp.StatusCode, nil)
		}
	}
}

func (c *Crawler) queue(urls []Req) {
	for _, u := range urls {
		t := u.target
		c.lmu.Lock()
		_, ok := c.localDMap[t]
		c.lmu.Unlock()
		if ok {
			c.logf("Already crawled for this page %s", t)
			c.pending.Done()
			continue
		}
		c.logf("Queuing %s", t)
		c.reqs <- u
		c.lmu.Lock()
		c.localDMap[t] = true
		c.lmu.Unlock()
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

func (c *Crawler) HandleCSS(resp *http.Response, body string, referrer string, useHttps bool) error {

	cssu := resp.Request.URL.String()

	c.logf("Handling CSS response from %s", cssu)

	// s, _ := strconv.Atoi(resp.Header.Get("Content-Length"))
	// c.logf("CMP: %s %d %d", resp.Request.URL.String(), len(b), s)

	// c.logf("Extracting CSS URLs from %s with body %s", cssu, string(b))

	rgx, _ := regexp.Compile(`url\(['"]?([^\s"']*)['"]?\)`)
	m := rgx.FindAllStringSubmatch(string(body), -1)

	if len(m) == 0 {
		c.logf("No URLS found in %s", referrer)
		return nil
	} else {
		c.logf("Found CSS %d URLS in %s", len(m), referrer)
	}
	c.pending.Add(len(m))
	reqs := make([]Req, len(m))
	for i, v := range m {
		reqs[i] = Req{target: v[1], referrer: referrer, useHttps: useHttps, caller: "HandleCSS"}
	}

	go c.queue(reqs)

	return nil
}

func (c *Crawler) HandleJS(resp *http.Response, body string, referrer string, useHttps bool) error {

	c.logf("Handling JS response from %s", resp.Request.URL)

	jsurls := xtractJSURLS(body)

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

func (c *Crawler) HandleHTML(resp *http.Response, body string, referrer string, useHttps bool) error {
	htmlu := resp.Request.URL.String()

	c.logf("Handling HTML response from %s", htmlu)

	urls, err := HTMLParser(body, c.logf)
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
	c.localDMap = make(map[string]bool)

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
