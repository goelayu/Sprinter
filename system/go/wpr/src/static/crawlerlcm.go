// life cycle manager for the static crawler
// Initializes a proxy per crawler
// takes care of page allocation

package main

import (
	"bufio"
	"crypto/tls"
	"errors"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

type LCM struct {
	crawlers   []*Crawler
	proxies    []*Proxy
	pages      []string
	mu         sync.Mutex
	url2scheme map[string]string
	outDir     string
}

type Proxy struct {
	port     int
	dataFile string
	wprData  string
	sshC     *ssh.Client
	remote   bool
}

func buildUrl2Scheme(logPath string) (map[string]string, error) {
	url2scheme := make(map[string]string)
	lines, err := readLines(logPath)
	if err != nil {
		log.Printf("Error reading log file: %s", err)
	}
	for _, line := range lines {
		if !strings.Contains(line, "generated with signature") {
			continue
		}
		parts := strings.Split(line, " ")
		u := parts[6]
		log.Printf("adding %s to url2scheme", u)
		parsedUrl, err := url.Parse(u)
		if err != nil {
			continue
		}
		url2scheme[parsedUrl.Host+parsedUrl.Path] = parsedUrl.Scheme
	}
	return url2scheme, nil
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
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024*1024)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	return lines, scanner.Err()
}

func makeLogger(p string) func(msg string, args ...interface{}) {
	prefix := fmt.Sprintf("[Crawler:%s]: ", p)
	return func(msg string, args ...interface{}) {
		log.Print(prefix + fmt.Sprintf(msg, args...))
	}
}

func setupSSH() *ssh.Client {
	key, err := os.ReadFile("/vault-home/goelayu/.ssh/id_rsa")
	if err != nil {
		log.Fatalf("unable to read private key: %v", err)
	}

	// Create the Signer for this private key.
	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		log.Fatalf("unable to parse private key: %v", err)
	}

	var hostkeyCallback ssh.HostKeyCallback
	hostkeyCallback, err = knownhosts.New("/vault-home/goelayu/.ssh/known_hosts")
	if err != nil {
		fmt.Println(err.Error())
	}

	config := &ssh.ClientConfig{
		User: "goelayu",
		Auth: []ssh.AuthMethod{
			// Use the PublicKeys method for remote authentication.
			// ssh.Password("ayuizagem.123"),
			ssh.PublicKeys(signer),
		},
		HostKeyCallback: hostkeyCallback,
	}

	// Connect to the remote server and perform the SSH handshake.
	client, err := ssh.Dial("tcp", "lions.eecs.umich.edu:22", config)
	if err != nil {
		log.Fatalf("unable to connect: %v", err)
	}

	return client
}

func retrySSHCon(sshC *ssh.Client, retries int) (*ssh.Session, error) {
	for i := 0; i < retries; i++ {
		sshS, err := sshC.NewSession()
		if err != nil {
			log.Printf("unable to create session: [try %d/%d] %v", i, retries, err)
			time.Sleep(1 * time.Second)
			continue
		}
		return sshS, nil
	}
	return nil, errors.New("unable to create session")
}

func initProxies(n int, proxyData string, wprData string, azPort int,
	sleep int, remote bool) []*Proxy {
	GOROOT := "/w/goelayu/uluyol-sigcomm/go"
	WPRDIR := "/vault-swift/goelayu/balanced-crawler/system/go/wpr"
	DUMMYDATA := "/w/goelayu/bcrawling/wprdata/dummy.wprgo"

	startHTTPPORT := 8080
	startHTTPSPORT := 9080

	proxies := make([]*Proxy, n)

	// var sshC *ssh.Client
	// if remote {
	// 	sshC = setupSSH()
	// }

	for i := 0; i < n; i++ {
		httpport := startHTTPPORT + i
		httpsport := startHTTPSPORT + i
		dataFile := fmt.Sprintf("%s/%s", proxyData, strconv.Itoa(httpsport))
		outFilePath := fmt.Sprintf("%s/%s.replay.log", proxyData, strconv.Itoa(httpsport))
		cmdstr := fmt.Sprintf("GOROOT=%s go run src/wpr.go replay -host 0.0.0.0 --http_port %d --https_port %d --az_port %d %s &> %s",
			GOROOT, httpport, httpsport, azPort, dataFile, outFilePath)

		if remote {
			sshC := setupSSH()
			sshS, err := retrySSHCon(sshC, 3)
			if err != nil {
				log.Fatalf("unable to create session: %v", err)
			}
			dummyfilecmd := fmt.Sprintf("mkdir -p %s;echo %s > %s", proxyData, DUMMYDATA, dataFile)
			log.Printf("dummy file command: %s", dummyfilecmd)
			_, err = sshS.Output(dummyfilecmd)
			if err != nil {
				sshS.Close()
				log.Fatalf("unable to create dummy file: %v", err)
			}
			sshS.Close()
			sshS, err = retrySSHCon(sshC, 3)
			if err != nil {
				log.Fatalf("unable to create session: %v", err)
			}
			go sshS.Run(fmt.Sprintf("cd %s; %s", WPRDIR, cmdstr))
			proxies[i] = &Proxy{httpsport, dataFile, wprData, sshC, remote}
		} else {
			os.WriteFile(dataFile, []byte(DUMMYDATA), 0644)
			cmd := exec.Command("bash", "-c", cmdstr)
			cmd.Dir = WPRDIR
			go cmd.Run()
			proxies[i] = &Proxy{httpsport, dataFile, wprData, nil, remote}
		}
		log.Printf("Started proxy on port %d", httpsport)
	}

	//sleep for 3 seconds to make sure all proxies are up
	time.Sleep(time.Duration(sleep) * time.Second)
	return proxies
}

