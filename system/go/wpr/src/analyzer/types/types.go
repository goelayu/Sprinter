package types

import (
	"net/http"
)

type Azargs struct {
	Name    string
	Body    []byte
	Headers http.Header
}

type Azreply struct {
	Body    []byte
	Headers http.Header
}

type File struct {
	Name     string
	Content  string
	Digest   string
	SContent string //content with instrumentation code
	Body     []byte
	Headers  http.Header
}

type State struct {
	reads  string
	writes string
}

type Signature struct {
	file  File
	state State
	urls  []string
}

type Store struct {
	Cache map[string]File
	Files []File
	// sigs  map[File]Signature
}
