Du entwickelst für mich eine private, selbst gehostete Projektmanagement-Desktop-App mit einer Oberfläche und Bedienung, die dem vorhandenen Asana-Klon möglichst nahekommt. Implementiere eine funktionierende erste Version; liefere nicht nur einen Plan.

## Ausgangspunkt

Repository: https://github.com/manakuro/asana-clone-app
Live-Demo: https://asanacloneapp.codelly.dev/

Ich mag Asana und besonders seine Desktop-App. Design und Bedienqualität sind zentrale Anforderungen. Verwende den bestehenden Klon als Ausgangspunkt und übernimm möglichst viele brauchbare Komponenten, Interaktionen und Funktionen. Bewahre die MIT-Lizenz und erforderliche Copyright-Hinweise. Verwende einen eigenen, später änderbaren App-Namen.

Nach bisheriger Prüfung enthält das Projekt ein Go-Backend mit GraphQL und Ent, ein React-Frontend auf Next.js sowie Abhängigkeiten von MySQL, Redis und Firebase. Prüfe den aktuellen Code selbst, einschließlich AGENTS.md, CLAUDE.md und weiterer vorhandener Apps und Pakete. Behandle diese Beschreibung als Ausgangshypothese, nicht als Ersatz für die Prüfung.

## Ziel und Prioritäten

1. Zuerst eine installierbare macOS-Desktop-App mit React und Tauri 2.
2. Die Architektur soll später eine Windows-Version aus derselben Codebasis ermöglichen. Windows muss jetzt noch nicht fertig ausgeliefert werden.
3. Mein ZimaOS-Heimserver speichert den zentralen Datenstand. Die App verbindet sich mit ihm über eine API.
4. Projekte, Aufgaben und Status müssen auf mehreren Geräten übereinstimmen. Der Server ist die maßgebliche Datenquelle.
5. Vollständig selbst hostbar, ohne verpflichtenden Cloud-Dienst, SaaS-Account oder bezahlten Dienst zur Laufzeit.
6. Sehr niedriger RAM- und CPU-Verbrauch auf dem Heimserver. Ziel: unter 500 MB RAM für den gesamten notwendigen Serverstack bei kleiner privater Nutzung.
7. Die Desktop-App ist das erste Produkt. Eine separate öffentliche Website, Handy-App und PWA sind für diese Version nicht erforderlich.

## Technische Richtung

- React und TypeScript für die Oberfläche; Tauri 2 als Desktop-Hülle.
- Die gebaute Oberfläche liegt lokal in der Desktop-App. Der Heimserver muss dafür keinen Next.js-Renderingserver betreiben.
- Bevorzugt Go für die zentrale API und SQLite für die Daten. Möglichst ein Servercontainer, ohne zusätzliche Datenbank- oder Redis-Container.
- Firebase und sonstige verpflichtende Cloud-Abhängigkeiten ersetzen.
- Bestehende Architektur und GraphQL-Verträge weiterverwenden, soweit das sinnvoll ist. Keine komplette Neuentwicklung aus Bequemlichkeit.
- Prüfe besonders Next.js-Routing, dynamische Projektrouten, serverseitige Authentifizierung und Server Components. Eine Umstellung auf statisches React ist kein bloßer Konfigurationsschalter. Falls sinnvoll, verwende Vite und clientseitiges Routing und portiere die vorhandenen UI-Komponenten gezielt.
- Prüfe MySQL-spezifische Abfragen, Ent-Schemas, Migrationen und Redis-Verwendung, bevor du auf SQLite und interne Ereignisverteilung umstellst.
- Dokumentiere begründete Architekturentscheidungen und setze sie anschließend um.
- Verwende zueinander passende, gepflegte Abhängigkeiten und Commit-fähige Lockfiles.

## Gemeinsamer Datenstand und Anmeldung

Dies ist zunächst eine Online-App mit zentraler Speicherung, keine Offline-App mit nachträglicher Synchronisierung.

