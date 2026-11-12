# Asana per REA beobachtet (2026-11-12)

**Wie:** Echtes Chromium (Playwright-Build 156) mit leerem, getrenntem Profil und lokaler Debug-Schnittstelle nur auf `127.0.0.1`. Der Nutzer hat sich selbst bei Asana angemeldet (Testkonto, deutsche Oberfläche). **REA 6.9.0** (`list-browser-targets` mit Origin-Filter `https://app.asana.com`, `inspect-web-page` mit Barrierefreiheits-Baum) hat jeden Zustand gelesen; die Klicks kamen aus einem kleinen Playwright-Skript.

**Regeln:** Nur der Asana-Tab (zwei fremde Tabs im selben Browser wurden nicht angefasst). Es wurden nur Menüs und Dialoge **geöffnet und mit Esc geschlossen**; nie ein Menüpunkt gewählt, nichts bestätigt, nichts angelegt oder gelöscht, niemand eingeladen, keine Einstellung geändert. Asanas Programmcode wurde nicht heruntergeladen oder ausgewertet.

**Abdeckung:** Projekt (Übersicht, Liste, Board, Zeitleiste, Dashboard, Kalender), Startseite, Meine Aufgaben, Inbox, Portfolios, Projektübersicht, Erstellen-Menü, Aufgaben-Detailansicht (nur sichtbare Bedienelemente; Menüs darin ließen sich nicht öffnen).

**Grenzen von REA hier:** (1) `analyze-web-bundle` bricht ab, sobald die Seite während der Beobachtung neu lädt; Asanas Skripte waren vorher geladen → 5 Skripte, 0 Routen, 0 Endpunkte. (2) Passives Netzwerk-Mitschneiden lieferte nur wenige Anfragen (Asana nutzt meist andere Kanäle). (3) Die Menü-Tour ist teils mit Seitenleisten-Menüs ausgefüllt; die Werkzeugleisten-Menüs kamen im zweiten Durchgang.

## Was Asana kann (Oberfläche) → Stand in Asanu 0.4.1

