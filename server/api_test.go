package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type client struct {
	t     *testing.T
	base  string
	token string
}

func (c *client) do(method, path string, body any, out any) int {
	c.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.base+path, rd)
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	if out != nil {
		json.NewDecoder(res.Body).Decode(out)
	}
	return res.StatusCode
}

func (c *client) login(email, pw string) {
	var out struct{ Token string }
	if code := c.do("POST", "/api/login", map[string]string{"email": email, "password": pw, "device": "test"}, &out); code != 200 {
		c.t.Fatalf("login: %d", code)
	}
	c.token = out.Token
}

// subscribe returns a channel of SSE data lines.
func (c *client) subscribe() chan Event {
	req, _ := http.NewRequest("GET", c.base+"/api/events", nil)
	req.Header.Set("Authorization", "Bearer "+c.token)
	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != 200 {
		c.t.Fatalf("subscribe: %v", err)
	}
	ch := make(chan Event, 16)
	go func() {
		defer res.Body.Close()
		sc := bufio.NewScanner(res.Body)
		for sc.Scan() {
			if d, ok := strings.CutPrefix(sc.Text(), "data: "); ok && d != "{}" {
				var e Event
				json.Unmarshal([]byte(d), &e)
				ch <- e
			}
		}
	}()
	c.t.Cleanup(func() { res.Body.Close() })
	return ch
}

func wait(t *testing.T, ch chan Event, typ string) Event {
	t.Helper()
	select {
	case e := <-ch:
		if e.Type != typ {
			t.Fatalf("event %+v, want %s", e, typ)
		}
		return e
	case <-time.After(2 * time.Second):
		t.Fatalf("no %s event", typ)
	}
	return Event{}
}

func setup(t *testing.T, dbfile string) (*httptest.Server, func()) {
	db, err := openDB(dbfile)
	if err != nil {
		t.Fatal(err)
	}
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	if n == 0 {
		if err := createUser(db, "me@home.lan", "Ich", "correct-horse-1"); err != nil {
			t.Fatal(err)
		}
	}
	a := newAPI(db)
	srv := httptest.NewServer(a.routes())
	return srv, func() { a.events.closeAll(); srv.Close(); db.Close() }
}