- Ein privater Benutzer darf auf mehreren Geräten gleichzeitig angemeldet sein.
- Eine Änderung wird über die API auf dem Server dauerhaft gespeichert.
- Andere verbundene Geräte erhalten Änderungen zeitnah über WebSockets oder Server-Sent Events.
- Reconnect, Ruhezustand des Macs und erneutes Öffnen der App dürfen keine veralteten Datenstände festhalten.
- Gleichzeitige Änderungen dürfen nicht unbemerkt Daten überschreiben. Verwende passende Transaktionen und Versionsprüfungen beziehungsweise Konfliktbehandlung.
- Fehlgeschlagene Speicherung darf nicht als erfolgreich erscheinen. Bewahre ungespeicherte Eingaben soweit möglich und zeige einen verständlichen Verbindungs- oder Speicherfehler.
- Keine SQLite-Datei zwischen Geräten kopieren oder über SMB/NFS synchronisieren. Clients greifen ausschließlich über die API zu.
- Lokale Anmeldung auf meinem Server, keine anonyme Demo-Authentifizierung als Produktionslösung.
- Serveradresse in der Desktop-App konfigurierbar; sinnvoller Verbindungstest und verständliche Fehlermeldungen.
- Passwörter serverseitig mit einem etablierten Passwort-Hashverfahren speichern. Dauerhafte Anmeldetokens im OS-Keystore speichern, nicht im Quellcode, in URLs oder ungeschützt im Local Storage.
- Tauri-Berechtigungen und Content Security Policy gezielt konfigurieren. Keine pauschale Abschaltung von Zertifikatsprüfung oder Webview-Sicherheitsfunktionen als Lösung für Netzwerkprobleme.
- Dokumentiere den Zugriff im Heimnetz und über einen vorhandenen VPN-Zugang beziehungsweise HTTPS. Verändere keine Routerfreigaben automatisch.

Offline-Bearbeitung und komplexe Offline-Synchronisierung sind ausdrücklich spätere Erweiterungen.

## Erste nutzbare Version

Implementiere diese Funktionen mit echter Serverspeicherung:

- Projekte erstellen, umbenennen, farblich kennzeichnen und archivieren.
- Aufgaben und Abschnitte innerhalb eines Projekts erstellen und bearbeiten.
- Aufgaben mit Titel, Beschreibung, Fälligkeit, Priorität, Labels und Unteraufgaben.
- Aufgaben abschließen und wieder öffnen.
- Listenansicht und Kanban-Ansicht desselben Datenbestands.
- Aufgaben zwischen Abschnitten beziehungsweise Spalten verschieben; Reihenfolge dauerhaft speichern.
- Aufgaben-Detailansicht mit Notizen beziehungsweise Kommentaren.
- Suche und sinnvolle Filter.
- Die zentralen Änderungen zwischen zwei gleichzeitig geöffneten Clients abgleichen.

Gantt, Portfolios, Automatisierungen, komplexe Teamrechte, Datei-Anhänge und mobile Apps erst nach dieser Grundlage einplanen. Zeige keine scheinbar funktionierenden Steuerelemente für noch nicht implementierte Funktionen.

## Gestaltung und Mac-Bedienung

Orientiere dich eng an der Oberfläche des Klons: dunkle Seitenleiste, helle Arbeitsfläche, kompakte Aufgabenzeilen, Abschnitte, dezente Trennlinien, farbige Projektmarkierungen und Statusfelder, klare Navigation und ein seitlicher Aufgaben-Detailbereich.

Keine Umgestaltung zu einem beliebigen Dashboard mit großen Kacheln, dominanten Verläufen oder überdimensionierten Abständen. Erhalte die Asana-ähnliche Anmutung. Prüfe vorhandene Screenshots und, wenn verfügbar, die Live-Demo. Die Demo kann langsam laden; blockiere die Entwicklung nicht daran.

