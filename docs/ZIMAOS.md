# Asanu-Server auf ZimaOS

Ein Container, ein statisches Go-Binary, SQLite-Datei auf dem Host. Kein MySQL, kein Redis, keine Cloud.

## Überblick

| Was | Wert |
|---|---|
| Image | `asanu-server:0.2.0` (lokal gebaut, **nicht** in einer Registry) |
| Architektur | `linux/amd64` (ZimaBoard, ZimaBlade, ZimaCube = Intel x86-64). Für ARM-Hosts `linux/arm64` bauen. Prüfen: `uname -m` auf ZimaOS → `x86_64` = amd64. |
| Container-Port | `8080` |
| Host-Port (Vorschlag) | `8380` – frei wählbar in der Compose-Datei, 80/443 werden nicht benötigt |
| Host-Datenpfad | `/DATA/AppData/asanu/data` |
| Container-Datenpfad | `/data` (enthält `asanu.db`, `asanu.db-wal`, `asanu.db-shm`) |
| Container-Benutzer | UID/GID `65532` (kein root) |
| Dateirechte | Ordner `0700`, Eigentümer `65532:65532` |
| Ressourcenlimits | 256 MB RAM, 0,5 CPU, 64 Prozesse (in `deploy/zimaos-compose.yaml`) |

## Umgebungsvariablen

| Variable | Pflicht | Standard | Bedeutung |
|---|---|---|---|
| `ASANU_DATA_DIR` | nein | `/data` | Ordner der SQLite-Datei |
| `ASANU_ADDR` | nein | `:8080` | Lauschadresse im Container |
| `ASANU_INIT_EMAIL` / `ASANU_INIT_PASSWORD` | nur beim ersten Start | – | Legt das erste Konto an, **wenn noch keins existiert**. Passwort 10–72 Zeichen. Danach aus der Compose-Datei entfernen. |
| `ASANU_INIT_NAME` | nein | Teil vor `@` | Anzeigename des ersten Kontos |
| `ASANU_CORS_ORIGINS` | nein | Tauri-Origins + `http://localhost:1420` | Nur für Entwicklung ändern |
| `TZ` | nein | UTC | Nur für Log-Zeitstempel |

## Schritt 1 – Image bauen (auf dem Mac, nicht auf dem Heimserver)

**Weg A – mit Docker auf dem Mac** (Docker Desktop, OrbStack oder Colima). So getestet mit Colima:

```bash
brew install colima docker docker-buildx
colima start --vm-type vz --vz-rosetta     # danach: colima stop
```


```bash
cd asanu/server
docker buildx build --platform linux/amd64 -t asanu-server:0.2.0 --load .
docker save asanu-server:0.2.0 | gzip > asanu-server-0.2.0-amd64.tar.gz
scp asanu-server-0.2.0-amd64.tar.gz root@zimaos.local:/DATA/
ssh root@zimaos.local 'gunzip -c /DATA/asanu-server-0.2.0-amd64.tar.gz | docker load'
```

**Weg B – ohne Docker auf dem Mac:** Binary auf dem Mac kreuzkompilieren, auf ZimaOS nur noch in ein leeres Image kopieren (kein Compiler auf dem Server, dauert Sekunden):

```bash
cd asanu/server
make linux-amd64                     # erzeugt asanu-server-linux-amd64 (statisch, ~11 MB)
ssh root@zimaos.local 'mkdir -p /DATA/asanu-build'
scp asanu-server-linux-amd64 Dockerfile.prebuilt .dockerignore root@zimaos.local:/DATA/asanu-build/
ssh root@zimaos.local 'cd /DATA/asanu-build && docker build -f Dockerfile.prebuilt -t asanu-server:0.2.0 .'
```

Kontrolle: `ssh root@zimaos.local 'docker image ls asanu-server'`

## Schritt 2 – Datenordner anlegen

```bash
ssh root@zimaos.local 'mkdir -p /DATA/AppData/asanu/data && chown -R 65532:65532 /DATA/AppData/asanu/data && chmod 700 /DATA/AppData/asanu/data'
```

## Schritt 3 – Compose importieren

1. `deploy/zimaos-compose.yaml` öffnen, **E-Mail und Startpasswort ändern**, ggf. Host-Port ändern.
2. ZimaOS-Oberfläche → App Store → „+" → *Install a customized app* → *Import* → Inhalt einfügen → Installieren.
   Alternativ per SSH: Datei nach `/DATA/AppData/asanu/docker-compose.yaml` kopieren und `docker compose -f /DATA/AppData/asanu/docker-compose.yaml up -d`.
