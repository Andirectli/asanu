package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

// Custom fields: defined per project, value stored as text per task (empty = unset).
type Field struct {
	ID        int64    `json:"id"`
	ProjectID int64    `json:"projectId"`
	Name      string   `json:"name"`
	Type      string   `json:"type"` // text | number | date | select
	Options   []string `json:"options"`
	Position  float64  `json:"position"`
	Version   int64    `json:"version"`
}

var fieldTypes = map[string]bool{"text": true, "number": true, "date": true, "select": true}

// loadFields returns the project's fields and all values as taskId -> fieldId -> value.
func loadFields(q rowsQuerier, projectID int64) ([]Field, map[int64]map[int64]string, error) {
	rows, err := q.Query(`SELECT id,project_id,name,type,options,position,version FROM custom_fields WHERE project_id=? ORDER BY position,id`, projectID)
	if err != nil {
		return nil, nil, err
	}
	fields := []Field{}
	for rows.Next() {
		var f Field
		var opts string
		if err := rows.Scan(&f.ID, &f.ProjectID, &f.Name, &f.Type, &opts, &f.Position, &f.Version); err != nil {
			rows.Close()
			return nil, nil, err
		}
		if json.Unmarshal([]byte(opts), &f.Options) != nil || f.Options == nil {
			f.Options = []string{}
		}
		fields = append(fields, f)
	}
	rows.Close()
	values := map[int64]map[int64]string{}
	vr, err := q.Query(`SELECT v.task_id,v.field_id,v.value FROM field_values v JOIN custom_fields f ON f.id=v.field_id WHERE f.project_id=?`, projectID)
	if err != nil {
		return nil, nil, err
	}
	defer vr.Close()
	for vr.Next() {
		var t, f int64
		var v string
		if err := vr.Scan(&t, &f, &v); err != nil {
			return nil, nil, err
		}
		if values[t] == nil {
			values[t] = map[int64]string{}
		}
		values[t][f] = v
	}
	return fields, values, vr.Err()
}

func cleanOptions(in []string) ([]string, error) {
	out := []string{}
	seen := map[string]bool{}
	for _, o := range in {
		o = strings.TrimSpace(o)
		if o == "" || seen[o] {
			continue
		}
		if len(o) > 60 || len(out) >= 30 {
			return nil, badRequest("option too long or too many options")
		}
		seen[o] = true
		out = append(out, o)
	}
	return out, nil
}

func (a *API) createField(w http.ResponseWriter, r *http.Request) {
	pid, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Name    string
		Type    string
		Options []string
	}
	if !decode(w, r, &in) {
		return
	}
	name, err := text("name", in.Name, 1, 60)
	if err != nil || !fieldTypes[in.Type] {
		fail(w, 400, "name (1-60 chars) and type (text|number|date|select) required")
		return
	}
	opts, err := cleanOptions(in.Options)
	if err != nil || (in.Type == "select" && len(opts) == 0) {
		fail(w, 400, "select fields need at least one valid option")
		return
	}
	ob, _ := json.Marshal(opts)
	res, err := a.db.Exec(`INSERT INTO custom_fields(project_id,name,type,options,position) SELECT id,?,?,?,COALESCE((SELECT MAX(position)+1 FROM custom_fields WHERE project_id=?),1) FROM projects WHERE id=?`, name, in.Type, string(ob), pid, pid)
	if err != nil {
		serverError(w, err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		fail(w, 404, "project not found")
		return
	}
	id, _ := res.LastInsertId()
	a.events.publish(Event{Type: "project", ID: pid, ProjectID: pid})
	writeJSON(w, 201, map[string]any{"id": id})
}

func fieldProject(db *sql.DB, id int64) (int64, error) {
	var pid int64
	err := db.QueryRow(`SELECT project_id FROM custom_fields WHERE id=?`, id).Scan(&pid)
	return pid, err
}

func (a *API) updateField(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Name    *string
		Options *[]string
	}
	if !decode(w, r, &in) {
		return
	}
	pid, err := fieldProject(a.db, id)
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "field not found")
		return
	} else if err != nil {
		serverError(w, err)
		return
	}
	if in.Name != nil {
		name, err := text("name", *in.Name, 1, 60)
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		if _, err := a.db.Exec(`UPDATE custom_fields SET name=?,version=version+1 WHERE id=?`, name, id); err != nil {
			serverError(w, err)
			return
		}
	}
	if in.Options != nil {
		opts, err := cleanOptions(*in.Options)
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		ob, _ := json.Marshal(opts)
		if _, err := a.db.Exec(`UPDATE custom_fields SET options=?,version=version+1 WHERE id=? AND type='select'`, string(ob), id); err != nil {
			serverError(w, err)
			return
		}
	}
	a.events.publish(Event{Type: "project", ID: pid, ProjectID: pid})
	w.WriteHeader(204)
}

func (a *API) deleteField(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	pid, err := fieldProject(a.db, id)
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "field not found")
		return
	} else if err != nil {
		serverError(w, err)
		return
	}
	if _, err := a.db.Exec(`DELETE FROM custom_fields WHERE id=?`, id); err != nil {
		serverError(w, err)
		return
	}
	a.events.publish(Event{Type: "project", ID: pid, ProjectID: pid})
	w.WriteHeader(204)
}

// setFieldValue: last write wins (a single value per cell); empty value clears it.
func (a *API) setFieldValue(w http.ResponseWriter, r *http.Request) {
	tid, ok := pathID(w, r)
	if !ok {
		return
	}
	fid, err := strconv.ParseInt(r.PathValue("fid"), 10, 64)
	if err != nil {
		fail(w, 400, "bad field id")
		return
	}
	var in struct{ Value string }
	if !decode(w, r, &in) {
		return
	}
	var typ, opts string
	var pid int64
	err = a.db.QueryRow(`SELECT f.type,f.options,f.project_id FROM custom_fields f JOIN tasks t ON t.project_id=f.project_id WHERE f.id=? AND t.id=?`, fid, tid).Scan(&typ, &opts, &pid)
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, 404, "task or field not found")
		return
	} else if err != nil {
		serverError(w, err)
		return
	}
	v := strings.TrimSpace(in.Value)
	switch {
	case v == "":
	case len(v) > 2000:
		fail(w, 400, "value too long")
		return
	case typ == "number":
		if _, err := strconv.ParseFloat(v, 64); err != nil {
			fail(w, 400, "not a number")
			return
		}
	case typ == "date":
		if !validDate(v) {
			fail(w, 400, "date must be YYYY-MM-DD")
			return
		}
	case typ == "select":
		var list []string
		_ = json.Unmarshal([]byte(opts), &list)
		found := false
		for _, o := range list {
			found = found || o == v
		}
		if !found {
			fail(w, 400, "not one of the options")
			return
		}
	}
	if v == "" {
		_, err = a.db.Exec(`DELETE FROM field_values WHERE task_id=? AND field_id=?`, tid, fid)
	} else {
		_, err = a.db.Exec(`INSERT INTO field_values(task_id,field_id,value) VALUES (?,?,?) ON CONFLICT(task_id,field_id) DO UPDATE SET value=excluded.value`, tid, fid, v)
	}
	if err != nil {
		serverError(w, err)
		return
	}
	a.events.publish(Event{Type: "task", ID: tid, ProjectID: pid, TaskID: tid})
	w.WriteHeader(204)
}
