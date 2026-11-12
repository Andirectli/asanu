package main

import (
	"database/sql"
	"net/http"
	"strings"
)

// Notification is one inbox entry; the title comes from the task at read time.
type Notification struct {
	ID        int64  `json:"id"`
	Kind      string `json:"kind"` // assigned | comment
	TaskID    int64  `json:"taskId"`
	ProjectID int64  `json:"projectId"`
	Title     string `json:"title"`
	Project   string `json:"project"`
	ActorName string `json:"actorName"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
	Read      bool   `json:"read"`
}

func notify(q interface {
	Exec(string, ...any) (sql.Result, error)
}, to, from int64, kind string, taskID int64, body string) error {
	_, err := q.Exec(`INSERT INTO notifications(user_id,actor_id,kind,task_id,body,created_at) VALUES (?,?,?,?,?,?)`, to, from, kind, taskID, body, now())
	return err
}

// inbox: newest 100 notifications of the caller (users only see their own).
func (a *API) inbox(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(`SELECT n.id,n.kind,n.task_id,t.project_id,t.title,p.name,COALESCE(u.name,''),n.body,n.created_at,n.read
		FROM notifications n JOIN tasks t ON t.id=n.task_id JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=n.actor_id
		WHERE n.user_id=? ORDER BY n.id DESC LIMIT 100`, userFrom(r).ID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	out := []Notification{}
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.Kind, &n.TaskID, &n.ProjectID, &n.Title, &n.Project, &n.ActorName, &n.Body, &n.CreatedAt, &n.Read); err != nil {
			serverError(w, err)
			return
		}
		out = append(out, n)
	}
	writeJSON(w, 200, out)
}

// markInboxRead: body {"ids":[..]} marks those, an empty/missing list marks everything; {"unread":true} reverses ids.
func (a *API) markInboxRead(w http.ResponseWriter, r *http.Request) {
	var in struct {
		IDs    []int64
		Unread bool
	}
	if !decode(w, r, &in) {
		return
	}
	val := 1
	if in.Unread {
		val = 0
	}
	q, args := `UPDATE notifications SET read=? WHERE user_id=?`, []any{val, userFrom(r).ID}
	if len(in.IDs) > 0 {
		if len(in.IDs) > 200 {
			fail(w, 400, "too many ids")
			return
		}
		q += ` AND id IN (?` + strings.Repeat(",?", len(in.IDs)-1) + `)`
		for _, id := range in.IDs {
			args = append(args, id)
		}
	}
	if _, err := a.db.Exec(q, args...); err != nil {
		serverError(w, err)
		return
	}
	a.events.publish(Event{Type: "inbox", ID: userFrom(r).ID})
	w.WriteHeader(204)
}
