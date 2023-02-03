package main

import (
	// "fmt"

	"log"
	"net"
	"net/rpc"
	"strconv"

	"wpr/src/analyzer/types"

	"github.com/urfave/cli"
)

type Analyzer struct {
	store types.Store
}

func (a *Analyzer) GetFile(arg *types.Azargs, reply *types.Azreply) error {
	//check if file is in cache
	log.Printf("GetFile(%s)", arg.Name)
	if file, ok := a.store.Cache[arg.Name]; ok {
		log.Printf("File %s found in cache", arg.Name)
		*reply = types.Azreply{Body: file.Body, Headers: file.Headers}
		return nil
	} else {
		log.Printf("File %s not found in cache", arg.Name)
		log.Printf("Content length before rewriting %s", arg.Headers.Get("Content-Length"))
		newbody, err := Rewrite(arg.Name, arg.Body, &arg.Headers)
		log.Printf("Content length after rewriting %s", arg.Headers.Get("Content-Length"))
		if err != nil {
			log.Printf("Error rewriting file %s", arg.Name)
			return err
		}
		f := types.File{Name: arg.Name, Body: newbody, Headers: arg.Headers}
		a.store.Cache[arg.Name] = f
		*reply = types.Azreply{Body: newbody, Headers: arg.Headers, CL: int64(len(newbody))}
		return nil
	}
}

func createServer(c *cli.Context) {
	port := c.Int("port")

	az := Analyzer{}
	az.store = types.Store{}
	az.store.Cache = make(map[string]types.File)
	az.store.Files = make([]types.File, 0)

	rpc.Register(&az)
	rpc.HandleHTTP()
	l, e := net.Listen("tcp", ":"+strconv.Itoa(port))
	if e != nil {
		log.Fatal("listen error:", e)
	}
	log.Printf("Analyzer server started")
	go func() {
		for {
			rpc.Accept(l)
		}
	}()

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