func (p *Proxy) Stop() {
	log.Printf("Stopping proxy on port %d", p.port)
	killcmd := fmt.Sprintf("ps aux | grep https_port | grep %d | awk '{print $2}' | xargs kill -SIGINT", p.port)
	if p.remote {
		sshS, _ := retrySSHCon(p.sshC, 3)
		err := sshS.Run(killcmd)
		if err != nil {
			log.Fatalf("unable to kill proxy: %v", err)
		}
		sshS.Close()
		sshS, _ = retrySSHCon(p.sshC, 3)
		err = sshS.Run(fmt.Sprintf("rm %s", p.dataFile))
		if err != nil {
			log.Fatalf("unable to remove data file: %v", err)
		}
		sshS.Close()
	} else {
		exec.Command("bash", "-c", killcmd).Run()
		// p.cmd.Process.Signal(os.Interrupt)
		os.Remove(p.dataFile)
	}
}

func (p *Proxy) UpdateDataFile(page string) {
	sanitizecmd := fmt.Sprintf("echo '%s' | sanitize", page)
	sanpage, _ := exec.Command("bash", "-c", sanitizecmd).Output()
	wprData := fmt.Sprintf("%s/%s.wprgo", p.wprData, string(sanpage))
	if p.remote {
		sshS, _ := retrySSHCon(p.sshC, 3)
		err := sshS.Run(fmt.Sprintf("echo %s > %s", wprData, p.dataFile))
		if err != nil {
			log.Fatalf("unable to update data file: %v", err)
		}
		sshS.Close()
	} else {
		os.WriteFile(p.dataFile, []byte(wprData), 0644)
	}
}

func (lcm *LCM) Start() {

	pages := lcm.pages
	var wg sync.WaitGroup
	wg.Add(len(lcm.crawlers))

	for i := 0; i < len(lcm.crawlers); i++ {
		go func(index int) {
			cproxy := lcm.proxies[index]
			c := lcm.crawlers[index]
			// rl := ratelimit.New(3)
			defer wg.Done()
			for {
				// rl.Take()
				lcm.mu.Lock()
				if len(pages) == 0 {
					lcm.mu.Unlock()
					log.Printf("Crawler %s finished", c.HttpServer)
					cproxy.Stop()
					return
				}
				page := pages[0]
				pages = pages[1:]
				lcm.mu.Unlock()
				log.Printf("Crawler %s crawling %s", c.HttpServer, page)
				cproxy.UpdateDataFile(page)
				c.logf = makeLogger(fmt.Sprintf("%s:%s", c.HttpsServer, page))
				c.VisitWithTimeout(page, 10*time.Second, lcm.outDir)
			}
		}(i)
	}

	wg.Wait()
}

func initLCM(n int, pagePath string, proxyData string, wprData string,
	azPort int, azLogPath string, sleep int, remote bool) *LCM {
	// read pages
	pages, _ := readLines(pagePath)
	log.Printf("Read %d pages", len(pages))

	// build url2scheme
	url2scheme, _ := buildUrl2Scheme(azLogPath)

	// initialize proxies
	proxies := initProxies(n, proxyData, wprData, azPort, sleep, remote)

	// initialize crawlers
	crawlers := make([]*Crawler, n)
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	for i := 0; i < n; i++ {
		client := &http.Client{Transport: tr}
		hostaddr := "127.0.0.1"
		if remote {
			hostaddr = "lions.eecs.umich.edu"
		}
		crawlers[i] = &Crawler{
			Client:      client,
			HttpServer:  fmt.Sprintf("http://%s:%d", hostaddr, proxies[i].port-1000),
			HttpsServer: fmt.Sprintf("https://%s:%d", hostaddr, proxies[i].port),
			url2scheme:  url2scheme,
		}
		log.Printf("Initialized crawler %d with proxy port %d", i, proxies[i].port)
	}

	return &LCM{crawlers, proxies, pages, sync.Mutex{}, url2scheme, proxyData}
}

func main() {

	fmt.Println(len(os.Args), os.Args)

	var pagePath string
	var wprData string
	var proxyData string
	var nCrawlers int
	var verbose bool
	var azPort int
	var azLogPath string
	var sleep int
	var remote bool

	flag.StringVar(&pagePath, "pages", "", "path to pages file")
	flag.IntVar(&nCrawlers, "n", 1, "number of crawlers")
	flag.StringVar(&wprData, "wpr", "", "path to wpr data directory")
	flag.StringVar(&proxyData, "proxy", "", "path to proxy data directory")
	flag.IntVar(&azPort, "az", 0, "port of analyzer server")
	flag.StringVar(&azLogPath, "azlog", "", "path to az server log")
	flag.IntVar(&sleep, "sleep", 5, "sleep time")
	flag.BoolVar(&verbose, "v", false, "verbose")
	flag.BoolVar(&remote, "remote", false, "remote")
	flag.Parse()

	if verbose {
		log.SetFlags(log.LstdFlags | log.Lmicroseconds | log.Lshortfile)
	} else {
		log.SetFlags(0)
		log.SetOutput(ioutil.Discard)
	}

	lcm := initLCM(nCrawlers, pagePath, proxyData, wprData, azPort, azLogPath, sleep, remote)
	lcm.Start()
}
