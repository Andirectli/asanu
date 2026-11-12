// Command asanu-server is the central API for the Asanu desktop app.
package main

import (
	"bufio"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

const appVersion = "0.8.0"

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func dbPath() string { return filepath.Join(env("ASANU_DATA_DIR", "/data"), "asanu.db") }

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)
	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	var err error
	switch cmd {
	case "serve":
		err = serve()
	case "health":
		err = health()
	case "user-add", "passwd":
		err = userCmd(cmd, os.Args[2:])
	case "backup":
		if len(os.Args) != 3 {
			err = errors.New("usage: asanu-server backup <target-file>")
		} else {
			err = backup(os.Args[2])
		}
	default:
		err = fmt.Errorf("unknown command %q (serve|health|user-add|passwd|backup)", cmd)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func serve() error {
	if err := os.MkdirAll(filepath.Dir(dbPath()), 0o700); err != nil {
		return err
	}
	db, err := openDB(dbPath())
	if err != nil {
		return err
	}
	defer db.Close()
	if err := bootstrapUser(db); err != nil {
		return err
	}
	a := newAPI(db)
	srv := &http.Server{
		Addr:              env("ASANU_ADDR", ":8080"),
		Handler:           a.routes(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		a.events.closeAll()
		sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(sctx)
	}()
	log.Printf("asanu-server %s listening on %s, db %s", appVersion, srv.Addr, dbPath())
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	log.Print("stopped")
	return nil
}

// health is used by the container HEALTHCHECK (scratch image has no curl).
func health() error {
	addr := env("ASANU_ADDR", ":8080")
	if strings.HasPrefix(addr, ":") {
		addr = "127.0.0.1" + addr
	}
	c := http.Client{Timeout: 3 * time.Second}
	res, err := c.Get("http://" + addr + "/api/health")
	if err != nil {
		return err
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("status %d", res.StatusCode)
	}
	return nil
}

// bootstrapUser creates the first account from env vars when the db has no users.
func bootstrapUser(db *sql.DB) error {
	email, pw := os.Getenv("ASANU_INIT_EMAIL"), os.Getenv("ASANU_INIT_PASSWORD")
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	if email == "" || pw == "" {
		log.Print("no users yet: set ASANU_INIT_EMAIL and ASANU_INIT_PASSWORD or run `asanu-server user-add`")
		return nil
	}
	if err := createUser(db, email, env("ASANU_INIT_NAME", strings.Split(email, "@")[0]), pw); err != nil {
		return err
	}
	log.Printf("created initial user %s", email)
	return nil
}

func readPassword() (string, error) {
	fmt.Fprint(os.Stderr, "password (input visible unless piped): ")
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

func userCmd(cmd string, args []string) error {
	if (cmd == "user-add" && len(args) != 2) || (cmd == "passwd" && len(args) != 1) {
		return errors.New("usage: asanu-server user-add <email> <name> | passwd <email>  (password via stdin)")
	}
	db, err := openDB(dbPath())
	if err != nil {
		return err
	}
	defer db.Close()
	pw, err := readPassword()
	if err != nil {
		return err
	}
	if cmd == "user-add" {
		return createUser(db, args[0], args[1], pw)
	}
	return setPassword(db, args[0], pw)
}

// backup writes a consistent snapshot while the server keeps running.
// target "-" streams it to stdout (docker exec … backup - > file), using a temp file in the data dir.
func backup(target string) error {
	if target == "-" {
		tmp := filepath.Join(filepath.Dir(dbPath()), fmt.Sprintf(".backup-%d.db", os.Getpid()))
		defer os.Remove(tmp)
		if err := backupTo(tmp); err != nil {
			return err
		}
		f, err := os.Open(tmp)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(os.Stdout, f)
		return err
	}
	if err := backupTo(target); err != nil {
		return err
	}
	fmt.Println("backup written to", target)
	return nil
}

func backupTo(target string) error {
	if _, err := os.Stat(target); err == nil {
		return fmt.Errorf("%s already exists", target)
	}
	db, err := openDB(dbPath())
	if err != nil {
		return err
	}
	defer db.Close()
	if _, err := db.Exec(`VACUUM INTO ?`, target); err != nil {
		return err
	}
	// contains password hashes and session hashes: owner-only
	return os.Chmod(target, 0o600)
}
