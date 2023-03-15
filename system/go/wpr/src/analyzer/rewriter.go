package main

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/flytam/filenamify"
)

type Rewriter struct {
	tracerstr string
}

func rewriteHTML(body string, caching bool, tracerstr string) []byte {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(body))
	if err != nil {
		fmt.Println("ERROR: reading html", err)
		return []byte(body)
	}
	doc.Find("script").Each(func(i int, s *goquery.Selection) {
		intg, exists := s.Attr("integrity")
		if exists {
			fmt.Println("removing integrity: ", intg)
			s.RemoveAttr("integrity")
		}
	})
	doc.Find("img").Each(func(i int, s *goquery.Selection) {
		_, srcexists := s.Attr("src")
		datasrc, datasrcexists := s.Attr("data-src")
		if !srcexists && datasrcexists {
			fmt.Println("setting src: ", datasrc)
			s.SetAttr("src", datasrc)
		}
	})
	h, err := doc.Html()
	if err != nil {
		fmt.Println("ERROR: reading html after rewriting", err)
		return []byte(body)
	}
	if caching {
		return []byte("<script>" + tracerstr + "</script>" + h)
	}
	return []byte(h)

}

func invokeNode(body string, t string, name string, caching bool) ([]byte, error) {

	SCRIPTPATH := "/run/user/99542426/goelayu/panode/program_analysis/instrument.js"
	tmpdir := "/run/user/99542426/goelayu/tempdir/"

	// store body in a temp file
	tempFile, err := os.CreateTemp(tmpdir, "insttmp")
	if err != nil {
		return nil, err
	}

	defer os.Remove(tempFile.Name())

	_, err = tempFile.WriteString(body)
	if err != nil {
		return nil, err
	}

	cmdString := fmt.Sprintf("node %s -i %s -t '%s' -n '%s' --analyzing %t", SCRIPTPATH, tempFile.Name(), t, name, caching)
	log.Println(cmdString)
	startTime := time.Now()
	cmd := exec.Command("bash", "-c", cmdString)
	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	err = cmd.Run()
	if err != nil {
		err = fmt.Errorf("%s with cmd: %s", stderr.String(), cmdString)
		log.Printf("ERROR: %s", err)
		log.Printf("Returning the original body")
		return []byte(body), nil
	}
	log.Printf("Instrumentating %s  took %v", name, time.Since(startTime))

	// fmt.Println("stdout is", out.String())
	// read the temp file
	tempFile.Seek(0, 0)
	newbody, err := io.ReadAll(tempFile)
	if err != nil {
		fmt.Println("ERROR: reading temp file", err)
		return []byte(body), nil
	}
	return newbody, nil
}

func (r *Rewriter) Rewrite(name string, bodyBytes string, contentType string, encoding string, caching bool) ([]byte, error) {
	// if type is css then return
	if strings.Contains(contentType, "css") {
		return []byte(bodyBytes), nil
	}

	if strings.Contains(contentType, "html") {
		return rewriteHTML(bodyBytes, caching, r.tracerstr), nil
	}

	name, _ = filenamify.Filenamify(name, filenamify.Options{})

	newbody, err := invokeNode(bodyBytes, contentType, name, caching)
	if err != nil {
		return nil, err
	}

	return newbody, nil
}
