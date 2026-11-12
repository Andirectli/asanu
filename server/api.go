package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"
)

type API struct {
	db                     *sql.DB
	events                 *broker
	limiter                *loginLimiter
	origins                map[string]bool
	seenMu                 sync.Mutex
	seen                   map[string]time.Time
	updateURL, updateToken string // optional sidecar (Watchtower) that replaces this container
	updating               atomic.Bool
}

func newAPI(db *sql.DB) *API {
	origins := map[string]bool{}
	for _, o := range strings.Split(env("ASANU_CORS_ORIGINS", "tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://localhost:1420"), ",") {
		origins[strings.TrimSpace(o)] = true
	}
	return &API{db: db, events: &broker{subs: map[chan Event]struct{}{}}, limiter: &loginLimiter{fail: map[string][]time.Time{}}, origins: origins, seen: map[string]time.Time{}, updateURL: os.Getenv("ASANU_UPDATE_URL"), updateToken: os.Getenv("ASANU_UPDATE_TOKEN")}
}

func (a *API) routes() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := a.db.Ping(); err != nil {
			fail(w, 503, "database unavailable")
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "app": "asanu", "version": appVersion, "updater": a.updateURL != ""})
	})
	m.HandleFunc("POST /api/login", a.login)
	m.HandleFunc("POST /api/logout", a.authed(a.logout))
	m.HandleFunc("GET /api/me", a.authed(func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, userFrom(r)) }))
	m.HandleFunc("GET /api/events", a.authed(a.events_))

	m.HandleFunc("GET /api/projects", a.authed(a.listProjects))
	m.HandleFunc("POST /api/projects", a.authed(a.createProject))
	m.HandleFunc("PATCH /api/projects/{id}", a.authed(a.updateProject))
	m.HandleFunc("GET /api/projects/{id}/board", a.authed(a.board))
	m.HandleFunc("GET /api/projects/{id}/updates", a.authed(a.listUpdates))
	m.HandleFunc("POST /api/projects/{id}/updates", a.authed(a.createUpdate))
	m.HandleFunc("POST /api/projects/{id}/sections", a.authed(a.createSection))
	m.HandleFunc("PATCH /api/sections/{id}", a.authed(a.updateSection))
	m.HandleFunc("DELETE /api/sections/{id}", a.authed(a.deleteSection))

	m.HandleFunc("POST /api/tasks", a.authed(a.createTask))
	m.HandleFunc("GET /api/tasks/{id}", a.authed(a.taskDetail))
	m.HandleFunc("PATCH /api/tasks/{id}", a.authed(a.updateTask))
	m.HandleFunc("POST /api/tasks/{id}/move", a.authed(a.moveTask))
	m.HandleFunc("DELETE /api/tasks/{id}", a.authed(a.deleteTask))
	m.HandleFunc("POST /api/tasks/{id}/comments", a.authed(a.createComment))

	m.HandleFunc("GET /api/labels", a.authed(a.listLabels))
	m.HandleFunc("POST /api/labels", a.authed(a.createLabel))
	m.HandleFunc("GET /api/search", a.authed(a.search))
	m.HandleFunc("POST /api/update", a.authed(a.update))
	m.HandleFunc("GET /api/users", a.authed(a.listUsers))
	m.HandleFunc("GET /api/my-tasks", a.authed(a.myTasks))
	return a.cors(m)
}

func (a *API) cors(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if o := r.Header.Get("Origin"); a.origins[o] {
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Vary", "Origin")
			if r.Method == http.MethodOptions {
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Max-Age", "600")
				w.WriteHeader(204)
				return
			}
		}
		h.ServeHTTP(w, r)
	})
}

// ---- helpers ----

type apiError struct {
	Error   string `json:"error"`
	Current any    `json:"current,omitempty"`
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, code int, msg string) { writeJSON(w, code, apiError{Error: msg}) }

func serverError(w http.ResponseWriter, err error) {
	log.Print("internal error: ", err)
	fail(w, 500, "internal server error")
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		fail(w, 400, "invalid request body: "+err.Error())
		return false
	}
	return true
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		fail(w, 400, "invalid id")
		return 0, false
	}
	return id, true
}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
var isoDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// text trims s and checks its length in characters.
func text(field, s string, min, max int) (string, error) {
	s = strings.TrimSpace(s)
	if n := utf8.RuneCountInString(s); n < min || n > max {
		if min > 0 && n == 0 {
			return "", errors.New(field + " must not be empty")
		}
		return "", errors.New(field + " must be at most " + strconv.Itoa(max) + " characters")
	}
	return s, nil
}

func validDate(s string) bool {
	if s == "" {
		return true
	}
	_, err := time.Parse("2006-01-02", s)
	return isoDate.MatchString(s) && err == nil
}

var priorities = map[string]bool{"": true, "low": true, "medium": true, "high": true}
var statuses = map[string]bool{"": true, "on_track": true, "at_risk": true, "off_track": true}
var mySections = map[string]bool{"": true, "today": true, "next_week": true, "later": true}

