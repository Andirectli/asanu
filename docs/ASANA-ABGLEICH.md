# Abgleich mit Asana (2026-11-12)

Quelle: Bildschirmfotos der angemeldeten Asana-Desktop-App des Nutzers (Startseite, Meine Aufgaben, Aufgabe „Task 1"). Nur angesehen, nichts geändert. Andere Ansichten ließen sich per Link nicht öffnen; der Rest stützt sich auf bekanntes Asana-Verhalten.

## Einsatz von REA (rea-agents 6.9.0, vom Nutzer als Zip mitgegeben)

Das Zip enthält Quellcode ohne `dist/`. Es wurde in einem eigenen Ordner entpackt, `package.json` und das `prepare`-Skript gelesen (harmlos, Pakete nur von npmjs), dann mit `npm ci --ignore-scripts` installiert (ohne Installationsskripte von esbuild/frida/fsevents) und mit `npm run compile` gebaut. Danach: `rea analyze-javascript-application /Applications/Asana.app/Contents/Resources/app.asar` – rein lesend, nichts ausgeführt.

**Ergebnis:** Asana Desktop 2.10.6 ist eine Electron-Hülle (`app.asar`, 29 MB, 3 513 Dateien). Eigener Code sind nur `generated/main/index.js`, `generated/preload/index.js` sowie die Seiten `desktop_tabs` (Tab-Leiste) und `load_failed` (Fehlerseite); der Rest sind Hilfspakete (Sentry, tar …). Die Hülle lädt die gesamte Oberfläche von `https://app.asana.com/`. **Listen, Board, Timeline, Aufgaben stecken nicht in der App-Datei**, REA kann daraus keine Produktfunktionen ableiten (0 Fenster, 0 IPC-Kanäle erkannt; gebündelter Code). Funktionen stammen deshalb aus dem Ansehen der laufenden Oberfläche.

Nicht getan: Asana mit Debug-Port neu starten oder Netzwerkverkehr mitschneiden (würde Sitzung und Daten des Kontos erfassen) und den vom Server geladenen Web-Code von Asana auswerten. Beides wäre möglich, aber eingreifender.

## Beobachtet in Asana → Stand in Asanu 0.2

| Asana | Asanu 0.2 |
|---|---|
| Startseite: Begrüßung, Datum, „0 tasks completed", Widget *My tasks* mit Upcoming/Overdue/Completed, Widget *Projects* mit „3 tasks due soon" | **gebaut** |
| *My tasks*: eigene Abschnitte Recently assigned / Do today / Do next week / Do later, Spalten Due date + Projects | **gebaut** (Abschnitte per Drag & Drop) |
| Feld *Assignee* | **gebaut** (alle Konten des Servers) |
| Datumsbereich „13 – 17 Nov" (Start + Fällig) | **gebaut** |
| Feld *Status* (On track …) | **gebaut** (Im Plan / Gefährdet / Verzug) |
| *Dependencies* | **gebaut** („Wartet auf" / „Blockiert"), mit Zyklusprüfung |
| Tabs Overview / List / Board / Timeline / Dashboard / Calendar / Meetings | Übersicht, Liste, Board, **Timeline**, Kalender **gebaut**; Dashboard und Meetings (KI) nicht |
| Timeline: Balken Start→Fällig je Aufgabe, nach Abschnitt gruppiert, Farbe nach Priorität (niedrig türkis, mittel orange, hoch lila), Tage-Zoom, „Heute", Heute-Linie | **gebaut** (nur ansehen/öffnen; Balken ziehen/verlängern und Abhängigkeitslinien fehlen noch) |
| Übersicht: „Wie ist der Status?" (Im Plan / Gefährdet / Verzug) mit Notiz, Verlauf, Projektbeschreibung, „Projekt erstellt" | **gebaut**; Status-Chip im Projektkopf |
| Übersicht: KI-Zusammenfassung, Projektrollen/Mitglieder, „X ist beigetreten" | nicht gebaut |
| *Sort* in der Liste | **gebaut** (manuell, Fälligkeit, Priorität, Name) |
| *Create*-Knopf oben links | **gebaut** (Schnell-Anlegen: Titel, Projekt, mir zuweisen) |
| Zurück/Vor-Pfeile | **gebaut** |
| Detail vergrößern (Expand) | **gebaut** |
| Dunkles Design | **gebaut** (folgt macOS-Einstellung) |

## Bewusst nicht nachgebaut

Inbox/Benachrichtigungen, Likes, Kollaboratoren/Follower, Sichtbarkeit pro Aufgabe, Aufgabe in mehreren Projekten, eigene Felder je Projekt, Dashboard-, Knowledge-, Portfolio-, Strategy-, Agents- und KI-Funktionen (Cloud-KI widerspricht „vollständig selbst gehostet"), Emoji/@-Erwähnungen im Kommentar, Abrechnung/Testphase.