func TestTwoClientsConflictsAndRestart(t *testing.T) {
	dbfile := filepath.Join(t.TempDir(), "asanu.db")
	srv, stop := setup(t, dbfile)

	A := &client{t: t, base: srv.URL}
	B := &client{t: t, base: srv.URL}
	if code := A.do("GET", "/api/projects", nil, nil); code != 401 {
		t.Fatalf("unauthenticated access: %d", code)
	}
	if code := A.do("POST", "/api/login", map[string]string{"email": "me@home.lan", "password": "wrong-password"}, nil); code != 401 {
		t.Fatalf("wrong password: %d", code)
	}
	A.login("me@home.lan", "correct-horse-1")
	B.login("me@home.lan", "correct-horse-1")
	evB := B.subscribe()
	evA := A.subscribe()

	// A creates project + task, B sees it
	var p Project
	if code := A.do("POST", "/api/projects", map[string]string{"name": "Haushalt", "color": "#f06a6a"}, &p); code != 201 {
		t.Fatalf("create project %d", code)
	}
	wait(t, evB, "project")
	wait(t, evA, "project")
	var board struct {
		Sections []Section
		Tasks    []Task
	}
	B.do("GET", fmt.Sprintf("/api/projects/%d/board", p.ID), nil, &board)
	if len(board.Sections) != 3 {
		t.Fatalf("default sections: %d", len(board.Sections))
	}
	s0, s1 := board.Sections[0].ID, board.Sections[1].ID
	var task Task
	A.do("POST", "/api/tasks", map[string]any{"projectId": p.ID, "sectionId": s0, "title": "Müll rausbringen"}, &task)
	wait(t, evB, "task")
	wait(t, evA, "task")

	// B edits, A receives event and sees the change
	var bTask Task
	if code := B.do("PATCH", fmt.Sprintf("/api/tasks/%d", task.ID), map[string]any{"version": task.Version, "priority": "high", "dueDate": "2026-11-20"}, &bTask); code != 200 {
		t.Fatalf("B update: %d", code)
	}
	e := wait(t, evA, "task")
	wait(t, evB, "task")
	if e.ID != task.ID {
		t.Fatalf("event id %d", e.ID)
	}

	// A still holds the old version -> 409 with current state, nothing overwritten
	var conflict struct {
		Error   string
		Current Task
	}
	if code := A.do("PATCH", fmt.Sprintf("/api/tasks/%d", task.ID), map[string]any{"version": task.Version, "title": "stale"}, &conflict); code != 409 {
		t.Fatalf("expected conflict, got %d", code)
	}
	if conflict.Current.Priority != "high" || conflict.Current.Title != "Müll rausbringen" {
		t.Fatalf("conflict current: %+v", conflict.Current)
	}

	// validation
	for _, body := range []map[string]any{
		{"version": bTask.Version, "title": "   "},
		{"version": bTask.Version, "dueDate": "2026-02-30"},
		{"version": bTask.Version, "priority": "urgent"},
		{"version": bTask.Version, "bogus": 1},
	} {
		if code := A.do("PATCH", fmt.Sprintf("/api/tasks/%d", task.ID), body, nil); code != 400 {
			t.Fatalf("validation %v: %d", body, code)
		}
	}

	// ordering: three tasks, move last to front of another section
	var t2, t3 Task
	A.do("POST", "/api/tasks", map[string]any{"projectId": p.ID, "sectionId": s0, "title": "zwei"}, &t2)
	A.do("POST", "/api/tasks", map[string]any{"projectId": p.ID, "sectionId": s0, "title": "drei"}, &t3)
	A.do("POST", fmt.Sprintf("/api/tasks/%d/move", t3.ID), map[string]any{"sectionId": s1, "index": 0}, nil)
	A.do("POST", fmt.Sprintf("/api/tasks/%d/move", t2.ID), map[string]any{"sectionId": s1, "index": 0}, nil)
	// subtask, label, comment, completion
	var sub Task
	A.do("POST", "/api/tasks", map[string]any{"parentId": task.ID, "title": "Tüten kaufen"}, &sub)
	var lbl Label
	A.do("POST", "/api/labels", map[string]string{"name": "Wohnung", "color": "#4ecbc4"}, &lbl)
	if code := A.do("PATCH", fmt.Sprintf("/api/tasks/%d", task.ID), map[string]any{"version": bTask.Version, "labelIds": []int64{lbl.ID}, "completed": true}, nil); code != 200 {
		t.Fatalf("labels: %d", code)
	}
	if code := B.do("POST", fmt.Sprintf("/api/tasks/%d/comments", task.ID), map[string]string{"body": "erledigt am Abend"}, nil); code != 201 {
		t.Fatalf("comment: %d", code)
	}
	var found []Task
	A.do("GET", "/api/search?q=m%C3%BCll&completed=1", nil, &found)
	if len(found) != 1 {
		t.Fatalf("search: %d", len(found))
	}
	A.do("GET", "/api/search?q=%25", nil, &found)
	if len(found) != 0 {
		t.Fatalf("wildcard escaped search returned %d", len(found))
	}

	// restart: everything persisted, sessions survive
	stop()
	srv, stop = setup(t, dbfile)
	defer stop()
	A.base = srv.URL
	var detail struct {
		Task     Task
		Subtasks []Task
		Comments []Comment
	}
	if code := A.do("GET", fmt.Sprintf("/api/tasks/%d", task.ID), nil, &detail); code != 200 {
		t.Fatalf("after restart: %d", code)
	}
	if !detail.Task.Completed || detail.Task.Priority != "high" || len(detail.Task.LabelIDs) != 1 || len(detail.Subtasks) != 1 || len(detail.Comments) != 1 || detail.Comments[0].UserName != "Ich" {
		t.Fatalf("persisted detail: %+v", detail)
	}
	A.do("GET", fmt.Sprintf("/api/projects/%d/board", p.ID), nil, &board)
	var order []string
	for _, tk := range board.Tasks {
		if tk.SectionID != nil && *tk.SectionID == s1 {
			order = append(order, tk.Title)
		}
	}
	if strings.Join(order, ",") != "zwei,drei" {
		t.Fatalf("order after restart: %v", order)
	}

	// section with tasks cannot be deleted; empty one can
	if code := A.do("DELETE", fmt.Sprintf("/api/sections/%d", s1), nil, nil); code != 409 {
		t.Fatalf("delete non-empty section: %d", code)
	}
	if code := A.do("DELETE", fmt.Sprintf("/api/sections/%d", board.Sections[2].ID), nil, nil); code != 204 {
		t.Fatalf("delete empty section: %d", code)
	}

	// logout invalidates only that device
	A.do("POST", "/api/logout", nil, nil)
	if code := A.do("GET", "/api/me", nil, nil); code != 401 {
		t.Fatalf("after logout: %d", code)
	}
}