// badRequest aborts a transaction with a 400 answer.
type badRequest string

func (b badRequest) Error() string { return string(b) }

// setDependencies replaces the tasks that id waits for, rejecting self-references and cycles.
func setDependencies(tx *sql.Tx, id int64, blockers []int64) error {
	if _, err := tx.Exec(`DELETE FROM task_deps WHERE task_id=?`, id); err != nil {
		return err
	}
	for _, b := range blockers {
		if b == id {
			return badRequest("a task cannot wait for itself")
		}
		var n int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM tasks WHERE id=?`, b).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			return badRequest("dependency task not found")
		}
		// cycle if b already (transitively) waits for id
		if err := tx.QueryRow(`WITH RECURSIVE up(x) AS (
				SELECT blocked_by_id FROM task_deps WHERE task_id=?
				UNION SELECT d.blocked_by_id FROM task_deps d JOIN up ON d.task_id=up.x)
			SELECT COUNT(*) FROM up WHERE x=?`, b, id).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			return badRequest("dependency would create a cycle")
		}
		if _, err := tx.Exec(`INSERT OR IGNORE INTO task_deps(task_id, blocked_by_id) VALUES (?,?)`, id, b); err != nil {
			return err
		}
	}
	return nil
}

func now() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000Z") }

// ---- projects ----

type Project struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	Color       string  `json:"color"`
	Archived    bool    `json:"archived"`
	Position    float64 `json:"position"`
	Version     int64   `json:"version"`
	Description string  `json:"description"`
	Status      string  `json:"status"` // status of the latest update, "" if none
	CreatedAt   string  `json:"createdAt"`
	OpenTasks   int     `json:"openTasks"` // only filled by the project list
	DueSoon     int     `json:"dueSoon"`   // open tasks due within 7 days (incl. overdue)
}

const projectCols = `id,name,color,archived,position,version,description,created_at,
	COALESCE((SELECT u.status FROM project_updates u WHERE u.project_id=projects.id ORDER BY u.id DESC LIMIT 1),'')`

func scanProject(s interface{ Scan(...any) error }) (p Project, err error) {
	err = s.Scan(&p.ID, &p.Name, &p.Color, &p.Archived, &p.Position, &p.Version, &p.Description, &p.CreatedAt, &p.Status)
	return
}

func getProject(q querier, id int64) (Project, error) {
	return scanProject(q.QueryRow(`SELECT `+projectCols+` FROM projects WHERE id=?`, id))
}

type querier interface {
	QueryRow(string, ...any) *sql.Row
}

func (a *API) listProjects(w http.ResponseWriter, r *http.Request) {
	soon := time.Now().AddDate(0, 0, 7).Format("2006-01-02")
	rows, err := a.db.Query(`SELECT `+projectCols+`,
		(SELECT COUNT(*) FROM tasks t WHERE t.project_id=projects.id AND t.parent_id IS NULL AND t.completed=0),
		(SELECT COUNT(*) FROM tasks t WHERE t.project_id=projects.id AND t.completed=0 AND t.due_date<>'' AND t.due_date<=?)
		FROM projects ORDER BY archived, position`, soon)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	out := []Project{}
	for rows.Next() {
		var p Project
		err := rows.Scan(&p.ID, &p.Name, &p.Color, &p.Archived, &p.Position, &p.Version, &p.Description, &p.CreatedAt, &p.Status, &p.OpenTasks, &p.DueSoon)
		if err != nil {
			serverError(w, err)
			return
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, out)
}

func (a *API) createProject(w http.ResponseWriter, r *http.Request) {
	var in struct{ Name, Color string }
	if !decode(w, r, &in) {
		return
	}
	name, err := text("name", in.Name, 1, 200)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	if !hexColor.MatchString(in.Color) {
		fail(w, 400, "color must be #rrggbb")
		return
	}
	tx, err := a.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	res, err := tx.Exec(`INSERT INTO projects(name,color,position) VALUES (?,?,(SELECT COALESCE(MAX(position),0)+1024 FROM projects))`, name, in.Color)
	if err != nil {
		serverError(w, err)
		return
	}
	id, _ := res.LastInsertId()
	for i, s := range []string{"Zu erledigen", "In Arbeit", "Erledigt"} {
		if _, err := tx.Exec(`INSERT INTO sections(project_id,name,position) VALUES (?,?,?)`, id, s, (i+1)*1024); err != nil {
			serverError(w, err)
			return
		}
	}
	p, err := getProject(tx, id)
	if err != nil || tx.Commit() != nil {
		serverError(w, err)
		return
	}
	a.events.publish(Event{Type: "project", ID: id, ProjectID: id})
	writeJSON(w, 201, p)
}

// versionedUpdate runs UPDATE ... SET sets, version=version+1 WHERE id AND version.
// It returns 0 on success, 404 or 409 otherwise.
func versionedUpdate(tx *sql.Tx, table string, id, version int64, sets []string, args []any) (int, error) {
	if table == "tasks" || table == "projects" {
		sets = append(sets, "updated_at=?")
		args = append(args, now())
	}
	q := `UPDATE ` + table + ` SET ` + strings.Join(append(sets, "version=version+1"), ",") + ` WHERE id=? AND version=?`
	res, err := tx.Exec(q, append(args, id, version)...)
	if err != nil {
		return 0, err
	}
	if n, _ := res.RowsAffected(); n == 1 {
		return 0, nil
	}
	var exists int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE id=?`, id).Scan(&exists); err != nil {
		return 0, err
	}
	if exists == 0 {
		return 404, nil
	}
	return 409, nil
}

