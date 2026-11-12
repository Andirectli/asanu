# Asanu-Server auf ZimaOS

Ein Container, ein Programm, eine SQLite-Datei. Kein MySQL, kein Redis, keine Cloud.

## Installieren (2 Schritte, keine Befehle)

1. `deploy/zimaos-compose.yaml` öffnen, bei `ASANU_INIT_EMAIL`, `ASANU_INIT_PASSWORD` (mind. 10 Zeichen) und `ASANU_INIT_NAME` deine Werte eintragen, alles kopieren.
2. ZimaOS → App Store → „+" → *Install a customized app* → oben **YAML** → Inhalt ersetzen → **Install**.

ZimaOS lädt das Image `ghcr.io/andirectli/asanu-server` (öffentlich, amd64 + arm64) und legt das Daten-Volume selbst an. Es werden **zwei** Container angelegt: `asanu` (der Server) und `asanu-updater` (hält ihn aktuell, siehe unten).

Dann in der Desktop-App als Server `http://<ZimaOS-Adresse>:8380` eintragen (z. B. `http://zimaos:8380` über Tailscale) und mit E-Mail/Passwort aus Schritt 1 anmelden. Danach dürfen die drei `ASANU_INIT_*`-Zeilen raus; sie wirken ohnehin nur, solange es noch kein Konto gibt.

## Updates (automatisch)

