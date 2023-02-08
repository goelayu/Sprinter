package types

import (
	"net/http"

	pb "wpr/src/analyzer/proto"
)

type Azargs struct {
	Name    string
	Body    []byte
	Headers http.Header
}

type Azreply struct {
	Body    string
	Headers http.Header
	CL      int64
}

type File struct {
	Name     string
	Content  string
	Digest   string
	SContent string //content with instrumentation code
	Body     string
	Headers  http.Header
	Sig      Signature
}

type Signature struct {
	Input   []pb.Lineaccess
	Output  []pb.Lineaccess
	Fetches []*pb.Fetches
}

type Store struct {
	Cache map[string]*File
	Files []File
	// sigs  map[File]Signature
}
