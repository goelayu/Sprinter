package main

import (
	// "fmt"

	"encoding/gob"
	"log"
	"net"
	"net/http"
	"net/rpc"

	"wpr/src/analyzer/types"
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
		newbody, err := Rewrite(arg.Name, arg.Body, arg.Headers)
		if err != nil {
			log.Printf("Error rewriting file %s", arg.Name)
			return err
		}
		f := types.File{Name: arg.Name, Body: newbody, Headers: arg.Headers}
		a.store.Cache[arg.Name] = f
		*reply = types.Azreply{Body: newbody, Headers: arg.Headers}
		return nil
	}
}

func createServer() {
	gob.Register(types.Azargs{})
	gob.Register(types.Azreply{})
	gob.Register(http.Response{})
	az := Analyzer{}
	az.store = types.Store{}
	az.store.Cache = make(map[string]types.File)
	az.store.Files = make([]types.File, 0)

	rpc.Register(&az)
	rpc.HandleHTTP()
	l, e := net.Listen("tcp", ":1234")
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
	createServer()
}
