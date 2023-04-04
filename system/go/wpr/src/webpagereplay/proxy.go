// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package webpagereplay

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	pb "wpr/src/analyzer/proto"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const errStatus = http.StatusInternalServerError

func makeLogger(req *http.Request, quietMode bool, an string) func(msg string, args ...interface{}) {
	if quietMode {
		return func(string, ...interface{}) {}
	}
	prefix := fmt.Sprintf("%s: ServeHTTP(%s): ", an, req.URL)
	return func(msg string, args ...interface{}) {
		log.Print(prefix + fmt.Sprintf(msg, args...))
	}
}

// fixupRequestURL adds a scheme and host to req.URL.
// Adding the scheme is necessary since RoundTrip doesn't like an empty scheme.
// Adding the host is optional, but makes req.URL print more nicely.
func fixupRequestURL(req *http.Request, scheme string) {
	req.URL.Scheme = scheme
	if req.URL.Host == "" {
		req.URL.Host = req.Host
	}
}

// updateDate is the basic function for date adjustment.
func updateDate(h http.Header, name string, now, oldNow time.Time) {
	val := h.Get(name)
	if val == "" {
		return
	}
	oldTime, err := http.ParseTime(val)
	if err != nil {
		return
	}
	newTime := now.Add(oldTime.Sub(oldNow))
	h.Set(name, newTime.UTC().Format(http.TimeFormat))
}

// updateDates updates "Date" header as current time and adjusts "Last-Modified"/"Expires" against it.
func updateDates(h http.Header, now time.Time) {
	oldNow, err := http.ParseTime(h.Get("Date"))
	h.Set("Date", now.UTC().Format(http.TimeFormat))
	if err != nil {
		return
	}
	updateDate(h, "Last-Modified", now, oldNow)
	updateDate(h, "Expires", now, oldNow)
}

// NewReplayingProxy constructs an HTTP proxy that replays responses from an archive.
// The proxy is listening for requests on a port that uses the given scheme (e.g., http, https).
func NewReplayingProxy(scheme string, transformers []ResponseTransformer, quietMode bool,
	caching bool, az_port int, ps *Proxyshare) http.Handler {
	azaddr := "localhost:" + strconv.Itoa(az_port)
	conn, err := grpc.Dial(azaddr, grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(1024*1024*10)))
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	} else {
		log.Printf("Connected to analyzer server at %s", azaddr)
	}
	client := pb.NewAnalyzerClient(conn)
	return &ReplayingProxy{ps.A, "", scheme, transformers, quietMode, sync.Mutex{}, client, caching, ps}
}

type Proxyshare struct {
	A           *Archive
	ArchiveName string
}

type ReplayingProxy struct {
	A            *Archive
	ArchiveName  string
	scheme       string
	transformers []ResponseTransformer
	quietMode    bool
	Mu           sync.Mutex
	client       pb.AnalyzerClient
	caching      bool
	P            *Proxyshare
}

func (proxy *ReplayingProxy) UpdateArchive(p string) {
	archive, err := OpenArchive(p)
	if err != nil {
		log.Printf("Failed to open archive %s: %v", p, err)
		return
	}
	log.Printf("Updating archive to %s", p)

	archiveName := filepath.Base(p)

	proxy.A = archive
	proxy.ArchiveName = archiveName
	proxy.P.A = archive
}

func requestIsJSHTML(resp *http.Response, req *http.Request) bool {
	// return false
	log.Printf("checking length and code and type for %s: %v %d %s", resp.Request.URL.String(), resp.Header, resp.StatusCode, resp.Header.Get("Content-Type"))
	return (resp.ContentLength == -1 || resp.ContentLength > 500) &&
		resp.StatusCode == 200 &&
		(strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "html") ||
			strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "javascript")) &&
		!strings.Contains(req.URL.Path, ".json")
}

