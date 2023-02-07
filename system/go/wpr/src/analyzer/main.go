package main

import (
	// "fmt"

	"context"
	"log"
	"net"
	"strconv"
	sync "sync"
	"time"

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
	if file, ok := a.store.Cache[arg.Name]; ok {
		log.Printf("File %s found in cache", arg.Name)
		return &pb.AzResponse{Body: file.Body}, nil
	} else {
		log.Printf("File %s not found in cache", arg.Name)
		newbody, err := Rewrite(arg.Name, arg.Body, arg.Type, arg.Encoding)
		if err != nil {
			log.Printf("Error rewriting file %s", arg.Name)
			return nil, err
		}

		f := types.File{Name: arg.Name, Body: string(newbody)}

		a.mu.Lock()
		a.store.Cache[arg.Name] = f
		a.mu.Unlock()

		return &pb.AzResponse{Body: string(newbody)}, nil
	}
}

func (a *Analyzer) Storesignature(ctx context.Context, arg *pb.Pageaccess) (*pb.StoresigResponse, error) {
	log.Printf("Storing signature with value %s", arg.Files)
	// sleep for 100ms
	time.Sleep(100 * time.Millisecond)
	return &pb.StoresigResponse{Id: 1}, nil
}

func createServer(c *cli.Context) {

	port := c.Int("port")

	log.SetFlags(log.LstdFlags | log.Lshortfile)

	az := Analyzer{}
	az.store = types.Store{}
	az.store.Cache = make(map[string]types.File)
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
