# Testbericht Asanu (2026-11-12)

Umgebung: MacBook (Apple Silicon, macOS 26), Go 1.27, Rust 1.99, Node 26, Xcode 26.6, Docker über Colima (Linux-VM, amd64 per Rosetta). **Kein Zugriff** auf den ZimaOS-Server.

## Automatisch geprüft

| Prüfung | Ergebnis |
|---|---|
| `go vet` + `go test` (`server/api_test.go`) | bestanden |
| ↳ Ohne Token → 401, falsches Passwort → 401 | ok |
| ↳ Client A legt Projekt + Aufgabe an, Client B erhält SSE-Ereignis und liest sie | ok |
| ↳ B ändert, A erhält Ereignis; A schreibt mit alter Version → **409** mit aktuellem Stand, nichts überschrieben | ok |
| ↳ Validierung: leerer Titel, 30. Februar, unbekannte Priorität, unbekanntes Feld → 400 | ok |
| ↳ Verschieben zwischen Abschnitten, Unteraufgabe, Label, Kommentar, Erledigt, Suche (inkl. `%`-Escaping) | ok |
| ↳ **Server-Neustart** (DB schließen/öffnen): alle Daten, Reihenfolge und Sitzungen erhalten | ok |
| ↳ Nicht-leerer Abschnitt löschen → 409, leerer → 204; Logout macht nur dieses Gerät ungültig | ok |
| ↳ Backup (`VACUUM INTO`) erzeugt lesbare Kopie, überschreibt nie | ok |
| `tsc --noEmit` (TypeScript 7) | ohne Fehler |
| `vite build` | ok (364 kB JS, 112 kB gzip) |
| Cross-Compile `linux/amd64` + `linux/arm64`, `CGO_ENABLED=0` | statische ELF-Binaries, ~11 MB |

## Manuell geprüft

Lokaler Server (`127.0.0.1:8380`) mit Demo-Datenbestand (4 Projekte, 306 Aufgaben inkl. Unteraufgaben, Labels, Kommentare).

| Szenario | Ergebnis |
|---|---|
| Verbindungstest im Anmeldefenster | „Verbunden mit Asanu-Server 0.1.0" |
| Zwei Browser-Clients (getrennte Sitzungen): Priorität in B geändert → erscheint in A ohne Neuladen | ok |
| Verschieben per Tastatur (Leertaste/Pfeile) in A → Reihenfolge in B und nach Server-Neustart gleich | ok |
| Server gestoppt, Titel bearbeitet → Fehler-Toast „nicht gespeichert", Eingabe bleibt im Feld, Status „Getrennt" | ok |
| Server wieder gestartet → automatische Neuverbindung, Daten neu geladen, Banner verschwindet | ok |
| **Gebaute Asanu.app**: startet, Overlay-Titelleiste, Login, Token im macOS-Schlüsselbund (`security find-generic-password -s app.asanu.desktop`) | ok |
| App beendet (⌘Q) und neu geöffnet → ohne erneute Anmeldung angemeldet | ok |
| Änderung über zweiten Client (API) → erscheint sofort in der nativen App | ok |

## Container-Test (wie auf ZimaOS)

Image `asanu-server:0.1.0` für `linux/amd64` auf dem Mac gebaut (28 s), mit `deploy/zimaos-compose.yaml` gestartet. Einziger Unterschied: Datenpfad `/srv/asanu/data` in der Linux-VM statt `/DATA/AppData/asanu/data`, Eigentümer `65532:65532`, Modus 700 – wie in `ZIMAOS.md`.