func (a *API) updateProject(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Version     int64
		Name        *string
		Color       *string
		Archived    *bool
		Description *string
	}
	if !decode(w, r, &in) {
		return
	}
	var sets []string
	var args []any
	if in.Name != nil {
		n, err := text("name", *in.Name, 1, 200)
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		sets, args = append(sets, "name=?"), append(args, n)
	}
	if in.Color != nil {
		if !hexColor.MatchString(*in.Color) {
			fail(w, 400, "color must be #rrggbb")
			return
		}
		sets, args = append(sets, "color=?"), append(args, *in.Color)
	}
	if in.Archived != nil {
		sets, args = append(sets, "archived=?"), append(args, *in.Archived)
	}
	if in.Description != nil {
		if utf8.RuneCountInString(*in.Description) > 20000 {
			fail(w, 400, "description must be at most 20000 characters")
			return
		}
		sets, args = append(sets, "description=?"), append(args, *in.Description)
	}
	if len(sets) == 0 {
		fail(w, 400, "nothing to update")
		return
	}
	a.commitUpdate(w, "projects", id, in.Version, sets, args, func(tx *sql.Tx) (any, error) { return getProject(tx, id) },
		Event{Type: "project", ID: id, ProjectID: id})
}

// commitUpdate wraps versionedUpdate in a transaction and answers 200/404/409.
func (a *API) commitUpdate(w http.ResponseWriter, table string, id, version int64, sets []string, args []any, load func(*sql.Tx) (any, error), ev Event, extra ...func(*sql.Tx) error) {
	tx, err := a.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	code, err := versionedUpdate(tx, table, id, version, sets, args)
	if err == nil && code == 0 {
		for _, f := range extra {
			if err = f(tx); err != nil {
				break
			}
		}
	}
	var br badRequest
	if errors.As(err, &br) {
		fail(w, 400, string(br))
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	if code == 404 {
		fail(w, 404, "not found")
		return
	}
	cur, err := load(tx)
	if err != nil {
		serverError(w, err)
		return
	}
	if code == 409 {
		writeJSON(w, 409, apiError{Error: "changed on another device", Current: cur})
		return
	}
	if err := tx.Commit(); err != nil {
		serverError(w, err)
		return
	}
	a.events.publish(ev)
	writeJSON(w, 200, cur)
}

// ---- sections ----

type Section struct {
	ID        int64   `json:"id"`
	ProjectID int64   `json:"projectId"`
	Name      string  `json:"name"`
	Position  float64 `json:"position"`
	Version   int64   `json:"version"`
}

func getSection(q querier, id int64) (s Section, err error) {
	err = q.QueryRow(`SELECT id,project_id,name,position,version FROM sections WHERE id=?`, id).Scan(&s.ID, &s.ProjectID, &s.Name, &s.Position, &s.Version)
	return
}

func (a *API) createSection(w http.ResponseWriter, r *http.Request) {
	pid, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct{ Name string }
	if !decode(w, r, &in) {
		return
	}
	name, err := text("name", in.Name, 1, 200)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	res, err := a.db.Exec(`INSERT INTO sections(project_id,name,position) SELECT id,?,(SELECT COALESCE(MAX(position),0)+1024 FROM sections WHERE project_id=?) FROM projects WHERE id=?`, name, pid, pid)
	if err != nil {
		serverError(w, err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		fail(w, 404, "project not found")
		return
	}
	id, _ := res.LastInsertId()
	s, err := getSection(a.db, id)
	if err != nil {
		serverError(w, err)
		return
	}
	a.events.publish(Event{Type: "section", ID: id, ProjectID: pid})
	writeJSON(w, 201, s)
}

func (a *API) updateSection(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Version int64
		Name    string
	}
	if !decode(w, r, &in) {
		return
	}
	name, err := text("name", in.Name, 1, 200)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	s, err := getSection(a.db, id)
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "not found")
		return
	}
	a.commitUpdate(w, "sections", id, in.Version, []string{"name=?"}, []any{name}, func(tx *sql.Tx) (any, error) { return getSection(tx, id) },
		Event{Type: "section", ID: id, ProjectID: s.ProjectID})
}

