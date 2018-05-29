package main

import (
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/user"
	"path/filepath"
	"strings"

	"github.com/ant0ine/go-json-rest/rest"
	"github.com/lightningnetwork/lnd/lnrpc"
	"github.com/lightningnetwork/lnd/macaroons"
	"github.com/roasbeef/btcutil"
	grpc "google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	macaroon "gopkg.in/macaroon.v2"
)

const (
	defaultTLSCertFilename  = "tls.cert"
	defaultMacaroonFilename = "invoice.macaroon"
)

var (
	tlsCert     string
	rpcMacaroon string
	rpcServer   = defaultRPCServer
	lndDir      = defaultLndDir

	defaultLndDir       = btcutil.AppDataDir("lnd", false)
	defaultTLSCertPath  = filepath.Join(defaultLndDir, defaultTLSCertFilename)
	defaultMacaroonPath = filepath.Join(defaultLndDir, defaultMacaroonFilename)
	defaultRPCServer    = "localhost:10009"
)

func fatal(err error) {
	fmt.Fprintf(os.Stderr, "[chat-backend] %v\n", err)
	os.Exit(1)
}

func getClient() (lnrpc.LightningClient, func()) {
	conn := getClientConn()

	cleanUp := func() {
		conn.Close()
	}

	return lnrpc.NewLightningClient(conn), cleanUp
}

// Taken from lnd's lncli command.
func getClientConn() *grpc.ClientConn {
	lndDir := cleanAndExpandPath(lndDir)
	if lndDir != defaultLndDir {
		// If a custom lnd directory was set, we'll also check if custom
		// paths for the TLS cert and macaroon file were set as well. If
		// not, we'll override their paths so they can be found within
		// the custom lnd directory set. This allows us to set a custom
		// lnd directory, along with custom paths to the TLS cert and
		// macaroon file.
		tlsCertPath := cleanAndExpandPath(tlsCert)
		if tlsCertPath == defaultTLSCertPath {
			tlsCert = filepath.Join(lndDir, defaultTLSCertFilename)
		}

		macPath := cleanAndExpandPath(rpcMacaroon)
		if macPath == defaultMacaroonPath {
			rpcMacaroon = filepath.Join(lndDir, defaultMacaroonFilename)
		}
	}

	// Load the specified TLS certificate and build transport credentials
	// with it.
	tlsCertPath := cleanAndExpandPath(tlsCert)
	creds, err := credentials.NewClientTLSFromFile(tlsCertPath, "")
	if err != nil {
		fatal(err)
	}

	// Create a dial options array.
	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(creds),
	}

	// Load the specified macaroon file.
	macPath := cleanAndExpandPath(rpcMacaroon)
	macBytes, err := ioutil.ReadFile(macPath)
	if err != nil {
		fatal(err)
	}
	mac := &macaroon.Macaroon{}
	if err = mac.UnmarshalBinary(macBytes); err != nil {
		fatal(err)
	}

	macConstraints := []macaroons.Constraint{
		// We add a time-based constraint to prevent replay of the
		// macaroon. It's good for 60 seconds by default to make up for
		// any discrepancy between client and server clocks, but leaking
		// the macaroon before it becomes invalid makes it possible for
		// an attacker to reuse the macaroon. In addition, the validity
		// time of the macaroon is extended by the time the server clock
		// is behind the client clock, or shortened by the time the
		// server clock is ahead of the client clock (or invalid
		// altogether if, in the latter case, this time is more than 60
		// seconds).
		// TODO(aakselrod): add better anti-replay protection.
		macaroons.TimeoutConstraint(60),
	}

	// Apply constraints to the macaroon.
	constrainedMac, err := macaroons.AddConstraints(mac, macConstraints...)
	if err != nil {
		fatal(err)
	}

	// Now we append the macaroon credentials to the dial options.
	cred := macaroons.NewMacaroonCredential(constrainedMac)
	opts = append(opts, grpc.WithPerRPCCredentials(cred))

	conn, err := grpc.Dial(rpcServer, opts...)
	if err != nil {
		fatal(err)
	}

	return conn
}

func main() {
	tlsCert = *flag.String("tlsCert", defaultTLSCertPath, "path for the certificate used by the lnd server.")
	rpcMacaroon = *flag.String("macaroon", defaultMacaroonPath, " path for the macaroon.")
	rpcServer = *flag.String("rpcServer", defaultRPCServer, "rpc server to connect to.")
	flag.Parse()

	api := rest.NewApi()
	api.Use(rest.DefaultDevStack...)
	api.Use(&rest.CorsMiddleware{
		RejectNonCorsRequests: false,
		OriginValidator: func(origin string, request *rest.Request) bool {
			return true
		},
		AllowedMethods: []string{"GET", "POST", "PUT"},
		AllowedHeaders: []string{
			"Accept", "Content-Type", "X-Custom-Header", "Origin"},
		AccessControlAllowCredentials: true,
		AccessControlMaxAge:           3600,
	})
	router, err := rest.MakeRouter(
		rest.Get("/pubkey", getPubkey),
		rest.Get("/invoice/:memo", getInvoice),
	)
	if err != nil {
		fatal(err)
	}
	api.SetApp(router)
	log.Fatal(http.ListenAndServe(":8080", api.MakeHandler()))
}

// cleanAndExpandPath expands environment variables and leading ~ in the
// passed path, cleans the result, and returns it.
// This function is taken from https://github.com/btcsuite/btcd
func cleanAndExpandPath(path string) string {
	// Expand initial ~ to OS specific home directory.
	if strings.HasPrefix(path, "~") {
		var homeDir string

		user, err := user.Current()
		if err == nil {
			homeDir = user.HomeDir
		} else {
			homeDir = os.Getenv("HOME")
		}

		path = strings.Replace(path, "~", homeDir, 1)
	}

	// NOTE: The os.ExpandEnv doesn't work with Windows-style %VARIABLE%,
	// but the variables can still be expanded via POSIX-style $VARIABLE.
	return filepath.Clean(os.ExpandEnv(path))
}
