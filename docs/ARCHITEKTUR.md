# Asanu – Architektur und Entscheidungen

## Befund im Ausgangsprojekt (manakuro/asana-clone-app, geprüft 2026-11-12)

| Teil | Befund |
|---|---|
| Backend `apps/api` | Go, Echo, gqlgen, Ent. **48 Ent-Schemas**, ca. 30 000 Zeilen Handcode + ca. 300 000 Zeilen generierter Ent-Code. Datenmodell ist mandantenfähig (Workspace, Teammate, `teammate_task`/`project_task`-Zwischentabellen, Activity-Feeds, Likes, Dateien). |
| Datenbank | MySQL (`go-sql-driver/mysql`, `dialect.MySQL`). |
| Redis | Im Go-Code **nicht verwendet** (Hypothese widerlegt). Echtzeit läuft über In-Memory-Go-Channels (`pkg/util/subscription`) + GraphQL-Subscriptions per WebSocket. Mehrere Instanzen wären damit ohnehin nicht synchron. |
| Auth | Firebase Admin SDK verifiziert ID-Tokens (`pkg/util/auth`), Frontend nutzt Firebase (anonyme Demo-Anmeldung). |
| Frontend `apps/nextjs` | Next.js 16 App Router (`src/app/...`, `'use client'`), Chakra UI v3, Jotai, Apollo Client, ProseMirror, `@hello-pangea/dnd`, `react-icons`. ca. 2 800 Dateien / 92 000 Zeilen. Eigener Router-Layer `src/router`, `proxy.ts` für serverseitige Prüfung. |
| Weitere Apps | `apps/react-native` (nicht Teil dieses Auftrags). |

## Entscheidungen

### E1 – Server: schlanker Go-Dienst mit SQLite und REST/JSON statt Port des GraphQL/Ent-Backends
Die GraphQL-Verträge des Klons bilden das Mehrmandanten-Modell (Workspace → Teammate → `teammate_task` + `project_task` …) ab. Für SQLite müsste man ~300 000 Zeilen Ent-Code neu generieren, Firebase entfernen und die 48 Tabellen samt Seeds mitschleppen, obwohl der Auftrag ein privates Ein-Haushalt-Modell beschreibt. Der eigentliche Mehrwert des Klons liegt in der Oberfläche, nicht im Schema.
Deshalb: eigener Go-Server (Standardbibliothek `net/http`), ein Binary, **SQLite in reinem Go** (`modernc.org/sqlite`, kein CGO → statisches Linux-Binary, Cross-Compile vom Mac), ein REST/JSON-API mit kleinem, eindeutigem Datenmodell. Begriffe (Project, Section, Task, Subtask, Priority, Tag/Label, Feed/Comment) sind aus dem Klon übernommen.
*Kosten:* kein Wiederverwenden der GraphQL-Dokumente. *Nutzen:* < 20 MB RAM, ein Container, keine Codegen-Kette, überprüfbar.

### E2 – Echtzeit: Server-Sent Events + „Neu laden bei Wiederverbindung"
Jede erfolgreiche Schreiboperation sendet nach dem Commit ein Ereignis (`{type, projectId, id}`) an alle SSE-Verbindungen (interner Broker, kein Redis). Clients laden bei jedem (Re-)Connect, beim Aufwachen des Macs (`visibilitychange`/`online`) und bei Ereignissen die betroffenen Daten **vom Server neu**. Damit gibt es keinen lokalen Stand, der veralten kann. SSE: ein Heartbeat alle 25 s, kein Polling.

### E3 – Konflikte: optimistische Sperre über `version`
Jede Entität hat `version`. Updates senden die bekannte Version; `UPDATE … WHERE id=? AND version=?`. Trifft das nicht, antwortet der Server **409** mit dem aktuellen Stand. Die App zeigt den Konflikt, behält die eigene Eingabe und bietet „Meine Änderung übernehmen" oder „Verwerfen". Nichts wird stillschweigend überschrieben.

### E4 – Reihenfolge: Bruchzahl-Positionen
`position REAL`. Verschieben = neue Position zwischen Nachbarn + ggf. neuer Abschnitt in einer Transaktion. Ist der Abstand zu klein, nummeriert der Server den Abschnitt neu.

### E5 – Auth: lokale Konten, bcrypt, Sitzungstokens
Passwörter mit bcrypt (Kosten 12). Login liefert ein zufälliges 256-bit-Token, Server speichert nur SHA-256 davon. Mehrere Geräte = mehrere Sitzungen. Token liegt in der App im **macOS-Schlüsselbund** (Rust-Crate `keyring`, unter Windows später Credential Manager). Konten entstehen per Umgebungsvariable beim ersten Start oder per CLI im Container – keine offene Registrierung.

### E6 – Frontend: Vite + React + TypeScript, Oberfläche nach Vorlage des Klons
Next.js App Router, `proxy.ts` und Firebase-Session sind serverseitig; ein statischer Export ist kein Schalter. Die Komponenten des Klons hängen eng an Chakra v3 + Jotai + Apollo-Cache + generierten GraphQL-Typen. Übernommen werden: Layout (dunkle Navigation 240 px, Header mit Tabs, Listen- und Board-Ansicht, rechter Detailbereich), Farbtokens (Chakra-Palette, Projektfarben), `@hello-pangea/dnd` für Drag & Drop, `react-icons`-Icons. Umgesetzt mit schlichtem CSS statt Chakra (kleineres Bundle, keine Emotion-Laufzeit). Routing clientseitig über `location.hash`.

### E7 – Desktop: Tauri 2
`app/src-tauri`. Plattform-spezifisches ist gekapselt: `app/src/platform.ts` (Keychain-Zugriff, Fensterziehen), Rust-Seite in `src-tauri/src/lib.rs`. Fenster: Overlay-Titelleiste (Ampel in der Seitenleiste), Mindestgröße 900×600, Standard-macOS-Menü (Bearbeiten-Menü → Copy/Paste). CSP erlaubt `connect-src` nur zu http/https (frei wählbare Serveradresse), keine `unsafe-eval`, keine Remote-Skripte.

## Datenmodell (SQLite)
`users`, `sessions`, `projects(name,color,archived,position,version)`, `sections(project_id,name,position,version)`, `tasks(project_id,section_id,parent_id,title,description,due_date,priority,completed,position,version)`, `labels`, `task_labels`, `comments`. Migrationen: nummerierte SQL-Schritte in `server/db.go`, Tabelle `schema_migrations`. WAL-Modus, `foreign_keys=ON`, `busy_timeout`.

## Später (bewusst nicht enthalten)
Offline-Bearbeitung, Gantt, Portfolios, Automatisierungen, Teamrechte, Anhänge, Mobile, Windows-Build.