func (a *API) deleteSection(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	s, err := getSection(a.db, id)
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "not found")
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	// the NOT EXISTS guard makes check+delete atomic
	res, err := a.db.Exec(`DELETE FROM sections WHERE id=? AND NOT EXISTS (SELECT 1 FROM tasks WHERE section_id=?)`, id, id)
	if err != nil {
		serverError(w, err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		fail(w, 409, "section still contains tasks; move them first")
		return
	}
	a.events.publish(Event{Type: "section", ID: id, ProjectID: s.ProjectID})
	w.WriteHeader(204)
}

// ---- tasks ----

type Task struct {
	ID           int64   `json:"id"`
	ProjectID    int64   `json:"projectId"`
	SectionID    *int64  `json:"sectionId"`
	ParentID     *int64  `json:"parentId"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	StartDate    string  `json:"startDate"`
	DueDate      string  `json:"dueDate"`
	Priority     string  `json:"priority"`
	Status       string  `json:"status"`
	AssigneeID   *int64  `json:"assigneeId"`
	MySection    string  `json:"mySection"`
	Completed    bool    `json:"completed"`
	CompletedAt  string  `json:"completedAt"`
	Position     float64 `json:"position"`
	Version      int64   `json:"version"`
	UpdatedAt    string  `json:"updatedAt"`
	LabelIDs     []int64 `json:"labelIds"`
	BlockedBy    []int64 `json:"blockedBy"`
	OpenBlockers int     `json:"openBlockers"` // incomplete tasks this one waits for
	CommentCount int     `json:"commentCount"`
}

const taskCols = `t.id,t.project_id,t.section_id,t.parent_id,t.title,t.description,t.start_date,t.due_date,t.priority,t.status,t.assignee_id,t.my_section,
	t.completed,t.completed_at,t.position,t.version,t.updated_at,
	(SELECT COUNT(*) FROM task_deps d JOIN tasks b ON b.id=d.blocked_by_id WHERE d.task_id=t.id AND b.completed=0),
	(SELECT COUNT(*) FROM comments c WHERE c.task_id=t.id)`

func scanTask(s interface{ Scan(...any) error }) (t Task, err error) {
	err = s.Scan(&t.ID, &t.ProjectID, &t.SectionID, &t.ParentID, &t.Title, &t.Description, &t.StartDate, &t.DueDate, &t.Priority, &t.Status, &t.AssigneeID, &t.MySection,
		&t.Completed, &t.CompletedAt, &t.Position, &t.Version, &t.UpdatedAt, &t.OpenBlockers, &t.CommentCount)
	t.LabelIDs, t.BlockedBy = []int64{}, []int64{}
	return
}

type rowsQuerier interface {
	querier
	Query(string, ...any) (*sql.Rows, error)
}

func getTask(q rowsQuerier, id int64) (Task, error) {
	ts, err := queryTasks(q, `t.id=?`, id)
	if err != nil {
		return Task{}, err
	}
	if len(ts) == 0 {
		return Task{}, sql.ErrNoRows
	}
	return ts[0], nil
}

// queryTasks loads tasks plus their label and dependency ids.
func queryTasks(q rowsQuerier, where string, args ...any) ([]Task, error) {
	rows, err := q.Query(`SELECT `+taskCols+` FROM tasks t WHERE `+where, args...)
	if err != nil {
		return nil, err
	}
	out := []Task{}
	idx := map[int64]int{}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		idx[t.ID] = len(out)
		out = append(out, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil || len(out) == 0 {
		return out, err
	}
	ids := make([]any, len(out))
	for i, t := range out {
		ids[i] = t.ID
	}
	in := `(?` + strings.Repeat(",?", len(ids)-1) + `)`
	for _, rel := range []struct {
		sql string
		add func(*Task, int64)
	}{
		{`SELECT task_id, label_id FROM task_labels WHERE task_id IN ` + in + ` ORDER BY label_id`, func(t *Task, v int64) { t.LabelIDs = append(t.LabelIDs, v) }},
		{`SELECT task_id, blocked_by_id FROM task_deps WHERE task_id IN ` + in + ` ORDER BY blocked_by_id`, func(t *Task, v int64) { t.BlockedBy = append(t.BlockedBy, v) }},
	} {
		r, err := q.Query(rel.sql, ids...)
		if err != nil {
			return nil, err
		}
		for r.Next() {
			var tid, v int64
			if err := r.Scan(&tid, &v); err != nil {
				r.Close()
				return nil, err
			}
			if i, ok := idx[tid]; ok {
				rel.add(&out[i], v)
			}
		}
		r.Close()
		if err := r.Err(); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (a *API) board(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	// one read transaction = one consistent snapshot
	tx, err := a.db.BeginTx(r.Context(), &sql.TxOptions{ReadOnly: true})
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	p, err := getProject(tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "project not found")
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	rows, err := tx.Query(`SELECT id,project_id,name,position,version FROM sections WHERE project_id=? ORDER BY position`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	sections := []Section{}
	for rows.Next() {
		var s Section
		if err := rows.Scan(&s.ID, &s.ProjectID, &s.Name, &s.Position, &s.Version); err != nil {
			rows.Close()
			serverError(w, err)
			return
		}
		sections = append(sections, s)
	}
	rows.Close()
	tasks, err := queryTasks(tx, `t.project_id=? ORDER BY t.position`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"project": p, "sections": sections, "tasks": tasks})
}

func (a *API) createTask(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ProjectID int64
		SectionID int64
		ParentID  int64
		Title     string
		Index     *int
	}
	if !decode(w, r, &in) {
		return
	}
	title, err := text("title", in.Title, 1, 500)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	tx, err := a.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	var res sql.Result
	if in.ParentID != 0 {
		var pid int64
		if err := tx.QueryRow(`SELECT project_id FROM tasks WHERE id=?`, in.ParentID).Scan(&pid); err != nil {
			fail(w, 404, "parent task not found")
			return
		}
		in.ProjectID = pid
		res, err = tx.Exec(`INSERT INTO tasks(project_id,parent_id,title,position) VALUES (?,?,?,(SELECT COALESCE(MAX(position),0)+1024 FROM tasks WHERE parent_id=?))`, pid, in.ParentID, title, in.ParentID)
	} else {
		var pid int64
		if err := tx.QueryRow(`SELECT project_id FROM sections WHERE id=?`, in.SectionID).Scan(&pid); err != nil || pid != in.ProjectID {
			fail(w, 400, "section not found in project")
			return
		}
		res, err = tx.Exec(`INSERT INTO tasks(project_id,section_id,title,position) VALUES (?,?,?,(SELECT COALESCE(MAX(position),0)+1024 FROM tasks WHERE section_id=?))`, pid, in.SectionID, title, in.SectionID)
	}
	if err != nil {
		serverError(w, err)
		return
	}
	id, _ := res.LastInsertId()
	if in.Index != nil && in.ParentID == 0 {
		if err := placeTask(tx, id, in.SectionID, *in.Index); err != nil {
			serverError(w, err)
			return
		}
	}
	t, err := getTask(tx, id)
	if err != nil || tx.Commit() != nil {
		serverError(w, err)
		return
	}
	a.events.publish(Event{Type: "task", ID: id, ProjectID: t.ProjectID, TaskID: in.ParentID})
	writeJSON(w, 201, t)
}

// placeTask puts task id at index among the other top-level tasks of section.
func placeTask(tx *sql.Tx, id, section int64, index int) error {
	type sib struct {
		id  int64
		pos float64
	}
	rows, err := tx.Query(`SELECT id, position FROM tasks WHERE section_id=? AND parent_id IS NULL AND id<>? ORDER BY position, id`, section, id)
	if err != nil {
		return err
	}
	var sibs []sib
	for rows.Next() {
		var s sib
		if err := rows.Scan(&s.id, &s.pos); err != nil {
			rows.Close()
			return err
		}
		sibs = append(sibs, s)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	index = max(0, min(index, len(sibs)))
	ps := make([]float64, len(sibs))
	for i, s := range sibs {
		ps[i] = s.pos
	}
	pos, ok := between(ps, index)
	if !ok { // gap exhausted: renumber the section
		for i, s := range sibs {
			ps[i] = float64(i+1) * 1024
			if _, err := tx.Exec(`UPDATE tasks SET position=? WHERE id=?`, ps[i], s.id); err != nil {
				return err
			}
		}
		pos, _ = between(ps, index)
	}
	_, err = tx.Exec(`UPDATE tasks SET section_id=?, position=? WHERE id=?`, section, pos, id)
	return err
}

// between returns a position before ps[index] and after ps[index-1].
func between(ps []float64, index int) (float64, bool) {
	switch {
	case len(ps) == 0:
		return 1024, true
	case index == 0:
		return ps[0] - 1024, true
	case index == len(ps):
		return ps[len(ps)-1] + 1024, true
	}
	lo, hi := ps[index-1], ps[index]
	mid := (lo + hi) / 2
	return mid, hi-lo > 1e-6 && mid > lo && mid < hi
}

func (a *API) taskDetail(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tx, err := a.db.BeginTx(r.Context(), &sql.TxOptions{ReadOnly: true})
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	t, err := getTask(tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "task not found")
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	subs, err := queryTasks(tx, `t.parent_id=? ORDER BY t.position`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	rows, err := tx.Query(`SELECT c.id,c.task_id,c.user_id,u.name,c.body,c.created_at FROM comments c JOIN users u ON u.id=c.user_id WHERE c.task_id=? ORDER BY c.id`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	comments := []Comment{}
	for rows.Next() {
		var c Comment
		if err := rows.Scan(&c.ID, &c.TaskID, &c.UserID, &c.UserName, &c.Body, &c.CreatedAt); err != nil {
			serverError(w, err)
			return
		}
		comments = append(comments, c)
	}
	var parent *Task
	if t.ParentID != nil {
		p, err := getTask(tx, *t.ParentID)
		if err != nil {
			serverError(w, err)
			return
		}
		parent = &p
	}
	blockedBy, err := queryTasks(tx, `t.id IN (SELECT blocked_by_id FROM task_deps WHERE task_id=?) ORDER BY t.id`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	blocking, err := queryTasks(tx, `t.id IN (SELECT task_id FROM task_deps WHERE blocked_by_id=?) ORDER BY t.id`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"task": t, "subtasks": subs, "comments": comments, "parent": parent, "blockedBy": blockedBy, "blocking": blocking})
}

func (a *API) updateTask(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Version     int64
		Title       *string
		Description *string
		DueDate     *string
		Priority    *string
		Completed   *bool
		LabelIDs    *[]int64
		StartDate   *string
		Status      *string
		AssigneeID  *int64 // 0 clears
		MySection   *string
		BlockedBy   *[]int64
	}
	if !decode(w, r, &in) {
		return
	}
	var sets []string
	var args []any
	if in.Title != nil {
		s, err := text("title", *in.Title, 1, 500)
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		sets, args = append(sets, "title=?"), append(args, s)
	}
	if in.Description != nil {
		if utf8.RuneCountInString(*in.Description) > 50000 {
			fail(w, 400, "description must be at most 50000 characters")
			return
		}
		sets, args = append(sets, "description=?"), append(args, *in.Description)
	}
	if in.DueDate != nil {
		if !validDate(*in.DueDate) {
			fail(w, 400, "dueDate must be YYYY-MM-DD or empty")
			return
		}
		sets, args = append(sets, "due_date=?"), append(args, *in.DueDate)
	}
	if in.StartDate != nil {
		if !validDate(*in.StartDate) {
			fail(w, 400, "startDate must be YYYY-MM-DD or empty")
			return
		}
		sets, args = append(sets, "start_date=?"), append(args, *in.StartDate)
	}
	if in.Status != nil {
		if !statuses[*in.Status] {
			fail(w, 400, "status must be on_track, at_risk, off_track or empty")
			return
		}
		sets, args = append(sets, "status=?"), append(args, *in.Status)
	}
	if in.MySection != nil {
		if !mySections[*in.MySection] {
			fail(w, 400, "mySection must be today, next_week, later or empty")
			return
		}
		sets, args = append(sets, "my_section=?"), append(args, *in.MySection)
	}
	if in.AssigneeID != nil {
		var assignee any // nil clears
		if *in.AssigneeID != 0 {
			var n int
			if err := a.db.QueryRow(`SELECT COUNT(*) FROM users WHERE id=?`, *in.AssigneeID).Scan(&n); err != nil || n == 0 {
				fail(w, 400, "assignee not found")
				return
			}
			assignee = *in.AssigneeID
		}
		sets, args = append(sets, "assignee_id=?"), append(args, assignee)
		if in.MySection == nil { // newly assigned tasks start in "recently assigned", like Asana
			sets, args = append(sets, "my_section=CASE WHEN assignee_id IS ? THEN my_section ELSE '' END"), append(args, assignee)
		}
	}
	if in.Priority != nil {
		if !priorities[*in.Priority] {
			fail(w, 400, "priority must be low, medium, high or empty")
			return
		}
		sets, args = append(sets, "priority=?"), append(args, *in.Priority)
	}
	if in.Completed != nil {
		at := ""
		if *in.Completed {
			at = now()
		}
		sets, args = append(sets, "completed=?", "completed_at=?"), append(args, *in.Completed, at)
	}
	var extra []func(*sql.Tx) error
	if in.LabelIDs != nil {
		if len(*in.LabelIDs) > 50 {
			fail(w, 400, "too many labels")
			return
		}
		sets = append(sets, "id=id") // labels alone still bump the version
		extra = append(extra, func(tx *sql.Tx) error {
			if _, err := tx.Exec(`DELETE FROM task_labels WHERE task_id=?`, id); err != nil {
				return err
			}
			for _, l := range *in.LabelIDs {
				if _, err := tx.Exec(`INSERT OR IGNORE INTO task_labels(task_id,label_id) SELECT ?,id FROM labels WHERE id=?`, id, l); err != nil {
					return err
				}
			}
			return nil
		})
	}
	if in.BlockedBy != nil {
		if len(*in.BlockedBy) > 50 {
			fail(w, 400, "too many dependencies")
			return
		}
		sets = append(sets, "id=id")
		extra = append(extra, func(tx *sql.Tx) error { return setDependencies(tx, id, *in.BlockedBy) })
	}
	if in.StartDate != nil || in.DueDate != nil {
		extra = append(extra, func(tx *sql.Tx) error {
			var start, due string
			if err := tx.QueryRow(`SELECT start_date, due_date FROM tasks WHERE id=?`, id).Scan(&start, &due); err != nil {
				return err
			}
			if start != "" && due != "" && start > due {
				return badRequest("startDate must not be after dueDate")
			}
			return nil
		})
	}
	if len(sets) == 0 {
		fail(w, 400, "nothing to update")
		return
	}
	var pid int64
	var parent sql.NullInt64
	if err := a.db.QueryRow(`SELECT project_id,parent_id FROM tasks WHERE id=?`, id).Scan(&pid, &parent); errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "not found")
		return
	}
	a.commitUpdate(w, "tasks", id, in.Version, sets, args, func(tx *sql.Tx) (any, error) { return getTask(tx, id) },
		Event{Type: "task", ID: id, ProjectID: pid, TaskID: parent.Int64}, extra...)
}

func (a *API) moveTask(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		SectionID int64
		Index     int
	}
	if !decode(w, r, &in) {
		return
	}
	tx, err := a.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	var tp, sp int64
	var parent sql.NullInt64
	if err := tx.QueryRow(`SELECT project_id,parent_id FROM tasks WHERE id=?`, id).Scan(&tp, &parent); err != nil {
		fail(w, 404, "task not found")
		return
	}
	if parent.Valid {
		fail(w, 400, "subtasks cannot be moved between sections")
		return
	}
	if err := tx.QueryRow(`SELECT project_id FROM sections WHERE id=?`, in.SectionID).Scan(&sp); err != nil || sp != tp {
		fail(w, 400, "section not found in this project")
		return
	}
	if err := placeTask(tx, id, in.SectionID, in.Index); err != nil {
		serverError(w, err)
		return
	}
	if _, err := tx.Exec(`UPDATE tasks SET version=version+1, updated_at=? WHERE id=?`, now(), id); err != nil {
		serverError(w, err)
		return
	}
	t, err := getTask(tx, id)
	if err != nil || tx.Commit() != nil {
		serverError(w, err)
		return
	}
	a.events.publish(Event{Type: "task", ID: id, ProjectID: tp})
	writeJSON(w, 200, t)
}

func (a *API) deleteTask(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var pid int64
	var parent sql.NullInt64
	if err := a.db.QueryRow(`SELECT project_id,parent_id FROM tasks WHERE id=?`, id).Scan(&pid, &parent); err != nil {
		fail(w, 404, "task not found")
		return
	}
	if _, err := a.db.Exec(`DELETE FROM tasks WHERE id=?`, id); err != nil {
		serverError(w, err)
		return
	}
	a.events.publish(Event{Type: "task", ID: id, ProjectID: pid, TaskID: parent.Int64})
	w.WriteHeader(204)
}

// ---- comments ----

type Comment struct {
	ID        int64  `json:"id"`
	TaskID    int64  `json:"taskId"`
	UserID    int64  `json:"userId"`
	UserName  string `json:"userName"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

func (a *API) createComment(w http.ResponseWriter, r *http.Request) {
	tid, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct{ Body string }
	if !decode(w, r, &in) {
		return
	}
	body, err := text("comment", in.Body, 1, 10000)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	u := userFrom(r)
	var pid int64
	if err := a.db.QueryRow(`SELECT project_id FROM tasks WHERE id=?`, tid).Scan(&pid); err != nil {
		fail(w, 404, "task not found")
		return
	}
	c := Comment{TaskID: tid, UserID: u.ID, UserName: u.Name, Body: body, CreatedAt: now()}
	res, err := a.db.Exec(`INSERT INTO comments(task_id,user_id,body,created_at) VALUES (?,?,?,?)`, tid, u.ID, body, c.CreatedAt)
	if err != nil {
		serverError(w, err)
		return
	}
	c.ID, _ = res.LastInsertId()
	a.events.publish(Event{Type: "comment", ID: c.ID, ProjectID: pid, TaskID: tid})
	writeJSON(w, 201, c)
}

// ---- labels ----

type Label struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

func (a *API) listLabels(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(`SELECT id,name,color FROM labels ORDER BY name`)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	out := []Label{}
	for rows.Next() {
		var l Label
		if err := rows.Scan(&l.ID, &l.Name, &l.Color); err != nil {
			serverError(w, err)
			return
		}
		out = append(out, l)
	}
	writeJSON(w, 200, out)
}

func (a *API) createLabel(w http.ResponseWriter, r *http.Request) {
	var in struct{ Name, Color string }
	if !decode(w, r, &in) {
		return
	}
	name, err := text("name", in.Name, 1, 50)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	if !hexColor.MatchString(in.Color) {
		fail(w, 400, "color must be #rrggbb")
		return
	}
	// existing label with the same name is returned instead of failing
	if _, err := a.db.Exec(`INSERT OR IGNORE INTO labels(name,color) VALUES (?,?)`, name, in.Color); err != nil {
		serverError(w, err)
		return
	}
	var l Label
	if err := a.db.QueryRow(`SELECT id,name,color FROM labels WHERE name=?`, name).Scan(&l.ID, &l.Name, &l.Color); err != nil {
		serverError(w, err)
		return
	}
	a.events.publish(Event{Type: "label", ID: l.ID})
	writeJSON(w, 201, l)
}

// ---- search ----

func (a *API) search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if utf8.RuneCountInString(q) < 2 || len(q) > 200 {
		writeJSON(w, 200, []any{})
		return
	}
	like := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q) + "%"
	where := `(t.title LIKE ? ESCAPE '\' OR t.description LIKE ? ESCAPE '\') AND t.project_id IN (SELECT id FROM projects WHERE archived=0)`
	if r.URL.Query().Get("completed") != "1" {
		where += ` AND t.completed=0`
	}
	tasks, err := queryTasks(a.db, where+` ORDER BY t.updated_at DESC LIMIT 100`, like, like)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, tasks)
}

