package main

import (
	// "fmt"

	"context"
	"errors"
	"log"
	"net"
	"strconv"
	sync "sync"

	"wpr/src/analyzer/types"

	pb "wpr/src/analyzer/proto"

	"github.com/urfave/cli"
	grpc "google.golang.org/grpc"
)

type Analyzer struct {
	pb.UnimplementedAnalyzerServer
	store types.Store
	mu    sync.Mutex
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
			log.Printf("File %s already instrumented but no signature yet??", arg.Name)
			return &pb.AzResponse{Body: file.InstBody}, nil
		case 2: // file instrumented and signature generated
			newbody, err := JSGen(file.Sig, file.Body)
			if err != nil {
				log.Printf("Error generating JS optimized file %s", arg.Name)
				return &pb.AzResponse{Body: file.InstBody}, nil
			} else {
				log.Printf("JS optimized file %s generated", arg.Name)
				// log.Printf("Signature opt body: %s", newbody)
				a.mu.Lock()
				file.SigBody = newbody
				file.Status = 3
				a.mu.Unlock()
				return &pb.AzResponse{Body: file.SigBody}, nil
			}
		case 3: //file instrumented and signature template generated
			log.Printf("File %s already instrumented and signature template exists", arg.Name)
			return &pb.AzResponse{Body: file.SigBody}, nil
		}
	} else {
		log.Printf("File %s not found in cache", arg.Name)
		newbody, err := Rewrite(arg.Name, arg.Body, arg.Type, arg.Encoding, arg.Caching)
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
			if file.Status == 2 {
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
		} else {
			log.Printf("[ERROR] File %s not found in cache\nThis could be because the file is not a JS type", name)
		}
	}

	return &pb.StoresigResponse{Id: 1}, nil
}

func createServer(c *cli.Context) {

	port := c.Int("port")

	log.SetFlags(log.LstdFlags | log.Lshortfile)

	az := Analyzer{}
	az.store = types.Store{}
	az.store.Cache = make(map[string]*types.File)
	az.store.Files = make([]types.File, 0)

	// rpc.Register(&az)
	// rpc.HandleHTTP()
	l, e := net.Listen("tcp", ":"+strconv.Itoa(port))
	if e != nil {
		log.Fatal("listen error:", e)
	}

	var opts []grpc.ServerOption
	grpcServer := grpc.NewServer(opts...)
	// Register the service with the gRPC server
	pb.RegisterAnalyzerServer(grpcServer, &az)

	log.Printf("Analyzer server started")
	grpcServer.Serve(l)

	log.Printf("Analyzer server started")

	log.Printf("Use Ctrl-C to exit.")
	select {}

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
