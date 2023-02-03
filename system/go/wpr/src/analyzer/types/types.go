package types

type File struct {
	Name    string
	Content string
	Digest  string
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
	sigs  map[File]Signature
}
