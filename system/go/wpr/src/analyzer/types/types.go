package types

import "io"

type Azargs struct {
	Name    string
	Body    io.Reader
	Headers map[string][]string
}

type Azreply struct {
	Body    io.Reader
	Headers map[string][]string
}

type File struct {
	Name     string
	Content  string
	Digest   string
	SContent string //content with instrumentation code
	Body     io.Reader
	Headers  map[string][]string
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
