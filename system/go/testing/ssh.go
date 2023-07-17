package main

import (
	"fmt"
	"log"
	"os"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

func main() {
	// A public key may be used to authenticate against the remote
	// server by using an unencrypted PEM-encoded private key file.
	//
	// If you have an encrypted private key, the crypto/x509 package
	// can be used to decrypt it.
	key, err := os.ReadFile("/vault-home/goelayu/.ssh/id_rsa")
	if err != nil {
		log.Fatalf("unable to read private key: %v", err)
	}

	// Create the Signer for this private key.
	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		log.Fatalf("unable to parse private key: %v", err)
	}

	var hostkeyCallback ssh.HostKeyCallback
	hostkeyCallback, err = knownhosts.New("/vault-home/goelayu/.ssh/known_hosts")
	if err != nil {
		fmt.Println(err.Error())
	}

	config := &ssh.ClientConfig{
		User: "goelayu",
		Auth: []ssh.AuthMethod{
			// Use the PublicKeys method for remote authentication.
			ssh.PublicKeys(signer),
		},
		HostKeyCallback: hostkeyCallback,
	}

	// Connect to the remote server and perform the SSH handshake.
	client, err := ssh.Dial("tcp", "redwings.eecs.umich.edu:22", config)
	if err != nil {
		log.Fatalf("unable to connect: %v", err)
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		log.Fatal("unable to create session: ", err)
	}

	defer session.Close()

	// execute ls command on remote server
	var b []byte
	b, _ = session.Output("ulimit -Sn")
	// _, err = session.Output("ls -l /w/")
	// if err != nil {
	// 	log.Fatal("unable to execute remote command: ", err)
	// }
	log.Println(string(b))

}
