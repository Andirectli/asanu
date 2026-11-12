package main

import (
	"database/sql"
	"fmt"
	"net/url"

	_ "modernc.org/sqlite"
)

// migrations are applied in order; never edit a released step, append a new one.
var migrations = []string{
	`CREATE TABLE users (
		id INTEGER PRIMARY KEY,
		email TEXT NOT NULL UNIQUE COLLATE NOCASE,
		name TEXT NOT NULL,
		password_hash TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
	);
	CREATE TABLE sessions (
		token_hash TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		device TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
		last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
	);
	CREATE TABLE projects (
		id INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		color TEXT NOT NULL,
		archived INTEGER NOT NULL DEFAULT 0,
		position REAL NOT NULL,
		version INTEGER NOT NULL DEFAULT 1,
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
		updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
	);
	CREATE TABLE sections (
		id INTEGER PRIMARY KEY,
		project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		position REAL NOT NULL,
		version INTEGER NOT NULL DEFAULT 1
	);
	CREATE INDEX sections_project ON sections(project_id, position);
	CREATE TABLE tasks (
		id INTEGER PRIMARY KEY,
		project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		section_id INTEGER REFERENCES sections(id) ON DELETE RESTRICT,
		parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
		title TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		due_date TEXT NOT NULL DEFAULT '',
		priority TEXT NOT NULL DEFAULT '',
		completed INTEGER NOT NULL DEFAULT 0,
		completed_at TEXT NOT NULL DEFAULT '',
		position REAL NOT NULL,
		version INTEGER NOT NULL DEFAULT 1,
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
		updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
	);
	CREATE INDEX tasks_section ON tasks(section_id, position);
	CREATE INDEX tasks_parent ON tasks(parent_id, position);
	CREATE INDEX tasks_project ON tasks(project_id);
	CREATE TABLE labels (
		id INTEGER PRIMARY KEY,
		name TEXT NOT NULL UNIQUE COLLATE NOCASE,
		color TEXT NOT NULL
	);
	CREATE TABLE task_labels (
		task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
		label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
		PRIMARY KEY (task_id, label_id)
	);
	CREATE TABLE comments (
		id INTEGER PRIMARY KEY,
		task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id),
		body TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
	);
	CREATE INDEX comments_task ON comments(task_id, id);`,
	// v0.2: assignee + personal "My tasks" bucket, start date, status, dependencies
	`ALTER TABLE tasks ADD COLUMN assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
	ALTER TABLE tasks ADD COLUMN my_section TEXT NOT NULL DEFAULT '';
	ALTER TABLE tasks ADD COLUMN start_date TEXT NOT NULL DEFAULT '';
	ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT '';
	CREATE INDEX tasks_assignee ON tasks(assignee_id);
	CREATE TABLE task_deps (
		task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
		blocked_by_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
		PRIMARY KEY (task_id, blocked_by_id),
		CHECK (task_id <> blocked_by_id)
	);
	CREATE INDEX task_deps_blocker ON task_deps(blocked_by_id);`,
}

func openDB(path string) (*sql.DB, error) {
	q := url.Values{}
	// temp_store=MEMORY: the scratch image has no /tmp
	for _, p := range []string{"busy_timeout(10000)", "journal_mode(WAL)", "foreign_keys(1)", "synchronous(NORMAL)", "temp_store(MEMORY)"} {
		q.Add("_pragma", p)
	}
	q.Set("_txlock", "immediate") // writers take the lock up front: no upgrade deadlocks
	db, err := sql.Open("sqlite", "file:"+path+"?"+q.Encode())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func migrate(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`); err != nil {
		return err
	}
	var cur int
	if err := db.QueryRow(`SELECT COALESCE(MAX(version),0) FROM schema_migrations`).Scan(&cur); err != nil {
		return err
	}
	if cur > len(migrations) {
		return fmt.Errorf("database schema v%d is newer than this server (v%d); refusing to start", cur, len(migrations))
	}
	for i := cur; i < len(migrations); i++ {
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(migrations[i]); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %d: %w", i+1, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations(version) VALUES (?)`, i+1); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
