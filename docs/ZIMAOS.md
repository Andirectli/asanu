# Asanu-Server auf ZimaOS

Ein Container, ein Programm, eine SQLite-Datei. Kein MySQL, kein Redis, keine Cloud.

## Installieren (2 Schritte, keine Befehle)

1. `deploy/zimaos-compose.yaml` öffnen, bei `ASANU_INIT_EMAIL`, `ASANU_INIT_PASSWORD` (mind. 10 Zeichen) und `ASANU_INIT_NAME` deine Werte eintragen, alles kopieren.
2. ZimaOS → App Store → „+" → *Install a customized app* → oben **YAML** → Inhalt ersetzen → **Install**.

ZimaOS lädt das Image `ghcr.io/andirectli/asanu-server` (öffentlich, amd64 + arm64) und legt das Daten-Volume selbst an.

Dann in der Desktop-App als Server `http://<ZimaOS-Adresse>:8380` eintragen (z. B. `http://zimaos:8380` über Tailscale) und mit E-Mail/Passwort aus Schritt 1 anmelden. Danach dürfen die drei `ASANU_INIT_*`-Zeilen raus; sie wirken ohnehin nur, solange es noch kein Konto gibt.

**Update:** In ZimaOS bei der App „Bearbeiten" → in `image:` die Versionsnummer erhöhen → speichern. Daten bleiben im Volume. Ein älterer Server startet nicht auf einer neueren Datenbank (kein stilles Downgrade).

## Technische Daten

| Was | Wert |
|---|---|
| Image | `ghcr.io/andirectli/asanu-server:<version>`, Basis `scratch`, ~5 MB, läuft als UID 65532 (kein root) |
| Port | Container `8080`, auf ZimaOS `8380` (in der YAML links änderbar; 80/443 nicht nötig) |
| Daten | Docker-Volume `asanu_asanu-data` → im Container `/data` (`asanu.db` + `-wal`/`-shm`). Auf dem Host: `/var/lib/docker/volumes/asanu_asanu-data/_data` |
| Limits | 256 MB RAM, 0,5 CPU, 64 Prozesse, Dateisystem nur lesbar, keine Capabilities |
| Healthcheck | `/asanu-server health` alle 30 s |

Umgebungsvariablen: `ASANU_INIT_EMAIL` / `ASANU_INIT_PASSWORD` / `ASANU_INIT_NAME` (nur erster Start), `ASANU_DATA_DIR` (Standard `/data`), `ASANU_ADDR` (Standard `:8080`), `TZ` (nur Log-Zeiten).

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

```bash
cd server && docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/andirectli/asanu-server:0.3.0 --push .
```

Ohne Registry: `make linux-amd64`, Binary + `Dockerfile.prebuilt` auf den Server kopieren, dort `docker build -f Dockerfile.prebuilt -t asanu-server:0.3.0 .` und in der YAML `image: asanu-server:0.3.0` plus `pull_policy: never` setzen.

## Ressourcen prüfen

```bash
sudo docker stats --no-stream asanu
```
