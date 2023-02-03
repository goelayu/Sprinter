package main

import (
	// "fmt"
	"log"
	"net"
	"net/rpc"

	"wpr/src/analyzer/types"
)

type Analyzer struct {
	store types.Store
}

func (a *Analyzer) GetFile(name *string, reply *types.File) error {
	//check if file is in cache
	log.Printf("GetFile(%s)", *name)
	if file, ok := a.store.Cache[*name]; ok {
		log.Printf("File %s found in cache", *name)
		*reply = file
		return nil
	} else {
		log.Printf("File %s not found in cache", *name)
		f := types.File{Name: *name}
		a.store.Cache[*name] = f
		*reply = f
		return nil
	}
}

func createServer() {
	az := Analyzer{}
	az.store = types.Store{}
	az.store.Cache = make(map[string]types.File)

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