func (proxy *ReplayingProxy) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if req.URL.Path == "/web-page-replay-generate-200" {
		log.Printf("Received /web-page-replay-generate-200 %s", req.URL.String())
		w.WriteHeader(200)
		return
	}
	if req.URL.Path == "/web-page-replay-command-exit" {
		log.Printf("Shutting down. Received /web-page-replay-command-exit")
		os.Exit(0)
		return
	}
	if req.URL.Path == "/web-page-replay-reset-replay-chronology" {
		log.Printf("Received /web-page-replay-reset-replay-chronology")
		log.Printf("Reset replay order to start.")
		proxy.A.StartNewReplaySession()
		return
	}
	if req.URL.Path == "/update-archive-path" {
		proxy.Mu.Lock()
		defer proxy.Mu.Unlock()
		log.Printf("Received /update-archive-path")
		proxy.UpdateArchive(req.URL.RawQuery)
		return
	}
	if req.URL.Path == "/update-shared-object" {
		proxy.Mu.Lock()
		defer proxy.Mu.Unlock()
		log.Printf("Received /update-shared-object")
		proxy.A = proxy.P.A
		proxy.ArchiveName = proxy.P.ArchiveName
		return
	}
	if proxy.A == nil {
		log.Printf("No archive loaded. Returning 404.")
		w.WriteHeader(404)
		return
	}
	fixupRequestURL(req, proxy.scheme)
	logf := makeLogger(req, proxy.quietMode, proxy.ArchiveName)

	// Lookup the response in the archive.
	proxy.Mu.Lock()
	_, storedResp, err := proxy.A.FindRequest(req)
	proxy.Mu.Unlock()
	if err != nil {
		logf("couldn't find matching request: %v", err)
		// dummystr := strings.Repeat("a", 50000)
		// w.Write([]byte(dummystr))
		w.WriteHeader(http.StatusNotFound)
		return
	}
	logf("checking length and code and type for %s: %v %d %s", storedResp.Request.URL.String(), storedResp.Header, storedResp.StatusCode, storedResp.Header.Get("Content-Type"))
	// storedResp.Header.Set("X-CL", storedResp.Header.Get("Content-Length"))
	// query the analyzer server if request is JavaScript or HTML
	if proxy.caching && requestIsJSHTML(storedResp, req) {
		// requestURI := req.URL.String()
		// URI without query string
		requestURI := req.URL.Scheme + "://" + req.URL.Host + req.URL.Path
		body, _ := io.ReadAll(storedResp.Body)

		ce := strings.ToLower(storedResp.Header.Get("Content-Encoding"))
		if ce != "" {
			body, err = decompressBody(ce, body)
			if err != nil {
				log.Printf("Error decompressing body: %v", err)
			} else {
				storedResp.Header.Del("Content-Encoding")
				ce = ""
			}
		}

		bodyString := string(body)
		azargs := pb.AzRequest{Name: requestURI, Body: bodyString,
			Type:     storedResp.Header.Get("Content-Type"),
			Encoding: storedResp.Header.Get("Content-Encoding"),
			Caching:  proxy.caching}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		log.Printf("Calling analyzer server for %s with length %d", requestURI, storedResp.ContentLength)
		azreply, err := proxy.client.Analyze(ctx, &azargs)
		if err != nil {
			log.Printf("Error calling analyzer server: %v", err)
			// storedResp.Body = ioutil.NopCloser(bytes.NewReader(body))
		} else {
			body = []byte(azreply.Body)
		}

		storedResp.Body = io.NopCloser(bytes.NewReader(body))
		storedResp.ContentLength = int64(len(body))
		storedResp.Header.Set("Content-Length", strconv.Itoa(len(body)))
		if ce != "" && storedResp.Header.Get("Content-Encoding") != "" {
			storedResp.Header.Del("Content-Encoding")
		}
		// csp := storedResp.Header.Get("Content-Security-Policy")
		// // add unsafe-inline to script-src
		// if strings.Contains(csp, "script-src") {
		// 	csp = strings.ReplaceAll(csp, "script-src", "script-src 'unsafe-inline'")
		// 	// remove all sha256 hashes
		// 	csp = strings.ReplaceAll(csp, "sha256-", "")
		// 	storedResp.Header.Set("Content-Security-Policy", csp)
		// } else if strings.Contains(csp, "default-src") {
		// 	csp = strings.ReplaceAll(csp, "default-src", "default-src 'unsafe-inline'")
		// 	csp = strings.ReplaceAll(csp, "sha256-", "")
		// 	storedResp.Header.Set("Content-Security-Policy", csp)
		// }
	}

	// dummy code to mimic the static wget based implementation
	// keep this commented
	// if strings.Contains(strings.ToLower(storedResp.Header.Get("Content-Type")), "javascript") {
	// 	body := []byte("console.log('hello world');")
	// 	storedResp.Body = io.NopCloser(bytes.NewReader(body))
	// 	storedResp.ContentLength = int64(len(body))
	// 	storedResp.Header.Set("Content-Length", strconv.Itoa(len(body)))
	// 	if storedResp.Header.Get("Content-Encoding") != "" {
	// 		storedResp.Header.Del("Content-Encoding")
	// 	}
	// }

	defer storedResp.Body.Close()

	// Check if the stored Content-Encoding matches an encoding allowed by the client.
	// If not, transform the response body to match the client's Accept-Encoding.
	clientAE := strings.ToLower(req.Header.Get("Accept-Encoding"))
	originCE := strings.ToLower(storedResp.Header.Get("Content-Encoding"))
	if !strings.Contains(clientAE, originCE) {
		logf("translating Content-Encoding [%s] -> [%s]", originCE, clientAE)
		body, err := ioutil.ReadAll(storedResp.Body)
		if err != nil {
			logf("error reading response body from archive: %v", err)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		body, err = decompressBody(originCE, body)
		if err != nil {
			logf("error decompressing response body: %v", err)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if clientAE != "identity" {
			var ce string
			body, ce, err = CompressBody(clientAE, body)
			if err != nil {
				logf("error recompressing response body: %v", err)
				w.WriteHeader(http.StatusNotFound)
				return
			}
			storedResp.Header.Set("Content-Encoding", ce)
		}
		storedResp.Body = ioutil.NopCloser(bytes.NewReader(body))
		// ContentLength has changed, so update the outgoing headers accordingly.
		if storedResp.ContentLength >= 0 {
			storedResp.ContentLength = int64(len(body))
			storedResp.Header.Set("Content-Length", strconv.Itoa(len(body)))
		}
	}

	// Update dates in response header.
	updateDates(storedResp.Header, time.Now())

	// Transform.
	for _, t := range proxy.transformers {
		t.Transform(req, storedResp)
	}

	// Forward the response.
	logf("serving %v response", storedResp.StatusCode)
	for k, v := range storedResp.Header {
		w.Header()[k] = append([]string{}, v...)
	}
	w.WriteHeader(storedResp.StatusCode)
	if _, err := io.Copy(w, storedResp.Body); err != nil {
		logf("warning: client response truncated: %v", err)
	}
}

// NewRecordingProxy constructs an HTTP proxy that records responses into an archive.
// The proxy is listening for requests on a port that uses the given scheme (e.g., http, https).
func NewRecordingProxy(a *WritableArchive, scheme string, transformers []ResponseTransformer) http.Handler {
	return &recordingProxy{http.DefaultTransport.(*http.Transport), a, scheme, transformers}
}

type recordingProxy struct {
	tr           *http.Transport
	a            *WritableArchive
	scheme       string
	transformers []ResponseTransformer
}

func (proxy *recordingProxy) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if req.URL.Path == "/web-page-replay-generate-200" {
		w.WriteHeader(200)
		return
	}
	if req.URL.Path == "/web-page-replay-command-exit" {
		log.Printf("Shutting down. Received /web-page-replay-command-exit")
		if err := proxy.a.Close(); err != nil {
			log.Printf("Error flushing archive: %v", err)
		}
		os.Exit(0)
		return
	}
	fixupRequestURL(req, proxy.scheme)
	logf := makeLogger(req, false, "")
	// https://github.com/golang/go/issues/16036. Server requests always
	// have non-nil body even for GET and HEAD. This prevents http.Transport
	// from retrying requests on dead reused conns. Catapult Issue 3706.
	if req.ContentLength == 0 {
		req.Body = nil
	}

	// TODO(catapult:3742): Implement Brotli support. Remove br advertisement for now.
	ce := req.Header.Get("Accept-Encoding")
	req.Header.Set("Accept-Encoding", strings.TrimSuffix(ce, ", br"))

	// Read the entire request body (for POST) before forwarding to the server
	// so we can save the entire request in the archive.
	var requestBody []byte
	if req.Body != nil {
		var err error
		requestBody, err = ioutil.ReadAll(req.Body)
		if err != nil {
			logf("read request body failed: %v", err)
			w.WriteHeader(errStatus)
			return
		}
		req.Body = ioutil.NopCloser(bytes.NewReader(requestBody))
	}

	// Make the external request.
	// If RoundTrip fails, convert the response to a 500.
	resp, err := proxy.tr.RoundTrip(req)
	if err != nil {
		logf("RoundTrip failed: %v", err)
		resp = &http.Response{
			Status:     http.StatusText(errStatus),
			StatusCode: errStatus,
			Proto:      req.Proto,
			ProtoMajor: req.ProtoMajor,
			ProtoMinor: req.ProtoMinor,
			Body:       ioutil.NopCloser(bytes.NewReader(nil)),
		}
	}

	// Copy the entire response body.
	responseBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		logf("warning: origin response truncated: %v", err)
	}
	resp.Body.Close()

	// Restore req body (which was consumed by RoundTrip) and record original response without transformation.
	resp.Body = ioutil.NopCloser(bytes.NewReader(responseBody))
	if req.Body != nil {
		req.Body = ioutil.NopCloser(bytes.NewReader(requestBody))
	}
	if err := proxy.a.RecordRequest(req, resp); err != nil {
		logf("failed recording request: %v", err)
	}

	// Restore req and response body which are consumed by RecordRequest.
	if req.Body != nil {
		req.Body = ioutil.NopCloser(bytes.NewReader(requestBody))
	}
	resp.Body = ioutil.NopCloser(bytes.NewReader(responseBody))

	// Transform.
	for _, t := range proxy.transformers {
		t.Transform(req, resp)
	}

	responseBodyAfterTransform, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		logf("warning: transformed response truncated: %v", err)
	}

	// Forward the response.
	logf("serving %d, %d bytes", resp.StatusCode, len(responseBodyAfterTransform))
	for k, v := range resp.Header {
		w.Header()[k] = append([]string{}, v...)
	}
	w.WriteHeader(resp.StatusCode)
	if n, err := io.Copy(w, bytes.NewReader(responseBodyAfterTransform)); err != nil {
		logf("warning: client response truncated (%d/%d bytes): %v", n, len(responseBodyAfterTransform), err)
	}
}
