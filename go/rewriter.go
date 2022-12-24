package main

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/flytam/filenamify"
)

var FILEID uint64 = 0

func check(e error) {
	if e != nil {
		panic(e)
	}
}

func uncompressBody(body string, t string) string {

	var zreader io.Reader
	var output []byte
	reader := bytes.NewReader([]byte(body))
	// uncompress the body
	if strings.Contains(strings.ToLower(t), "gzip") {
		var err error
		zreader, err = gzip.NewReader(reader)
		if err != nil {
			fmt.Println("Error reading gzip body", err)
			output = []byte(body)
		} else {
			output, err = io.ReadAll(zreader)
			if err != nil {
				fmt.Println("Error reading uncompressed body", err)
				panic(err)
			}
		}
	} else if strings.Contains(strings.ToLower(t), "br") {
		zreader = brotli.NewReader(reader)
		var err error
		output, err = io.ReadAll(zreader)
		if err != nil {
			fmt.Println("Error reading uncompressed body", err)
			panic(err)
		}
	} else {
		panic("Unknown compression type: " + t)
	}

	return string(output)
}

func extractBody(body string, h http.Header) string {
	// extract body if it is compressed
	if h.Get("Content-Encoding") != "" {
		body = uncompressBody(body, h.Get("Content-Encoding"))
	}

	// extract body if it is chunked
	// if h.Get("Transfer-Encoding").lower().includes("chunked") {
	// 	body = unchunkBody(body)
	// }

	return body
}

func invokeNode(body string, t string, name string, keepOrig bool) []byte {
	SCRIPTPATH := "../node/program_analysis/instrument.js"
	var mu sync.Mutex
	// store body in a temp file
	tempFile, err := os.CreateTemp("./", "insttmp")
	if err != nil {
		fmt.Println("Error creating temp file", err)
		panic(err)
	}

	// defer os.Remove(tempFile.Name())

	_, err = tempFile.WriteString(body)
	check(err)

	// create a copy of tempFile if keepOrig is true
	if keepOrig {
		origFile, err := os.Create(tempFile.Name() + ".copy")
		if err != nil {
			fmt.Println("Error creating temp file", err)
			panic(err)
		}
		origFile.WriteString(body)
		origFile.Close()
	}

	mu.Lock()
	fileid := atomic.AddUint64(&FILEID, 1)
	cmdString := fmt.Sprintf("node %s -i %s -t '%s' -n '%s' -f %d", SCRIPTPATH, tempFile.Name(), t, name, fileid)
	fmt.Println(cmdString)
	mu.Unlock()
	startTime := time.Now()
	cmd := exec.Command("bash", "-c", cmdString)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	_, err = cmd.Output()
	if err != nil {
		fmt.Println(err.Error() + " with cmd:" + cmdString + "\n" + stderr.String())
		panic(err)
	}
	fmt.Println("Instrumentation took", time.Since(startTime))

	// read the temp file
	tempFile.Seek(0, 0)
	newbody, err := io.ReadAll(tempFile)
	check(err)
	// fmt.Println("newbody is", string(newbody))
	os.Remove(tempFile.Name())
	return newbody
}

func instrument(req *http.Request, resp *http.Response) (*http.Request, *http.Response, error) {

	// Identify if the response is a JavaScript response
	t := resp.Header.Get("Content-Type")
	name, _ := filenamify.Filenamify(req.URL.Path, filenamify.Options{})

	if strings.Contains(strings.ToLower(t), "javascript") || strings.Contains(strings.ToLower(t), "html") {
		// extract body bytes
		// fmt.Println("Instrumenting", req.URL.Path)
		bodyBytes, _ := io.ReadAll(resp.Body)
		newbody := invokeNode(extractBody(string(bodyBytes), resp.Header), t, name, false)
		resp.Body = io.NopCloser(bytes.NewReader(newbody))
		resp.ContentLength = int64(len(newbody))
		resp.Header.Set("Content-Length", strconv.Itoa(len(newbody)))

		//delete encoding if it exists
		if resp.Header.Get("Content-Encoding") != "" {
			resp.Header.Del("Content-Encoding")
		}

	}

	return req, resp, nil

}
