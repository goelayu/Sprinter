package main

import (
	// "fmt"

	"context"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"os"
	"os/signal"
	"strconv"
	"strings"
	sync "sync"
	"sync/atomic"
	"syscall"

	"wpr/src/analyzer/types"

	pb "wpr/src/analyzer/proto"

	"github.com/urfave/cli"
	grpc "google.golang.org/grpc"
)

type CStats struct {
	instHTML int32
	instJS   int32
	instC    int32
	sig      int32
}

type Analyzer struct {
	pb.UnimplementedAnalyzerServer
	store    types.Store
	rewriter Rewriter
	stats    CStats
	mu       sync.Mutex
}

func (a *Analyzer) Analyze(ctx context.Context, arg *pb.AzRequest) (*pb.AzResponse, error) {
	//check if file is in cache
	a.mu.Lock()
	file, ok := a.store.Cache[arg.Name]
	a.mu.Unlock()
	if ok {
		log.Printf("File %s found in cache", arg.Name)
		switch file.Status {
		case 1: //file instrumented
			if strings.Contains(strings.ToLower(arg.Type), "javascript") {
				log.Printf("File %s already instrumented but no signature yet??", arg.Name)
				atomic.AddInt32(&a.stats.instC, 1)
				return &pb.AzResponse{Body: file.Body}, nil
			}
			return &pb.AzResponse{Body: file.InstBody}, nil
		case 2: // file instrumented and signature generated
			log.Printf("Generating signature template for file %s", arg.Name)
			var err error
			var newbody string
			if strings.Contains(strings.ToLower(arg.Type), "javascript") {
				newbody, err = JSGen(file.Sig, file.Body)
			} else {
				log.Printf("Error: sig exists but file not js %s", arg.Name)
				return &pb.AzResponse{Body: file.Body}, nil
			}
			if err != nil {
				log.Printf("Error generating JS optimized file %s", arg.Name)
				return &pb.AzResponse{Body: file.Body}, nil
			} else {
				log.Printf("JS optimized file %s generated with signature %s", arg.Name, newbody)
				atomic.AddInt32(&a.stats.sig, 1)
				a.mu.Lock()
				file.SigBody = newbody
				file.Status = 3
				a.mu.Unlock()
				return &pb.AzResponse{Body: file.SigBody}, nil
			}
		case 3: //file instrumented and signature template generated
			log.Printf("File %s already instrumented and signature template exists", arg.Name)
			atomic.AddInt32(&a.stats.sig, 1)
			return &pb.AzResponse{Body: file.SigBody}, nil
		}
	} else {
		log.Printf("File %s not found in cache\n", arg.Name)
		if strings.Contains(arg.Type, "javascript") {
			atomic.AddInt32(&a.stats.instJS, 1)
		} else if strings.Contains(arg.Type, "html") {
			atomic.AddInt32(&a.stats.instHTML, 1)
		}
		newbody, err := a.rewriter.Rewrite(arg.Name, arg.Body, arg.Type, arg.Encoding, arg.Caching)
		if err != nil {
			log.Printf("Error rewriting file %s", arg.Name)
			return nil, err
		}

		f := types.File{Name: arg.Name, Body: string(arg.Body),
			InstBody: string(newbody),
			Status:   1}

		a.mu.Lock()
		a.store.Cache[arg.Name] = &f
		a.mu.Unlock()

		return &pb.AzResponse{Body: f.InstBody}, nil
	}

	return nil, errors.New("Error in Analyzer.Analyze")
}

func (a *Analyzer) Storesignature(ctx context.Context, arg *pb.Pageaccess) (*pb.StoresigResponse, error) {
	log.Printf("Storing signature for page %s with value %s", arg.Name, arg.GetFiles())
	// sleep for 100ms

	for _, f := range arg.GetFiles() {
		name := f.GetName()

		a.mu.Lock()
		file, ok := a.store.Cache[name]
		a.mu.Unlock()

		if ok {
			if file.Status >= 2 {
				log.Printf("File %s already has signature", name)
				continue
			}
			state := f.GetLines()
			Input := make([]pb.Lineaccess, 0)
			Output := make([]pb.Lineaccess, 0)

			for _, s := range state {
				t := s.GetType()
				if t == "read" {
					Input = append(Input, pb.Lineaccess{Type: t, Root: s.GetRoot(), Key: s.GetKey(), Value: s.GetValue()})
				} else if t == "write" {
					Output = append(Output, pb.Lineaccess{Type: t, Root: s.GetRoot(), Key: s.GetKey(), Value: s.GetValue()})
				}
			}

			Fetches := f.GetFetches()
			a.mu.Lock()
			file.Sig = types.Signature{Input, Output, Fetches}
			file.Status = 2
			a.mu.Unlock()
			log.Printf("File %s signature stored with fetches %s", name, Fetches)
		} else {
			log.Printf("[ERROR] File %s not found in cache\nThis could be because the file is not a JS type", name)
		}
	}

	return &pb.StoresigResponse{Id: 1}, nil
}

func createServer(c *cli.Context) {

	port := c.Int("port")

	// log.SetFlags(log.LstdFlags | log.Lmicroseconds | log.Lshortfile)
	// disable logging
	log.SetFlags(0)
	log.SetOutput(ioutil.Discard)

	az := Analyzer{}
	az.store = types.Store{}
	az.store.Cache = make(map[string]*types.File)
	az.store.Files = make([]types.File, 0)
	az.stats = CStats{0, 0, 0, 0}

	var DYNSCRIPTPATH = "/run/user/99542426/goelayu/panode/program_analysis/dynamic/tracer.js"

	// open the file DYNSCRIPTPATH and read content
	tracerstr, _ := os.ReadFile(DYNSCRIPTPATH)
	az.rewriter = Rewriter{string(tracerstr)}

	l, e := net.Listen("tcp", ":"+strconv.Itoa(port))
	if e != nil {
		log.Fatal("listen error:", e)
	}

	var opts []grpc.ServerOption
	// increase the max message size
	opts = append(opts, grpc.MaxRecvMsgSize(1024*1024*20))
	grpcServer := grpc.NewServer(opts...)
	// Register the service with the gRPC server
	pb.RegisterAnalyzerServer(grpcServer, &az)

	go func() {
		sigchan := make(chan os.Signal, 1)
		signal.Notify(sigchan, syscall.SIGINT, syscall.SIGTERM)
		<-sigchan
		fmt.Printf("Ctrl-C received, exiting...")
		fmt.Printf("Total HTML files instrumented: %d", az.stats.instHTML)
		fmt.Printf("Total JS files instrumented: %d", az.stats.instJS)
		fmt.Printf("Total files using instrumented cache: %d", az.stats.instC)
		fmt.Printf("Total files with signature generated: %d", az.stats.sig)
		// stop server
		grpcServer.Stop()
		os.Exit(0)
	}()

	fmt.Printf("Analyzer server started")
	fmt.Printf("Listening on port %d", port)
	fmt.Printf("Press Ctrl-C to exit")
	grpcServer.Serve(l)

}

func main() {
	app := cli.NewApp()
	app.Name = "Analyzer"
	app.Usage = "Analyzer"
	app.Version = "0.0.1"
	app.Flags = []cli.Flag{
		cli.IntFlag{
			Name:  "port, p",
			Value: 1234,
			Usage: "port to listen on",
		},
	}
	app.Action = createServer
	app.RunAndExitOnError()
}
