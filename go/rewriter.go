package main

import (
	"fmt"
	"net/http"
	"compress/gzip"
	"io"
	"github.com/andybalholm/brotli"
	"github.com/flytam/filenamify"
	"strings"
	"os"
	"bytes"
	"os/exec"
)

func check(e error) {
	if e != nil {
			panic(e)
	}
}

func uncompressBody(body string, t string) string {

	var zreader io.Reader
	reader := bytes.NewReader([]byte(body))
	// uncompress the body
	if strings.Contains(strings.ToLower(t),"gzip") {
		zreader, _ = gzip.NewReader(reader)
	} else if strings.Contains(strings.ToLower(t),"br") {
		zreader = brotli.NewReader(reader)
	}

	// read the uncompressed body
	output, err := io.ReadAll(zreader)
	if err != nil {
		fmt.Println("Error reading uncompressed body", err)
		panic(err)
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

func invokeNode(body string, t string, name string) []byte {
	SCRIPTPATH := "../progam_analysis/instrument.js"
	// store body in a temp file
	tempFile, err := os.CreateTemp("", "insttmp")
	if err != nil {
		fmt.Println("Error creating temp file", err)
		panic(err)
	}
	defer os.Remove(tempFile.Name())

	_, err = tempFile.WriteString(body)
	check(err)

	cmdString := fmt.Sprintf("node %s -i %s -t %s -n %s", SCRIPTPATH, tempFile.Name(), t, name)
	cmd := exec.Command("bash", "-c", cmdString)
	_, err = cmd.Output()
	check(err)

	// read the temp file
	newbody, _ := io.ReadAll(tempFile)

	return newbody
}

func instrument(req *http.Request, resp *http.Response) (*http.Request, *http.Response, error) {

	// Identify if the response is a JavaScript response
	t := resp.Header.Get("Content-Type")
	name,_ := filenamify.Filenamify(req.URL.Path, filenamify.Options{})

	if strings.Contains(strings.ToLower(t),"javascript") {
		// extract body bytes
		bodyBytes, _ := io.ReadAll(resp.Body)
		newbody := invokeNode(extractBody(string(bodyBytes), resp.Header), t, name)
		resp.Body = io.NopCloser(bytes.NewReader(newbody))
	}

	return req, resp, nil

}