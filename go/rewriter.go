package main

import (
	"fmt"
	"net/http"
	"compress/gzip"
	"bytes"
	"cbrotli"
	"io"
	"github.com/flytam/filenamify"
)

func check(e error) {
	if e != nil {
			panic(e)
	}
}

func uncompressBody(string body, string type) string {

	var reader io.Reader
	// uncompress the body
	if type.lower().contains("gzip") {
		reader, _ = gzip.NewReader([]byte(body))
	} else if type.lower().contains("br") {
		reader, _ = cbrotli.NewReader([]byte(body))
	}

	// read the uncompressed body
	output, err := ioutil.ReadAll(reader)
	if err != nil {
		fmt.Println("Error reading uncompressed body", err)
		panic(err)
	}

	return string(output)
}

func unchunkBody(string body) string {
	// unchunk the body


}

func extractBody(string body, h http.Header) string {
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

func invokeNode(string body, string type, string name) string {
	SCRIPTPATH := "../progam_analysis/instrument.js"
	// store body in a temp file
	tempFile, err := os.createTemp("", "insttmp")
	if err != nil {
		fmt.Println("Error creating temp file", err)
		panic(err)
	}
	defer os.Remove(tempFile.Name())

	_, err := tempFile.WriteString([]byte(body))
	check(err)

	cmdString := fmt.Sprintf("node %s -i %s -t %s -n %s", SCRIPTPATH, tempFile.Name(), type, name)
	cmd := exec.Command("bash", "-c", cmdString)

	// read the temp file
	newbody, _ := io.ReadAll(tempFile)

	return string(newbody)
}

func instrument(req *http.Request, resp *http.Response) (*http.Request, *http.Response, error) {

	// Identify if the response is a JavaScript response
	type := resp.Header.Get("Content-Type")
	name := filenamify.Filenamify(req.URL.Path, filenamify.Options{})

	if type.lower().contains("javascript") {
		// Instrument the response
		resp.Body = invokeNode(extractBody(resp.Body, resp.Header), type, name)
	}

	return req, resp, nil

}