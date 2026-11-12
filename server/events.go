package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Event tells clients what changed; clients refetch from the API (server stays the source of truth).
type Event struct {
	Type      string `json:"type"` // project|section|task|label|comment
	ID        int64  `json:"id"`
	ProjectID int64  `json:"projectId,omitempty"`
	TaskID    int64  `json:"taskId,omitempty"`
	Origin    string `json:"origin,omitempty"` // client id that caused it
}

type broker struct {
	mu   sync.Mutex
	subs map[chan Event]struct{}
}

func (b *broker) publish(e Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for c := range b.subs {
		select {
		case c <- e:
		default:
			// slow client: drop the connection, it reconnects and refetches everything
			delete(b.subs, c)
			close(c)
		}
	}
}

func (b *broker) closeAll() {
	b.mu.Lock()
	defer b.mu.Unlock()
	for c := range b.subs {
		delete(b.subs, c)
		close(c)
	}
}

func (a *API) events_(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		fail(w, 500, "streaming unsupported")
		return
	}
	c := make(chan Event, 64)
	a.events.mu.Lock()
	a.events.subs[c] = struct{}{}
	a.events.mu.Unlock()
	defer func() {
		a.events.mu.Lock()
		if _, ok := a.events.subs[c]; ok {
			delete(a.events.subs, c)
			close(c)
		}
		a.events.mu.Unlock()
	}()

	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-store")
	h.Set("X-Accel-Buffering", "no")
	fmt.Fprint(w, "event: hello\ndata: {}\n\n")
	fl.Flush()
	tick := time.NewTicker(25 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-tick.C:
			fmt.Fprint(w, ": ping\n\n")
			fl.Flush()
		case e, ok := <-c:
			if !ok {
				return
			}
			b, _ := json.Marshal(e)
			fmt.Fprintf(w, "data: %s\n\n", b)
			fl.Flush()
		}
	}
}
