# Entwicklung und Bauen

## Voraussetzungen (Mac)

Node 20+, Go 1.26+, Rust (stable) und die Xcode Command Line Tools. Mit Homebrew: `brew install node go rust`.
Für Server-Images zusätzlich Docker, z. B. `brew install colima docker docker-buildx` und `colima start --vm-type vz --vz-rosetta`.

## Server lokal starten

```bash
cd server
ASANU_DATA_DIR=./dev-data ASANU_ADDR=127.0.0.1:8380 ASANU_INIT_EMAIL=ich@example.lan ASANU_INIT_PASSWORD=entwicklung-123 go run . serve
```

## App entwickeln

```bash
cd app && npm ci && npm run tauri dev      # Desktop-App mit Hot Reload
cd app && npm run dev                       # nur die Oberfläche im Browser, http://localhost:1420
```

Im Anmeldefenster `http://127.0.0.1:8380` eintragen. Im Browser liegt das Token nur im Tab-Speicher.

Demo-Daten: `ASANU_PASSWORD=entwicklung-123 python3 tools/seed_demo.py http://127.0.0.1:8380 ich@example.lan`

## Prüfen

```bash
cd server && make test        # go vet + Tests: zwei Clients, Konflikte, Neustart, Backup, Migration, Update-Knopf
cd app && npm run typecheck
```

## Mac-App bauen

```bash
cd app && npm ci && npm run tauri build
```

Ergebnis: `app/src-tauri/target/release/bundle/macos/Asanu.app` und `…/dmg/Asanu_<version>_aarch64.dmg`.
Die App ist **nicht signiert** (kein Apple-Developer-Konto): Beim ersten Start Rechtsklick → „Öffnen“.
Für Intel-Macs: `npm run tauri build -- --target x86_64-apple-darwin`.

## Server-Image veröffentlichen

```bash
cd server && docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/<konto>/asanu-server:<version> -t ghcr.io/<konto>/asanu-server:latest --push .
```

Server mit Auto-Update holen sich `latest` innerhalb einer Stunde oder per Knopf in der App.

## Tastenkürzel

| Kürzel | Aktion |
|---|---|
| ⌘K | Suche |
| ⌘⇧N | Aufgabe erstellen |
| ⌘0 / 1 / 2 / 3 / 4 | Übersicht / Liste / Board / Zeitleiste / Kalender |
| ⌘N | Neue Aufgabe im ersten Abschnitt |
| ⌘[ / ⌘] | Zurück / Vor |
| ⌘↩ | Aufgabe erledigt/offen (im Kommentarfeld: senden) |
| Esc | Detailbereich schließen |

## Windows später

Plattformcode steckt in `app/src/platform.ts` und `app/src-tauri/src/lib.rs`; `keyring` ist für Windows (Credential Manager) schon vorgesehen. Ein Windows-Build ist ungetestet.