| Szenario | Ergebnis |
|---|---|
| Image: 4,9 MB, `scratch`, User 65532, Healthcheck eingebaut | ok |
| Variante `Dockerfile.prebuilt` (Weg B, nur Binary kopieren) baut | ok |
| `compose up`: Status *healthy*, erstes Konto aus Umgebungsvariablen angelegt | ok |
| Limits aktiv laut `docker inspect`: 256 MB, 0,5 CPU, 64 PIDs, Dateisystem nur lesbar, alle Capabilities entfernt, `unless-stopped` | ok |
| Client A legt Projekt + Aufgabe an, Client B (SSE) erhält Ereignisse, B ändert, A mit alter Version → 409 | ok |
| `docker restart` und `compose down` + `up` (Upgrade-Simulation): alle Daten und Sitzungen erhalten | ok |
| Backup per `docker exec … backup` → Projekt danach angelegt → Restore nach Doku-Schritten → Projekt wieder weg, Rest vollständig | ok |
| Konto per `docker exec -i … user-add` angelegt, Login ok | ok |
| Gebaute Asanu.app gegen Container angemeldet, Daten sichtbar | ok |
| SIGTERM → sauberes Herunterfahren („stopped" im Log) | ok |
| Export `docker save … \| gzip`: 4,9 MB | ok |

Fund beim Test: Backup-Dateien waren für alle lesbar (644), obwohl sie Passwort-Hashes enthalten → jetzt 600 (getestet).

Gefundene und behobene Fehler: doppelter Speicherversuch bei Inline-Bearbeitung (deaktiviertes Feld löste Blur aus); Wiederverbindungs-Backoff auf max. 10 s begrenzt (vorher 30 s).

## Messwerte (gemessen, macOS-RSS, nicht Linux/ZimaOS)

| Was | Wert |
|---|---|
| Server, Leerlauf nach Login | 14,6 MB |
| Server, nach Anlegen von 306 Aufgaben über die API | 21,9 MB |
| Server, nach Neustart mit 3 verbundenen Clients (2 Browser, 1 App) | 15,1 MB |
| **Container amd64 (Rosetta-emuliert), `docker stats`: Leerlauf / nach Login / 306 Aufgaben / mit App verbunden** | 41,0 / 41,2 / 47,0 / 41,7 MiB |
| Container arm64 nativ, Leerlauf | 2,8 MiB |
| CPU im Leerlauf (Container) | 0,00 % |
| SQLite-Datei mit Demodaten | 192 KB |
| Desktop-App, Hauptprozess (ohne WebKit-Hilfsprozesse) | 85–100 MB |
| Asanu.app / DMG | 4,6 MB / 2,6 MB |
| Build-Spitze (Rust-Release-Build, einmalig auf dem Mac) | 1 min 45 s; Speicher nicht gemessen |

Die amd64-Werte enthalten den Aufschlag der Rosetta-Emulation; auf einem echten x86-Server sollte der Wert zwischen 3 und 47 MiB liegen. **Auf ZimaOS selbst nicht gemessen** – dort mit `docker stats --no-stream asanu` prüfen. Das Compose-Limit (256 MB) liegt weit über dem beobachteten Bedarf; Ziel < 500 MB für den gesamten Serverstack (= 1 Container).

## Nicht geprüft / bekannte Grenzen

- Compose-Datei nicht über die ZimaOS-Oberfläche importiert, nur mit `docker compose` (Colima) gestartet.
- **Nichts auf ZimaOS installiert** (kein Zugriff, kein Auftrag).
- App nur gegen `127.0.0.1` getestet, nicht gegen eine LAN-IP, VPN oder https-Proxy.
- Konflikt-Dialog in der Oberfläche („Meine Änderung übernehmen / Verwerfen") nicht per UI ausgelöst; die 409-Logik dahinter ist serverseitig getestet. Im Normalfall lädt die App fremde Änderungen per SSE nach, bevor ein Konflikt entsteht.
- Ruhezustand des Macs nicht real getestet; abgedeckt durch `visibilitychange`/`online` + 60-s-Watchdog im SSE-Client.
- App ist nicht signiert/notarisiert → Gatekeeper-Warnung beim ersten Start.
- Nur Apple-Silicon-Build erzeugt; Intel und Windows nicht gebaut.
- Keine Offline-Bearbeitung (bewusst). Aufgaben-Reihenfolge innerhalb Unteraufgaben und Abschnitts-Reihenfolge nicht per Drag & Drop änderbar.
- Mehrere Konten teilen alle Projekte; keine Rechte pro Projekt.
- Beschreibung ist Klartext (kein Rich-Text-Editor wie ProseMirror im Klon).
- Ausgelassen aus dem Klon: Inbox, Meine Aufgaben, Favoriten, Dateien, Likes, Aktivitätsfeed, Teams, Gantt.

## Version 0.2.0 (Abgleich mit Asana, siehe `ASANA-ABGLEICH.md`)

| Prüfung | Ergebnis |
|---|---|
| Neue Server-Tests: Zuständig, „Meine Aufgaben"-Abschnitt bleibt bei gleicher Person, Start > Fällig / unbekannter Status / unbekannter Abschnitt / unbekanntes Konto → 400, Abhängigkeit auf sich selbst und Zyklus (x→z→y→x) → 400, „wartet auf"-Zähler fällt nach Erledigen auf 0, Projektzähler | bestanden |
| Migration: Datenbank im 0.1-Stand (Test) und die echte 0.1-Testdatenbank mit 306 Aufgaben → 0.2, Daten unverändert | ok |
| Browser: Startseite (Begrüßung, Meine Aufgaben mit Anstehend/Überfällig/Erledigt, Projektkacheln mit „bald fällig") | ok |
| Browser: Meine Aufgaben – Aufgabe per Maus von „Kürzlich zugewiesen" nach „Nächste Woche" gezogen, auf dem Server gespeichert | ok |
| Browser: Kalender zeigt Aufgaben über Start–Fällig-Bereich, heutiger Tag markiert | ok |
| Browser: Erstellen-Dialog legt Aufgabe an, weist sie mir zu, öffnet das Detail | ok |
| Browser: Abhängigkeit per Suche hinzugefügt → „Wartet auf eine offene Aufgabe", Sanduhr in der Liste | ok |
| Dunkles Design (macOS-Darstellung „Dunkel") in Browser und nativer App | ok |
| `tsc`, `vite build`, `tauri build` → Asanu_0.2.0_aarch64.dmg; App gestartet und angemeldet | ok |
| Image `asanu-server:0.2.0` (amd64) gebaut, Container *healthy*, Export 4,9 MB | ok |

Grenzen 0.2: Verschieben zwischen Abschnitten geht per Maus; per Tastatur nur innerhalb eines Abschnitts (Verhalten der Drag-&-Drop-Bibliothek bei untereinanderliegenden Listen). Reihenfolge innerhalb eines „Meine Aufgaben"-Abschnitts folgt dem Datum, nicht manuell. Fehlertexte des Servers (z. B. Zyklus) erscheinen auf Englisch im Hinweis. Konflikt-Dialog weiterhin nicht per UI ausgelöst.