Berücksichtige Mac-Tastenkürzel, sichtbaren Tastaturfokus, sinnvolle Fenstergrößen, Scrollverhalten und eine saubere Integration von Titelleiste und App-Menü. Plattformabhängige Details kapseln, damit Windows später ergänzt werden kann.

## ZimaOS und Ressourcen

ZimaOS unterstützt benutzerdefinierte Docker-Compose-Dateien.

Liefere ein produktionsgeeignetes Server-Dockerfile und eine tatsächlich nutzbare Compose-Konfiguration mit persistenten Datenverzeichnissen, konfigurierbarem Port, Neustartverhalten, Healthcheck und überprüfbaren Ressourcenlimits. Port 80 und 443 nicht voraussetzen.

Ein YAML-Import auf ZimaOS lädt keine Git-Dateien, Build-Kontexte oder .env-Dateien automatisch nach. Dokumentiere deshalb einen konkreten Weg vom Quellcode zum verfügbaren Docker-Image, beispielsweise lokal bauen, exportieren und auf ZimaOS importieren. Keine erfundenen Registry-Images oder Verweise auf nicht veröffentlichte Images.

Dokumentiere absolute Host-Pfade, Containerpfade, Dateirechte, erforderliche Umgebungsvariablen und die Architekturwahl für das Server-Image. Daten dürfen bei Containerneustart oder Upgrade nicht verloren gehen.

Baue auf dem Entwicklungsrechner, damit der Heimserver nicht durch Compiler und Frontend-Builds belastet wird. Vermeide im Produktivbetrieb Entwicklungsserver, unnötige Hintergrunddienste und häufiges Polling.

Die RAM-Grenze ist ein Ziel, kein bereits bewiesener Wert. Miss nach Möglichkeit Leerlauf, Anmeldung, Laden eines realistischen Datenbestands und Änderungen mit zwei Clients. Zähle alle erforderlichen Servercontainer zusammen. Trenne Serververbrauch, Desktopverbrauch und Build-Spitzen. Behaupte keine Messwerte, die du nicht erhoben hast.

## Vorgehen, Tests und Übergabe

1. Prüfe Repository, Entwicklungsumgebung und bestehende Funktionen.
2. Halte einen kurzen Umsetzungsplan und die wichtigsten Entscheidungen schriftlich fest.
3. Implementiere schrittweise bis zu einer lauffähigen Version. Fahre nach dem Plan selbstständig fort; frage nur bei wirklich blockierenden Entscheidungen.
4. Teste mit zwei unabhängigen Clients: Auf Client A Projekt und Aufgabe anlegen, auf B sehen und bearbeiten, Änderung auf A empfangen.
5. Teste konkurrierende Änderungen, Verbindungsunterbrechung, Neustart des Servers und der App sowie Erhalt aller gespeicherten Daten.
6. Prüfe Authentifizierung, Eingabevalidierung, Migrationen und einen konsistenten Backup-/Restore-Ablauf.
7. Führe die passenden Build- und Typechecks aus. Baue auf einem geeigneten Mac eine startbare .app und möglichst ein .dmg. Falls die Umgebung das nicht ermöglicht, benenne die konkrete Grenze und liefere nachvollziehbare Build-Schritte; behaupte keinen erfolgreichen nativen Build.

Übergib Quellcode, Lizenzhinweise, Architekturübersicht, Start- und Build-Befehle, Mac-Installationsanleitung, ZimaOS-Konfiguration, Backup-/Restore-Anleitung und eine ehrliche Liste tatsächlich geprüfter Funktionen und verbleibender Grenzen.

Keine Veröffentlichung oder Installation auf meinem echten Server ohne vorhandenen Zugriff und entsprechenden Auftrag. Bereite alle dafür nötigen Dateien und Schritte trotzdem vollständig vor.

Beginne jetzt mit der Repository-Prüfung und arbeite anschließend an der Implementierung.
