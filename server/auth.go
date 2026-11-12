package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"net/mail"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12

type User struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

func validCredentials(email, pw string) error {
	if _, err := mail.ParseAddress(email); err != nil || len(email) > 254 {
		return errors.New("invalid email")
	}
	if len(pw) < 10 || len(pw) > 72 { // bcrypt ignores bytes past 72
		return errors.New("password must be 10-72 characters")
	}
	return nil
}

func createUser(db *sql.DB, email, name, pw string) error {
	email = strings.TrimSpace(email)
	if err := validCredentials(email, pw); err != nil {
		return err
	}
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcryptCost)
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO users(email,name,password_hash) VALUES (?,?,?)`, email, strings.TrimSpace(name), string(h))
	return err
}

func setPassword(db *sql.DB, email, pw string) error {
	if err := validCredentials(email, pw); err != nil {
		return err
	}
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcryptCost)
	if err != nil {
		return err
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.Exec(`UPDATE users SET password_hash=? WHERE email=?`, string(h), email)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("no such user")
	}
	// a password change logs out every device
	if _, err := tx.Exec(`DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=?)`, email); err != nil {
		return err
	}
	return tx.Commit()
}

func hashToken(t string) string {
	s := sha256.Sum256([]byte(t))
	return hex.EncodeToString(s[:])
}

func newToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// loginLimiter slows brute force: 8 failures per IP per 15 minutes.
type loginLimiter struct {
	mu   sync.Mutex
	fail map[string][]time.Time
}

func (l *loginLimiter) blocked(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	cut := time.Now().Add(-15 * time.Minute)
	keep := l.fail[ip][:0]
	for _, t := range l.fail[ip] {
		if t.After(cut) {
			keep = append(keep, t)
		}
	}
	l.fail[ip] = keep
	return len(keep) >= 8
}

func (l *loginLimiter) failed(ip string) {
	l.mu.Lock()
	l.fail[ip] = append(l.fail[ip], time.Now())
	l.mu.Unlock()
}

func clientIP(r *http.Request) string {
	h, _, _ := net.SplitHostPort(r.RemoteAddr)
	return h
}

// dummyHash keeps login timing equal for unknown emails.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("asanu-dummy-password"), bcryptCost)

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password, Device string }
	if !decode(w, r, &in) {
		return
	}
	ip := clientIP(r)
	if a.limiter.blocked(ip) {
		fail(w, 429, "too many failed logins, wait 15 minutes")
		return
	}
	var u User
	var hash string
	err := a.db.QueryRow(`SELECT id,email,name,password_hash FROM users WHERE email=?`, strings.TrimSpace(in.Email)).Scan(&u.ID, &u.Email, &u.Name, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		bcrypt.CompareHashAndPassword(dummyHash, []byte(in.Password))
		a.limiter.failed(ip)
		fail(w, 401, "wrong email or password")
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		a.limiter.failed(ip)
		fail(w, 401, "wrong email or password")
		return
	}
	tok := newToken()
	if len(in.Device) > 100 {
		in.Device = in.Device[:100]
	}
	if _, err := a.db.Exec(`INSERT INTO sessions(token_hash,user_id,device) VALUES (?,?,?)`, hashToken(tok), u.ID, in.Device); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"token": tok, "user": u})
}

func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	if _, err := a.db.Exec(`DELETE FROM sessions WHERE token_hash=?`, hashToken(bearer(r))); err != nil {
		serverError(w, err)
		return
	}
	w.WriteHeader(204)
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

type ctxKey struct{}

func userFrom(r *http.Request) User { return r.Context().Value(ctxKey{}).(User) }

// authed rejects requests without a valid session token.
func (a *API) authed(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := bearer(r)
		if tok == "" {
			fail(w, 401, "not logged in")
			return
		}
		var u User
		th := hashToken(tok)
		err := a.db.QueryRow(`SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`, th).Scan(&u.ID, &u.Email, &u.Name)
		if errors.Is(err, sql.ErrNoRows) {
			fail(w, 401, "session expired, please log in again")
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		a.touch(th)
		h(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
	}
}

// touch updates last_seen at most every 10 minutes per session to avoid a write per request.
func (a *API) touch(th string) {
	a.seenMu.Lock()
	last := a.seen[th]
	now := time.Now()
	if now.Sub(last) < 10*time.Minute {
		a.seenMu.Unlock()
		return
	}
	a.seen[th] = now
	a.seenMu.Unlock()
	a.db.Exec(`UPDATE sessions SET last_seen=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?`, th)
}
