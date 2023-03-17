// life cycle manager for the static crawler
// Initializes a proxy per crawler
// takes care of page allocation

package main

import (
	"bufio"
	"crypto/tls"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"time"
)

type LCM struct {
	crawlers []*Crawler
	proxies  []*Proxy
	pages    []string
	mu       sync.Mutex
}

type Proxy struct {
	port     int
	dataFile string
	cmd      *exec.Cmd
	wprData  string
}

// readLines reads a whole file into memory
// and returns a slice of its lines.
func readLines(path string) ([]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var lines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	return lines, scanner.Err()
}

func initProxies(n int, proxyData string, wprData string) []*Proxy {
	GOROOT := "/w/goelayu/uluyol-sigcomm/go"
	WPRDIR := "/vault-swift/goelayu/balanced-crawler/system/go/wpr"
	DUMMYDATA := "/vault-swift/goelayu/balanced-crawler/data/record/wpr/test/dummy.wprgo"

	startHTTPPORT := 8080
	startHTTPSPORT := 9080

	proxies := make([]*Proxy, n)

	for i := 0; i < n; i++ {
		httpport := startHTTPPORT + i
		httpsport := startHTTPSPORT + i
		dataFile := fmt.Sprintf("%s/%s", proxyData, strconv.Itoa(httpsport))
		os.WriteFile(dataFile, []byte(DUMMYDATA), 0644)
		cmdstr := fmt.Sprintf("GOROOT=%s go run src/wpr.go replay --http_port %d --https_port %d %s",
			GOROOT, httpport, httpsport, dataFile)
		cmd := exec.Command("bash", "-c", cmdstr)
		cmd.Dir = WPRDIR
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		go cmd.Run()
		proxies[i] = &Proxy{httpsport, dataFile, cmd, wprData}
		log.Printf("Started proxy on port %d", httpsport)
	}

	//sleep for 3 seconds to make sure all proxies are up
	time.Sleep(3 * time.Second)
	return proxies
}

func (p *Proxy) Stop() {
	p.cmd.Process.Kill()
	os.Remove(p.dataFile)
}

func (p *Proxy) UpdateDataFile(page string) {
	sanitizecmd := fmt.Sprintf("echo '%s' | sanitize", page)
	sanpage, _ := exec.Command("bash", "-c", sanitizecmd).Output()
	wprData := fmt.Sprintf("%s/%s.wprgo", p.wprData, string(sanpage))
	os.WriteFile(p.dataFile, []byte(wprData), 0644)
}

func (lcm *LCM) Start() {

	pages := lcm.pages
	var wg sync.WaitGroup
	wg.Add(len(lcm.crawlers))

	for i := 0; i < len(lcm.crawlers); i++ {
		go func(index int) {
			cproxy := lcm.proxies[index]
			c := lcm.crawlers[index]
			defer wg.Done()
			for {
				lcm.mu.Lock()
				if len(pages) == 0 {
					lcm.mu.Unlock()
					return
				}
				page := pages[0]
				pages = pages[1:]
				lcm.mu.Unlock()
				log.Printf("Crawler %s crawling %s", c.HttpServer, page)
				cproxy.UpdateDataFile(page)
				c.Visit(page)
			}
			log.Printf("Crawler %s finished", c.HttpServer)
			cproxy.Stop()
		}(i)
	}

	wg.Wait()
}

func initLCM(n int, pagePath string, proxyData string, wprData string) *LCM {
	// read pages
	pages, _ := readLines(pagePath)
	log.Printf("Read %d pages", len(pages))

	// initialize proxies
	proxies := initProxies(n, proxyData, wprData)

	// initialize crawlers
	crawlers := make([]*Crawler, n)
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	for i := 0; i < n; i++ {
		client := &http.Client{Transport: tr}
		crawlers[i] = &Crawler{
			Client:      client,
			HttpServer:  fmt.Sprintf("http://127.0.0.1:%d", proxies[i].port-1000),
			HttpsServer: fmt.Sprintf("https://127.0.0.1:%d", proxies[i].port),
		}
		log.Printf("Initialized crawler %d with proxy port %d", i, proxies[i].port)
	}

	return &LCM{crawlers, proxies, pages, sync.Mutex{}}
}

func main() {

	var pagePath string
	var wprData string
	var proxyData string
	var nCrawlers int
	var verbose bool

	flag.StringVar(&pagePath, "pages", "", "path to pages file")
	flag.IntVar(&nCrawlers, "n", 1, "number of crawlers")
	flag.StringVar(&wprData, "wpr", "", "path to wpr data directory")
	flag.StringVar(&proxyData, "proxy", "", "path to proxy data directory")
	flag.BoolVar(&verbose, "v", false, "verbose")
	flag.Parse()

	if verbose {
		log.SetFlags(log.LstdFlags | log.Lmicroseconds | log.Lshortfile)
	} else {
		log.SetFlags(0)
		log.SetOutput(ioutil.Discard)
	}

	lcm := initLCM(nCrawlers, pagePath, proxyData, wprData)
	lcm.Start()
}