func TestBetweenRenumbers(t *testing.T) {
	if p, ok := between([]float64{1, 1 + 1e-9}, 1); ok {
		t.Fatalf("expected exhausted gap, got %v", p)
	}
	if p, _ := between([]float64{1024, 2048}, 1); p != 1536 {
		t.Fatal(p)
	}
}

func TestBackupIsConsistentCopy(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("ASANU_DATA_DIR", dir)
	srv, stop := setup(t, dbPath())
	defer stop()
	c := &client{t: t, base: srv.URL}
	c.login("me@home.lan", "correct-horse-1")
	c.do("POST", "/api/projects", map[string]string{"name": "Backup-Test", "color": "#aa62e3"}, nil)
	target := filepath.Join(dir, "backup.db")
	if err := backup(target); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(target)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var name string
	if err := db.QueryRow(`SELECT name FROM projects`).Scan(&name); err != nil || name != "Backup-Test" {
		t.Fatalf("backup content: %q %v", name, err)
	}
	if err := backup(target); err == nil {
		t.Fatal("backup must not overwrite")
	}
}

func TestV02AssigneeMyTasksDepsStatus(t *testing.T) {
	srv, stop := setup(t, filepath.Join(t.TempDir(), "asanu.db"))
	defer stop()
	c := &client{t: t, base: srv.URL}
	c.login("me@home.lan", "correct-horse-1")
	var me User
	c.do("GET", "/api/me", nil, &me)
	var p Project
	c.do("POST", "/api/projects", map[string]string{"name": "P", "color": "#4573d2"}, &p)
	var b struct{ Sections []Section }
	c.do("GET", fmt.Sprintf("/api/projects/%d/board", p.ID), nil, &b)
	mk := func(title string) Task {
		var tk Task
		c.do("POST", "/api/tasks", map[string]any{"projectId": p.ID, "sectionId": b.Sections[0].ID, "title": title}, &tk)
		return tk
	}
	x, y, z := mk("x"), mk("y"), mk("z")
	patch := func(tk *Task, body map[string]any) int {
		body["version"] = tk.Version
		var out Task
		code := c.do("PATCH", fmt.Sprintf("/api/tasks/%d", tk.ID), body, &out)
		if code == 200 {
			*tk = out
		}
		return code
	}
	soon := time.Now().AddDate(0, 0, 2).Format("2006-01-02")
	if code := patch(&x, map[string]any{"assigneeId": me.ID, "startDate": "2026-01-01", "dueDate": soon, "status": "at_risk"}); code != 200 || x.AssigneeID == nil || x.Status != "at_risk" {
		t.Fatalf("assign: %d %+v", code, x)
	}
	if code := patch(&x, map[string]any{"mySection": "today"}); code != 200 || x.MySection != "today" {
		t.Fatalf("mySection: %d", code)
	}
	// re-assigning to the same person keeps the bucket; clearing resets it
	patch(&x, map[string]any{"assigneeId": me.ID})
	if x.MySection != "today" {
		t.Fatalf("same assignee reset bucket: %q", x.MySection)
	}
	for _, bad := range []map[string]any{{"startDate": "2099-01-01"}, {"status": "great"}, {"mySection": "someday"}, {"assigneeId": 999}} {
		if code := patch(&x, bad); code != 400 {
			t.Fatalf("validation %v: %d", bad, code)
		}
	}
	var mine []Task
	c.do("GET", "/api/my-tasks", nil, &mine)
	if len(mine) != 1 || mine[0].ID != x.ID {
		t.Fatalf("my tasks: %+v", mine)
	}
	// dependencies: y waits for x, z waits for y; x waiting for z would be a cycle
	if code := patch(&y, map[string]any{"blockedBy": []int64{x.ID}}); code != 200 || y.OpenBlockers != 1 {
		t.Fatalf("dep: %d %+v", code, y)
	}
	patch(&z, map[string]any{"blockedBy": []int64{y.ID}})
	if code := patch(&x, map[string]any{"blockedBy": []int64{z.ID}}); code != 400 {
		t.Fatalf("cycle accepted: %d", code)
	}
	if code := patch(&x, map[string]any{"blockedBy": []int64{x.ID}}); code != 400 {
		t.Fatalf("self dep accepted: %d", code)
	}
	patch(&x, map[string]any{"completed": true})
	var d struct {
		Task      Task
		BlockedBy []Task
		Blocking  []Task
	}
	c.do("GET", fmt.Sprintf("/api/tasks/%d", y.ID), nil, &d)
	if d.Task.OpenBlockers != 0 || len(d.BlockedBy) != 1 || len(d.Blocking) != 1 {
		t.Fatalf("detail deps: %+v", d)
	}
	var ps []Project
	c.do("GET", "/api/projects", nil, &ps)
	if ps[0].OpenTasks != 2 || ps[0].DueSoon != 0 {
		t.Fatalf("project stats: %+v", ps[0])
	}
}