- Der Update-Container (Watchtower, `ghcr.io/nicholas-fedor/watchtower`) prüft **stündlich**, ob unter `ghcr.io/andirectli/asanu-server:latest` eine neuere Version liegt, lädt sie und ersetzt den `asanu`-Container. Andere Container auf ZimaOS fasst er nicht an (Filter per Label; im Test: „scanned 1").
- In der Mac-App steht unten links die Server-Version und **„Nach Update suchen"**. Der Knopf löst die Prüfung sofort aus; die App meldet „aktualisiert: X → Y" oder „aktuell". Während des Neustarts (einige Sekunden) verbindet sich die App von selbst neu.
- **Daten sind geschützt:** Vor jeder Datenbank-Umstellung legt der Server eine Sicherung unter `/data/backups/pre-vX-to-vY-<zeit>.db` an (die letzten 5 bleiben). Ein älterer Server startet nicht auf einer neueren Datenbank (kein stilles Downgrade). Zurück auf eine alte Version geht nur mit Sicherung (Restore unten).
- **Sicherheitshinweis:** Der Update-Container braucht Zugriff auf den Docker-Socket (`/var/run/docker.sock`); das ist root-gleiche Kontrolle über Docker auf ZimaOS. Dafür läuft nur dieses eine, fest benannte Programm mit Zugriff, und sein Anschluss ist nicht nach außen veröffentlicht. Außerdem gilt: Wer in deinem GitHub-Konto ein neues Image als `latest` veröffentlichen kann, bringt damit Code auf deinen Server. Das GitHub-Konto deshalb mit 2FA schützen.
- **Festhalten auf einer Version / ohne Auto-Update:** In der YAML `image: ghcr.io/andirectli/asanu-server:0.4.0` (feste Version) eintragen und den ganzen Block `updater:` sowie die zwei Zeilen `ASANU_UPDATE_…` löschen. Dann zeigt die App keinen Update-Knopf.
- Die zwei Werte `ASANU_UPDATE_TOKEN` (im Server) und `WATCHTOWER_HTTP_API_TOKEN` (im Updater) müssen gleich sein. Ändere beide oder keinen.

**Update von einer älteren Installation (0.2.x/0.3.x ohne Updater):** Einmalig in ZimaOS die App löschen (das Daten-Volume bleibt) und die neue YAML installieren, oder die YAML der App bearbeiten und den `updater`-Block samt Token-Zeilen ergänzen. Danach geht es automatisch.

## Technische Daten

| Was | Wert |
|---|---|
| Image | `ghcr.io/andirectli/asanu-server:latest` (oder feste Version), Basis `scratch`, ~5 MB, läuft als UID 65532 (kein root) |
| Port | Container `8080`, auf ZimaOS `8380` (in der YAML links änderbar; 80/443 nicht nötig) |
| Daten | Docker-Volume `asanu_asanu-data` → im Container `/data` (`asanu.db` + `-wal`/`-shm`). Auf dem Host: `/var/lib/docker/volumes/asanu_asanu-data/_data` |
| Limits | Server 256 MB RAM, 0,5 CPU, 64 Prozesse, Dateisystem nur lesbar, keine Capabilities; Updater 128 MB, 0,25 CPU |
| Healthcheck | `/asanu-server health` alle 30 s |

Umgebungsvariablen: `ASANU_UPDATE_URL` / `ASANU_UPDATE_TOKEN` (Link zum Updater; ohne sie kein Update-Knopf), `ASANU_INIT_EMAIL` / `ASANU_INIT_PASSWORD` / `ASANU_INIT_NAME` (nur erster Start), `ASANU_DATA_DIR` (Standard `/data`), `ASANU_ADDR` (Standard `:8080`), `TZ` (nur Log-Zeiten).

## Konten (per SSH, selten nötig)

```bash
sudo docker exec -i asanu /asanu-server user-add partner@example.lan "Partner"
```
```bash
sudo docker exec -i asanu /asanu-server passwd ich@example.lan
```
Das Passwort wird danach abgefragt. Alle Konten sehen dieselben Projekte. `passwd` meldet alle Geräte dieses Kontos ab.

## Backup und Restore (per SSH)

**Backup** – ein Befehl, konsistent, Server läuft weiter:

```bash
sudo docker exec asanu /asanu-server backup - > ~/asanu-backup-$(date +%F).db
```

Die Datei `~/asanu-backup-<datum>.db` sichern (z. B. auf den Mac kopieren); sie enthält Passwort-Hashes, also nicht offen ablegen. Nicht einfach `asanu.db` im Betrieb kopieren – ohne die `-wal`-Datei fehlen evtl. die letzten Änderungen.

**Restore:**

```bash
sudo docker stop asanu
sudo cp ~/asanu-backup-2026-11-12.db /var/lib/docker/volumes/asanu_asanu-data/_data/asanu.db
sudo rm -f /var/lib/docker/volumes/asanu_asanu-data/_data/asanu.db-wal /var/lib/docker/volumes/asanu_asanu-data/_data/asanu.db-shm
sudo chown 65532:65532 /var/lib/docker/volumes/asanu_asanu-data/_data/asanu.db
sudo docker start asanu
```

Die Desktop-Apps verbinden sich selbst neu. Nach Restore auf einen älteren Stand ist ggf. eine neue Anmeldung nötig.

## Zugriff: Heimnetz, VPN, HTTPS

- **Heimnetz:** `http://<ZimaOS-IP>:8380`. Feste IP für ZimaOS im Router vergeben.
- **Unterwegs:** über Tailscale/WireGuard ins Heimnetz, z. B. `http://zimaos:8380`. Keine Portfreigabe im Router nötig; Asanu ändert keine Router-Einstellungen.
- **HTTPS:** optional per vorhandenem Reverse-Proxy (Caddy, Nginx Proxy Manager) mit gültigem Zertifikat vor Port 8380; bei Nginx `proxy_buffering off` für die Live-Verbindung. Die App schaltet Zertifikatsprüfungen nicht ab.
- Bei http wird das Sitzungstoken unverschlüsselt übertragen → nur im eigenen Netz/VPN, nie direkt ins Internet freigeben.

## Neue Version veröffentlichen (Entwickler, auf dem Mac)

Image mit neuer Versionsnummer **und** als `latest` hochladen; die Server holen es sich dann innerhalb einer Stunde oder per Knopf:

```bash
cd server && docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/andirectli/asanu-server:0.5.0 -t ghcr.io/andirectli/asanu-server:latest --push .
```

Ohne Registry: `make linux-amd64`, Binary + `Dockerfile.prebuilt` auf den Server kopieren, dort `docker build -f Dockerfile.prebuilt -t asanu-server:0.3.0 .` und in der YAML `image: asanu-server:0.3.0` plus `pull_policy: never` setzen.

## Ressourcen prüfen

```bash
sudo docker stats --no-stream asanu
```