// ---- users & my tasks ----

func (a *API) listUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(`SELECT id,email,name FROM users ORDER BY name`)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	out := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Name); err != nil {
			serverError(w, err)
			return
		}
		out = append(out, u)
	}
	writeJSON(w, 200, out)
}

// myTasks returns tasks assigned to the caller in active projects.
// completed=1 returns recently completed ones (last 200) instead of open ones.
func (a *API) myTasks(w http.ResponseWriter, r *http.Request) {
	where := `t.assignee_id=? AND t.project_id IN (SELECT id FROM projects WHERE archived=0) AND t.completed=0 ORDER BY CASE WHEN t.due_date='' THEN 1 ELSE 0 END, t.due_date, t.id`
	if r.URL.Query().Get("completed") == "1" {
		where = `t.assignee_id=? AND t.project_id IN (SELECT id FROM projects WHERE archived=0) AND t.completed=1 ORDER BY t.completed_at DESC LIMIT 200`
	}
	tasks, err := queryTasks(a.db, where, userFrom(r).ID)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, tasks)
}

// ---- project status updates ----

type ProjectUpdate struct {
	ID        int64  `json:"id"`
	ProjectID int64  `json:"projectId"`
	UserID    int64  `json:"userId"`
	UserName  string `json:"userName"`
	Status    string `json:"status"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

func (a *API) listUpdates(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	rows, err := a.db.Query(`SELECT u.id,u.project_id,u.user_id,us.name,u.status,u.body,u.created_at
		FROM project_updates u JOIN users us ON us.id=u.user_id WHERE u.project_id=? ORDER BY u.id DESC LIMIT 100`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	out := []ProjectUpdate{}
	for rows.Next() {
		var u ProjectUpdate
		if err := rows.Scan(&u.ID, &u.ProjectID, &u.UserID, &u.UserName, &u.Status, &u.Body, &u.CreatedAt); err != nil {
			serverError(w, err)
			return
		}
		out = append(out, u)
	}
	writeJSON(w, 200, out)
}

func (a *API) createUpdate(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct{ Status, Body string }
	if !decode(w, r, &in) {
		return
	}
	if in.Status == "" || !statuses[in.Status] {
		fail(w, 400, "status must be on_track, at_risk or off_track")
		return
	}
	body, err := text("body", in.Body, 0, 10000)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	u := userFrom(r)
	res, err := a.db.Exec(`INSERT INTO project_updates(project_id,user_id,status,body) SELECT id,?,?,? FROM projects WHERE id=?`, u.ID, in.Status, body, id)
	if err != nil {
		serverError(w, err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		fail(w, 404, "project not found")
		return
	}
	uid, _ := res.LastInsertId()
	a.events.publish(Event{Type: "project", ID: id, ProjectID: id})
	writeJSON(w, 201, ProjectUpdate{ID: uid, ProjectID: id, UserID: u.ID, UserName: u.Name, Status: in.Status, Body: body, CreatedAt: now()})
}

// update asks the updater sidecar to pull a newer image and recreate this container.
// It answers 202 at once: the sidecar may stop this very process before it replies.
func (a *API) update(w http.ResponseWriter, r *http.Request) {
	if a.updateURL == "" {
		fail(w, 404, "updates are not configured on this server")
		return
	}
	if !a.updating.CompareAndSwap(false, true) {
		fail(w, 409, "an update check is already running")
		return
	}
	go func() {
		defer a.updating.Store(false)
		req, _ := http.NewRequest(http.MethodPost, a.updateURL, nil)
		req.Header.Set("Authorization", "Bearer "+a.updateToken)
		res, err := (&http.Client{Timeout: 15 * time.Minute}).Do(req)
		if err != nil {
			log.Printf("update request: %v", err)
			return
		}
		res.Body.Close()
		log.Printf("update request answered with %d", res.StatusCode)
	}()
	writeJSON(w, 202, map[string]any{"started": true, "version": appVersion})
}