3. Prüfen: `curl http://zimaos.local:8380/api/health` → `{"app":"asanu","ok":true,...}`
4. In der Desktop-App anmelden. Danach `ASANU_INIT_EMAIL`/`ASANU_INIT_PASSWORD` aus der Compose-Datei löschen und die App neu bereitstellen.

Hinweis: Ein YAML-Import lädt keine Git-Dateien, Build-Kontexte oder `.env`-Dateien. Deshalb steht alles Nötige direkt in der YAML und das Image muss vorher geladen sein (`pull_policy: never`).

## Konten verwalten

```bash
# weiteres Konto (Passwort wird von stdin gelesen)
ssh -t root@zimaos.local 'docker exec -i asanu /asanu-server user-add partner@example.lan "Partner"'
# Passwort zurücksetzen (meldet alle Geräte dieses Kontos ab)
ssh -t root@zimaos.local 'docker exec -i asanu /asanu-server passwd ich@example.lan'
```

Alle Konten sehen dieselben Projekte (gemeinsamer Haushalt). Rechte pro Projekt gibt es in dieser Version nicht.

## Backup und Restore

**Backup (online, konsistent, Server läuft weiter)** – nutzt SQLite `VACUUM INTO`:

```bash
ssh root@zimaos.local 'docker exec asanu /asanu-server backup /data/backup-$(date +%F).db && mkdir -p /DATA/Backup/asanu && mv /DATA/AppData/asanu/data/backup-*.db /DATA/Backup/asanu/'
```

Nicht einfach `asanu.db` im laufenden Betrieb kopieren: Ohne die `-wal`-Datei fehlen evtl. die letzten Änderungen. Regelmäßig: obigen Befehl als Cron-Job auf ZimaOS oder per ZimaOS-Backup-Funktion `/DATA/Backup/asanu` sichern.

**Restore:**

```bash
ssh root@zimaos.local
docker stop asanu
cd /DATA/AppData/asanu/data
mkdir -p ../before-restore && mv asanu.db* ../before-restore/      # alten Stand aufheben
cp /DATA/Backup/asanu/backup-2026-11-12.db asanu.db
chown 65532:65532 asanu.db && chmod 600 asanu.db
docker start asanu && docker logs --tail 5 asanu
```

Die Desktop-Apps verbinden sich selbst neu und laden den wiederhergestellten Stand. Sitzungen sind Teil der Datenbank; nach einem Restore auf einen älteren Stand ist ggf. eine neue Anmeldung nötig.

## Upgrade

Von 0.1.0 auf 0.2.0: Die Datenbank bekommt beim ersten Start automatisch die neuen Felder (Zuständig, Startdatum, Status, Abhängigkeiten); bestehende Daten bleiben unverändert (getestet). Ein 0.1.0-Server startet danach nicht mehr auf dieser Datenbank – zurück nur per Backup.


Neues Image laden (Schritt 1 mit neuer Versionsnummer), in der Compose-Datei `image:` anpassen, neu bereitstellen. Die Daten liegen im Bind-Mount und bleiben erhalten. Migrationen laufen beim Start automatisch in einer Transaktion. Vorher ein Backup machen. Ein älteres Binary verweigert den Start auf einer neueren Datenbank (kein stilles Downgrade).

## Zugriff: Heimnetz, VPN, HTTPS

- **Heimnetz:** In der App `http://<ZimaOS-IP>:8380` eintragen (oder `http://zimaos.local:8380`, falls mDNS funktioniert). Feste IP für ZimaOS im Router vergeben.
- **Unterwegs:** Über einen vorhandenen VPN-Zugang (z. B. WireGuard, Tailscale, ZeroTier oder die ZimaOS-eigene Fernzugriffslösung) ins Heimnetz und dieselbe Adresse verwenden. **Keine Portfreigabe im Router nötig** – Asanu ändert keine Router-Einstellungen.
- **HTTPS:** Im Heimnetz/VPN ist http üblich. Für https einen vorhandenen Reverse-Proxy (z. B. Caddy, Nginx Proxy Manager) mit gültigem Zertifikat vor Port 8380 setzen; SSE braucht dort `proxy_buffering off` (Nginx) bzw. funktioniert bei Caddy ohne Zusatz. Dann `https://asanu.example` in der App eintragen. Die App schaltet Zertifikatsprüfungen **nicht** ab; selbstsignierte Zertifikate müssen im macOS-Schlüsselbund als vertrauenswürdig markiert werden.
- Das Sitzungstoken wird bei http im Klartext übertragen. Deshalb nur im eigenen Netz bzw. VPN ohne https betreiben, nie direkt ins Internet freigeben.

## Ressourcenmessung prüfen

```bash
ssh root@zimaos.local 'docker stats --no-stream asanu'
```
