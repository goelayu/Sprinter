package main

import (
	"bytes"
	"fmt"
	"log"
	"math/rand"
	"sort"
	"strings"
	"text/template"
	pb "wpr/src/analyzer/proto"
	"wpr/src/analyzer/types"

	"github.com/mpvl/unique"
)

var jsTemplate = `
	(function() {

		var evalReads = function(readArr){
			for (var r of readArr){
				if (r.value == "null") r.value = null;
				if (r.value != eval(r.key)){
					return false;
				}
			}
			return true;
		}

		var applyWrites = function(writeArr){
			for (var w of writeArr){
				if (w.value == "") w.value = null;
				eval(w.key + " = " + w.value);
			}
		}
		
		var fetchViaDOM = function(url){
			var s = document.createElement("script");
			s.type = "text/javascript";
			s.src = url;
			document.head.appendChild(s);
		}

		var fetchViaXHR = function(url){
			var xhr = new XMLHttpRequest();
			xhr.open("GET", url, true);
			xhr.send();
		}
		
		var reads = [
				{{range $k, $v := .Reads}}
				{{printf "{key:'%s', value:%s}," $k $v}}
				{{end}}
			];
		var writes = [
				{{range $k, $v := .Writes}}
				{{printf "{key:'%s', value:%s}," $k $v}}
				{{end}}
			];

		try {
			if (evalReads(reads)){
				// all reads satisfied, fetch the URLs
				{{range $u := .URLs}}{{ $t := index $u 1 }}{{ if eq $t "script" }}fetchViaDOM("{{index $u 0}}");
					{{ else }}fetchViaXHR("{{index $u 0}}");{{ end }}{{end}}
					__skipExec{{.SkipID}}__ = true;
					try {
						applyWrites(writes);
					} catch (e) {
						console.log("Error in applyWrites: " + e);
					}
			} else {
				console.log("Reads not satisfied");
				__tracer__.updateCacheStats('misses');
			}
		} catch (e) {
			console.log("Error in evalReads: " + e);
			__tracer__.updateCacheStats('errors');
		}
	}
	)();
	if (typeof __skipExec{{.SkipID}}__ !== "undefined"){
		__tracer__.updateCacheStats('hits');
		throw "[SUCCESS] all reads satisfied, skipped execution"
		
	}
	{{.InstBody}}
`

func JSGen(sig types.Signature, instBody string) (string, error) {

	globalreads := make([]pb.Lineaccess, 0)
	globalwrites := make([]pb.Lineaccess, 0)
	for _, s := range sig.Input {
		if strings.HasPrefix(s.GetRoot(), "window") {
			// if not already in the list, add it
			globalreads = append(globalreads, s)
		}
	}

	// only storing the write keys, to prune the reads
	globalwriteskeys := make([]string, 0)
	for _, s := range sig.Output {
		if strings.HasPrefix(s.GetRoot(), "window") {
			k := fmt.Sprintf("%s['%s']", s.GetRoot(), s.GetKey())
			globalwriteskeys = append(globalwriteskeys, k)
			globalwrites = append(globalwrites, s)
		}
	}

	sort.Strings(globalwriteskeys)

	unique.Strings(&globalwriteskeys)

	jsfmtReads := make(map[string]string, 0)
	jsfmtWrites := make(map[string]string, 0)

	for _, r := range globalreads {
		k := fmt.Sprintf("%s['%s']", r.GetRoot(), r.GetKey())

		// if k already in jsfmtReads, skip
		if _, ok := jsfmtReads[k]; ok {
			continue
		}

		skip := false
		for _, w := range globalwriteskeys {
			// log.Printf("[CHECK] k = %s w = %s", k, w)
			if strings.HasPrefix(k, w) {
				// log.Printf("[SKIP] k = %s w = %s", k, w)
				skip = true
				break
			}
		}

		if skip {
			continue
		}

		K := strings.ReplaceAll(k, "'", "\\'")
		// fmt.Printf("[TEMPLATE] k = %s v = %s \n", K, r.GetValue())
		if r.GetValue() == "" {
			continue
		}
		jsfmtReads[K] = "`" + r.GetValue() + "`"
		// if r.GetValue() == "" {
		// 	jsfmtReads[K] = "null"
		// }
	}

	for _, w := range globalwrites {
		k := fmt.Sprintf("%s['%s']", w.GetRoot(), w.GetKey())
		if _, ok := jsfmtWrites[k]; ok {
			continue
		}
		K := strings.ReplaceAll(k, "'", "\\'")
		jsfmtWrites[K] = "`" + w.GetValue() + "`"
	}

	fetches := make([][2]string, 0)
	for _, f := range sig.Fetches {
		t := "xhr"
		if strings.Contains(f.GetType(), "script") {
			t = "script"
		}
		fetches = append(fetches, [2]string{f.GetUrl(), t})
	}

	log.Printf("fetches = %v", fetches)
	templ, err := template.New("js").Parse(jsTemplate)
	if err != nil {
		log.Printf("Error parsing template: %v", err)
		return "", nil
	}

	var buf bytes.Buffer
	err = templ.Execute(&buf, struct {
		Reads    map[string]string
		Writes   map[string]string
		URLs     [][2]string
		InstBody string
		SkipID   int64
	}{
		Reads:    jsfmtReads,
		Writes:   jsfmtWrites,
		URLs:     fetches,
		InstBody: instBody,
		SkipID:   rand.Int63n(10000000),
	})
	if err != nil {
		log.Printf("Error executing template: %v", err)
		return "", nil
	}

	return buf.String(), nil
}

var cssTemplate = `
 /*
 {{range $u := .URLs}}
  __injecturl: {{$u}}
	{{end}}
 */
 `

func CSSGen(fetches []*pb.Fetches) (string, error) {
	URLs := make([]string, 0)
	for _, f := range fetches {
		URLs = append(URLs, f.GetUrl())
	}

	templ, err := template.New("css").Parse(cssTemplate)
	if err != nil {
		log.Printf("Error parsing template: %v", err)
		return "", nil
	}

	var buf bytes.Buffer
	err = templ.Execute(&buf, struct {
		URLs []string
	}{
		URLs: URLs,
	})
	if err != nil {
		log.Printf("Error executing template: %v", err)
		return "", nil
	}

	return buf.String(), nil
}
