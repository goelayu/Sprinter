package main

import (
	"errors"
	"io"
	"log"
	"net/url"
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

type JSSig struct {
	urls   []string
	reads  []string
	writes []string
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
		u = strings.TrimLeft(u, " ")
		logf("Found url using regex from HTML: %s", u)
		urls = append(urls, u)
	}
	return urls, nil
}

func HTMLParser(body string, logf logprintf) ([]string, error) {
	r := io.NopCloser(strings.NewReader(body))
	doc, err := goquery.NewDocumentFromReader(r)
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
			if re && (strings.Contains(rel, "alternate") || strings.Contains(rel,
				"canonical") || strings.Contains(rel, "shortlink")) {
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

func xtractJSURLS(body string) (JSSig, error) {

	injectstr := "custom signature info"
	if !strings.Contains(body, injectstr) {
		log.Printf("No custom signature info found in body")
		return JSSig{}, errors.New("No custom signature info found in body")
	}

	// tregex, _ := regexp.Compile(`CODE BEGIN[\s\S]*CODE END`)
	// tmplt := tregex.FindString(body)

	// if tmplt == "" {
	// 	return []string{}, nil
	// }
	// log.Printf("Found template code")

	log.Printf(" JS body %s", body)
	sig := JSSig{}

	rrgx, _ := regexp.Compile(`var reads = \[([\s\S]*)\];\s*var writes`)
	wrgx, _ := regexp.Compile(`var writes = \[([\s\S]*)\];`)

	var reads []string
	var writes []string

	m := rrgx.FindStringSubmatch(body)
	if len(m) > 0 {
		reads = strings.Split(m[1], ",")
		log.Printf("Reads: %v", reads)
		sig.reads = reads
	}

	m = wrgx.FindStringSubmatch(body)
	if len(m) > 0 {
		writes = strings.Split(m[1], ",")
		log.Printf("Writes: %v", writes)
		sig.writes = writes
	}

	var jsurls []string
	urlrgx, _ := regexp.Compile(`fetchVia(DOM|XHR)\("(\S*)"\)`)
	mu := urlrgx.FindAllStringSubmatch(body, -1)
	for _, v := range mu {
		jsurls = append(jsurls, v[2])
	}

	sig.urls = jsurls

	return sig, nil
}
