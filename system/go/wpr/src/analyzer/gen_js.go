package main

import (
	"bytes"
	"fmt"
	"log"
	"strings"
	"text/template"
	pb "wpr/src/analyzer/proto"
	"wpr/src/analyzer/types"
)

var jsTemplate = `
	(function() {

		var evalReads = function(readArr){
			for (var r of readArr){
				if (window[r.key] != r.value){
					return false;
				}
			}
			return true;
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
		}
		
		var reads = [
				{{range $k, $v := .Reads}}
				{{printf "{key:$k, value:$v}"}}
				{{end}}
			];

		if (evalReads(reads)){
			// all reads satisfied, fetch the URLs
			{{range $u := .URLs}}
				{{ if index $u 1 eq "script" }}
					fetchViaDOM("{{index $u 0}}");
				{{ else }}
					fetchViaXHR("{{index $u 0}}");
				{{ end }}
			{{end}}
		} else {
			console.log("Reads not satisfied");
		}
		
		// 		var s = document.createElement("script");
		// s.type = "text/javascript";
		// s.src = "http://somedomain.com/somescript";
		// $("head").append(s);
	)();
`

func JSGen(sig types.Signature) (string, error) {

	globalreads := make([]pb.Lineaccess, 0)
	for _, s := range sig.Input {
		if strings.HasPrefix(s.GetRoot(), "window") {
			globalreads = append(globalreads, s)
		}
	}

	jsfmtReads := make(map[string]string, 0)

	for _, r := range globalreads {
		k := fmt.Sprintf("%s[%s]", r.GetRoot(), r.GetKey())
		jsfmtReads[k] = r.GetValue()
		if r.GetValue() == "" {
			jsfmtReads[k] = "null"
		}
	}

	fetches := make([][2]string, 0)
	for _, f := range sig.Fetches {
		t := "xhr"
		if strings.Contains(f.GetType(), "script") {
			t = "script"
		}
		fetches = append(fetches, [2]string{f.GetUrl(), t})
	}

	templ, err := template.New("js").Parse(jsTemplate)
	if err != nil {
		log.Printf("Error parsing template: %v", err)
		return "", nil
	}

	var buf bytes.Buffer
	err = templ.Execute(&buf, struct {
		Reads map[string]string
		URLs  [][2]string
	}{
		Reads: jsfmtReads,
		URLs:  fetches,
	})
	if err != nil {
		log.Printf("Error executing template: %v", err)
		return "", nil
	}

	return buf.String(), nil
}