### Projekt
| Asana | Asanu |
|---|---|
| Reiter: Übersicht, Liste, Board, **Zeitleiste**, Dashboard, Kalender (+ „Tab hinzufügen", Ansicht umbenennen) | alle bis auf Dashboard; keine eigenen Reiter |
| Status: Planmäßig, Gefährdet, Unplanmäßig, **Zurückgestellt, Erledigt, Verworfen**, KI-Entwurf | 3 von 6, ohne KI |
| Farbe (15 + „Keine") und **Symbol** (Liste, Board, Zeitleiste, Kalender, Rakete, Menschen, Diagramm …, Hochladen) | 15 Farben; Symbol fest |
| Aktionen: Einstellungen, Berechtigungen, Farbe/Symbol, Link kopieren, **Duplizieren, Als Vorlage speichern**, Zu Portfolio, Tabelle erstellen, Importieren, **Exportieren**, Archivieren, Löschen | nur Archivieren |
| Favorit (Stern) | fehlt |
| Teilen / Mitglieder: per E-Mail einladen, „Wer hat Zugriff" | alle Konten sehen alles (Absicht) |
| „Anpassen" (Ansicht-Bausteine) | fehlt |

### Liste / Board / Zeitleiste / Kalender
| Asana | Asanu |
|---|---|
| Aufgabenarten: Aufgabe, **Genehmigung, Meilenstein**, Abschnitt (Tab+N) | nur Aufgabe, Abschnitt |
| Sortieren nach: Startdatum, Fälligkeit, Verantwortlich, Erstellt von/am, Zuletzt geändert, Erledigt am, Gefällt mir, Alphabetisch, Priorität, Status, Projekt | 4 (manuell, Fälligkeit, Priorität, Name) |
| **Gruppieren** (nach Feld) | fehlt |
| Filter (mit Bedingungen) | 5 feste Auswahlfelder |
| Spaltenmenü: sortieren, filtern, gruppieren, Spalte hinzufügen/verschieben/ausblenden | fehlt (feste Spalten) |
| **Eigene Felder (gebaut in 0.7: Text, Zahl, Datum, Auswahl):** Einzelauswahl, Mehrfachauswahl, Datum, Personen, Referenz, Lookup, Text, Zahl, Formel, ID, Timer, Zeiterfassung, Berechnung; Sammlung | fehlt (nur Priorität/Status/Labels) |
| Feldwerte Priorität: Niedrig/Mittel/Hoch; Status: Planmäßig/Gefährdet/Unplanmäßig; Optionen bearbeitbar | feste Werte |
| Abschnitt: umbenennen, duplizieren, Unteraufgaben/Gruppen ein-/ausklappen, leere Gruppen ausblenden, löschen | umbenennen, löschen, einklappen |
| In der Ansicht suchen | globale Suche |
| Zeitleiste: Zoom Stunden/Tage/Wochen/Monate/Quartale/6 Monate/Jahre, Sortieren (Keine/Start/Fällig/Verantwortlich), Balken ziehen | 4 Tage-Zoomstufen, ohne Ziehen |
| Kalender: Wochen/Monate | nur Monat |
| Verantwortlich-Auswahl mit Suche | Auswahlliste |
| Aufgabe in „Meine Aufgaben"-Abschnitt verschieben | gebaut |

### Aufgabe (Detailansicht, sichtbare Bedienelemente)
Aufgabenlink kopieren · Vollbild · Weitere Aktionen · **Beteiligte** hinzufügen/entfernen · Teilen · **Gefällt mir** · Als erledigt markieren · Verantwortlich + „Zuletzt zugewiesen"-Fach · Fälligkeit (Start/Fällig) · Abhängigkeiten · **Projekt hinzufügen (mehrere Projekte)** · Felder durchsuchen/einklappen · Priorität, Status · **Unteraufgaben (filtern/sortieren)** · **Anhänge** · Beschreibung mit **Inhalte hinzufügen** (Rich-Text) · Kommentare mit @erwähnen, Emoji, Sticker, „Sichtbar machen".

Asanu hat: Verantwortlich, Start/Fällig, Priorität, Status, Labels, Abhängigkeiten, Unteraufgaben, Klartext-Beschreibung, Kommentare, Vergrößern, Löschen. **Fehlt:** Beteiligte, Gefällt mir, Link kopieren, mehrere Projekte, Anhänge, Rich-Text, @erwähnen, Unteraufgaben-Sortierung.

### Seiten
| Asana | Asanu |
|---|---|
| Startseite: Zeitraum Meine Woche/Mein Monat, Widgets hinzufügen, geteilte Ansicht/Volle Breite | Startseite ohne Zeitraum und Widgets |
| Meine Aufgaben: Reiter Liste/Board/Kalender/Dateien, Spalten Beteiligte/Projekte/Sichtbarkeit, Feld hinzufügen, „Aufgaben per E-Mail hinzufügen" | nur Liste, feste Spalten |
| Inbox (Benachrichtigungen, KI-Zusammenfassung) | fehlt |
| Alle Projekte mit Sortierung (Relevanz, Fälligkeit, Zuletzt geändert, Erstellt, A–Z/Z–A) | nur Seitenleiste |
| Portfolios, Ziele, Teams, Seiten, Nachrichten, Tabellen, Strategie, Agenten, Wissen | fehlen (außerhalb des Auftrags) |
| Erstellen-Menü: Aufgabe, Projekt, Seite, Nachricht, Team, Portfolio, Ziel, Tabelle, Einladung | Aufgabe |
| Seitenleiste sortieren: Alphabetisch/Kürzlich/Relevanteste, „Navigation anpassen" | feste Reihenfolge |
| Dashboard: Widget hinzufügen (Diagramm, Text), verschieben/Größe/duplizieren | fehlt |

## Empfohlene Reihenfolge (Nutzen zu Aufwand)
1. **Klein:** Projektstatus um Zurückgestellt/Erledigt/Verworfen · Projektsymbol-Auswahl · Kalender Woche/Monat · Link kopieren · Favoriten-Stern · Seitenleiste sortieren · Startseite Woche/Monat.
2. **Mittel:** Gruppieren nach Feld · mehr Sortier-Optionen mit Richtung · Spalten ein-/ausblenden · Zeitleiste: Zoomstufen + Balken ziehen · Projekt duplizieren/Vorlage/CSV-Export · Meilenstein-Aufgaben · Inbox.
3. **Groß:** Eigene Felder · Dashboard mit Diagrammen · mehrere Projekte pro Aufgabe · Beteiligte · Anhänge · Rich-Text mit @erwähnen.
4. **Bewusst nicht:** KI-Funktionen, Strategie/Agenten/Wissen, Portfolios/Ziele/Teams, Abrechnung, Einladungen per E-Mail (kein Mailserver; private Nutzung).
