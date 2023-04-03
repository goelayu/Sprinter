package main

import (
	"errors"
	"io"
	"net/url"
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

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

func xtractJSURLS(body string) []string {
	// atomic.AddInt64(tBytes, int64(len(buf.String())))
	tregex, _ := regexp.Compile(`CODE BEGIN[\s\S]*CODE END`)
	tmplt := tregex.FindString(body)

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
