<p align="center"><img src="app/public/logo.svg" width="72" alt="Asanu"></p>

# Asanu

Private, selbst gehostete Projektverwaltung im Asana-Stil. macOS-Desktop-App (Tauri 2 + React) mit zentralem Go/SQLite-Server auf dem Heimserver (ZimaOS).

- `server/` – Go-API, SQLite (reines Go), Login, Server-Sent Events, CLI für Konten/Backup
- `app/` – React + TypeScript + Vite; `app/src-tauri/` – Tauri-2-Hülle (Keychain, Menü, Fenster)
- `deploy/zimaos-compose.yaml` – Compose-Datei für ZimaOS
- `docs/ARCHITEKTUR.md` – Befund im Ausgangsprojekt und Entscheidungen
- `docs/ZIMAOS.md` – Image, Installation, Pfade, Rechte, Backup/Restore, Netzwerk
- `docs/TESTBERICHT.md` – was wirklich geprüft wurde, Messwerte, Grenzen
- `docs/ASANA-ABGLEICH.md` – was aus Asana übernommen wurde und was bewusst nicht

Der Name „Asanu" steht nur in `app/src-tauri/tauri.conf.json` (`productName`, `identifier`), `app/index.html`, der Seitenleiste (`app/src/Sidebar.tsx`) und den Texten; Umbenennen = diese Stellen ändern.

## Voraussetzungen (Mac)

Node 20+, Go 1.26+, Rust (stable) und Xcode Command Line Tools. Mit Homebrew: `brew install node go rust`.

## Entwicklung

```bash
# Server lokal (Daten in ./dev-data)
cd server
ASANU_DATA_DIR=./dev-data ASANU_ADDR=127.0.0.1:8380 ASANU_INIT_EMAIL=ich@example.lan ASANU_INIT_PASSWORD=entwicklung-123 go run . serve
```

```bash
# Desktop-App mit Hot Reload (zweites Terminal)
cd app && npm ci && npm run tauri dev
```

Im Anmeldefenster `http://127.0.0.1:8380` eintragen. Ohne Tauri läuft die Oberfläche auch im Browser (`npm run dev`, http://localhost:1420); das Token liegt dort nur im Tab-Speicher.

Demo-Daten (4 Projekte, ~300 Aufgaben): `ASANU_PASSWORD=entwicklung-123 python3 tools/seed_demo.py http://127.0.0.1:8380 ich@example.lan`

## Prüfen

```bash
cd server && make test                 # go vet + Integrationstests (2 Clients, Konflikt, Neustart, Backup)
```

```bash
cd app && npm run typecheck
```

## Mac-App bauen

```bash
cd app && npm ci && npm run tauri build
```

Ergebnis: `app/src-tauri/target/release/bundle/macos/Asanu.app` und `app/src-tauri/target/release/bundle/dmg/Asanu_0.2.0_aarch64.dmg`.

### Installation auf dem Mac

1. DMG öffnen, Asanu in „Programme" ziehen.
2. Die App ist **nicht signiert/notarisiert** (kein Apple-Developer-Konto). Beim ersten Start: Rechtsklick auf Asanu → „Öffnen" → „Öffnen". Falls macOS das ablehnt: Systemeinstellungen → Datenschutz & Sicherheit → „Dennoch öffnen".
3. Serveradresse eintragen (z. B. `http://192.168.1.20:8380`), „Verbindung testen", anmelden.
4. Beim ersten Speichern fragt macOS ggf., ob Asanu auf den Schlüsselbund zugreifen darf → „Immer erlauben".

Für Intel-Macs: `npm run tauri build -- --target x86_64-apple-darwin` (vorher `rustup target add x86_64-apple-darwin`, falls rustup genutzt wird).

## Tastenkürzel

| Kürzel | Aktion |
|---|---|
| ⌘K | Suche fokussieren |
| ⌘N | Neue Aufgabe im ersten Abschnitt |
| ⌘1 / ⌘2 / ⌘3 | Liste / Board / Kalender |
| ⌘⇧N | Aufgabe erstellen (Dialog, auch aus jeder Ansicht) |
| ⌘[ / ⌘] | Zurück / Vor |
| ⌘↩ | Geöffnete Aufgabe erledigt/offen (im Kommentarfeld: Kommentar senden) |
| Esc | Detailbereich schließen |
| Enter | In Eingabezeilen speichern; neue Aufgabe anlegen und weiterschreiben |
| Leertaste, Pfeile, Leertaste | Aufgabe am Griff per Tastatur verschieben |

## Windows später

Plattformcode steckt in `app/src/platform.ts` und `app/src-tauri/src/lib.rs`; `keyring` ist für Windows (Credential Manager) bereits in `Cargo.toml` vorgesehen. Ein Windows-Build ist ungetestet: `npm run tauri build` auf einem Windows-Rechner, Bundle-Ziel `msi`/`nsis` ergänzen.

## Lizenz

Asanu: MIT. Die Oberfläche orientiert sich an [manakuro/asana-clone-app](https://github.com/manakuro/asana-clone-app) (MIT, © 2026 manakuro); deren Lizenztext liegt in `THIRD_PARTY_LICENSE_asana-clone-app.txt`. Asana ist eine Marke der Asana, Inc.; Asanu ist damit nicht verbunden.
