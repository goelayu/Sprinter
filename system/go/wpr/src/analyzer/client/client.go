package client

import (
	"log"
	"net/rpc"
)

// client for analyzer server

func NewClient() *rpc.Client {
	client, err := rpc.Dial("tcp", "localhost:1234")
	if err != nil {
		log.Fatal("dialing:", err)
	}
	return client
}
