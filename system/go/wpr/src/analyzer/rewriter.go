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

func invokeNode(body string, t string, name string, keepOrig bool) ([]byte, error) {
	SCRIPTPATH := "/vault-swift/goelayu/balanced-crawler/node/program_analysis/instrument.js"
	tmpdir := "/run/user/99542426/goelayu/tempdir/"
	// store body in a temp file
	tempFile, err := os.CreateTemp(tmpdir, "insttmp")
	if err != nil {
		panic(err)
	}

	// defer os.Remove(tempFile.Name())

	_, err = tempFile.WriteString(body)
	if err != nil {
		panic(err)
	}

	// create a copy of tempFile if keepOrig is true
	if keepOrig {
		origFile, err := os.Create(tempFile.Name() + ".copy")
		if err != nil {
			panic(err)
		}
		origFile.WriteString(body)
		origFile.Close()
	}

	cmdString := fmt.Sprintf("node %s -i %s -t '%s' -n '%s' -f %d", SCRIPTPATH, tempFile.Name(), t, name, 1)
	fmt.Println(cmdString)
	// startTime := time.Now()
	cmd := exec.Command("bash", "-c", cmdString)
	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	err = cmd.Run()
	if err != nil {
		err = fmt.Errorf("%s with cmd: %s", stderr.String(), cmdString)
		panic(err)
	}
	// fmt.Println("Instrumentation took", time.Since(startTime))

	// fmt.Println("stdout is", string(out))
	// read the temp file
	tempFile.Seek(0, 0)
	newbody, err := io.ReadAll(tempFile)
	if err != nil {
		panic(err)
	}
	// fmt.Println("newbody is", string(newbody))
	os.Remove(tempFile.Name())
	return newbody, nil
}

func Rewrite(name string, bodyBytes []byte, header http.Header) ([]byte, error) {
	name, _ = filenamify.Filenamify(name, filenamify.Options{})
	contentType := header.Get("Content-Type")
	newbody, err := invokeNode(extractBody(string(bodyBytes), header), contentType, name, false)
	if err != nil {
		return nil, err
	}
	header.Set("Content-Length", strconv.Itoa(len(newbody)))
	if header.Get("Content-Encoding") != "" {
		header.Del("Content-Encoding")
	}
	return []byte(newbody), nil
}
