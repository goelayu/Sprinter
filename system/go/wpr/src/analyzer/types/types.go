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
	InstBody string //content with instrumentation code
	SigBody  string //content with signature
	Body     string
	Headers  http.Header
	Sig      Signature
	Status   int // body status code; 1 -> instrumented, 2 -> signature
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