func TestMigrationFromV1KeepsData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	all := migrations
	migrations = all[:1] // simulate a 0.1.0 database
	db, err := openDB(path)
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`INSERT INTO projects(name,color,position) VALUES ('alt','#000000',1)`)
	db.Exec(`INSERT INTO tasks(project_id,title,position) VALUES (1,'alte Aufgabe',1)`)
	db.Close()
	migrations = all
	db, err = openDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	tk, err := getTask(db, 1)
	if err != nil || tk.Title != "alte Aufgabe" || tk.AssigneeID != nil || tk.Status != "" {
		t.Fatalf("migrated task: %+v %v", tk, err)
	}
}

func TestBackupToStdout(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("ASANU_DATA_DIR", dir)
	_, stop := setup(t, dbPath())
	defer stop()
	out := filepath.Join(dir, "stream.db")
	f, _ := os.Create(out)
	old := os.Stdout
	os.Stdout = f
	err := backup("-")
	os.Stdout = old
	f.Close()
	if err != nil {
		t.Fatal(err)
	}
	db, err := openDB(out)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("streamed backup: %d %v", n, err)
	}
	if left, _ := filepath.Glob(filepath.Join(dir, ".backup-*")); len(left) != 0 {
		t.Fatalf("temp file left: %v", left)
	}
}

func TestProjectOverviewStatusAndDescription(t *testing.T) {
	srv, stop := setup(t, filepath.Join(t.TempDir(), "asanu.db"))
	defer stop()
	c := &client{t: t, base: srv.URL}
	c.login("me@home.lan", "correct-horse-1")
	var p Project
	c.do("POST", "/api/projects", map[string]string{"name": "P", "color": "#4573d2"}, &p)
	if p.Status != "" || p.CreatedAt == "" {
		t.Fatalf("new project: %+v", p)
	}
	for _, bad := range []map[string]string{{"status": ""}, {"status": "great"}} {
		if code := c.do("POST", fmt.Sprintf("/api/projects/%d/updates", p.ID), bad, nil); code != 400 {
			t.Fatalf("bad update %v: %d", bad, code)
		}
	}
	if code := c.do("POST", "/api/projects/999/updates", map[string]string{"status": "on_track"}, nil); code != 404 {
		t.Fatalf("unknown project: %d", code)
	}
	c.do("POST", fmt.Sprintf("/api/projects/%d/updates", p.ID), map[string]string{"status": "on_track", "body": "läuft"}, nil)
	c.do("POST", fmt.Sprintf("/api/projects/%d/updates", p.ID), map[string]string{"status": "at_risk", "body": "Lieferung verzögert"}, nil)
	var ups []ProjectUpdate
	c.do("GET", fmt.Sprintf("/api/projects/%d/updates", p.ID), nil, &ups)
	if len(ups) != 2 || ups[0].Status != "at_risk" || ups[0].UserName != "Ich" {
		t.Fatalf("updates (newest first): %+v", ups)
	}
	var d Project
	if code := c.do("PATCH", fmt.Sprintf("/api/projects/%d", p.ID), map[string]any{"version": p.Version, "description": "Bad renovieren"}, &d); code != 200 || d.Description != "Bad renovieren" || d.Status != "at_risk" {
		t.Fatalf("description: %d %+v", code, d)
	}
	var ps []Project
	c.do("GET", "/api/projects", nil, &ps)
	if ps[0].Status != "at_risk" || ps[0].Description != "Bad renovieren" {
		t.Fatalf("list: %+v", ps[0])
	}
}
