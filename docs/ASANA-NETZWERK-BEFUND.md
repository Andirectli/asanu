# Asana: Datenmodell aus dem Netzwerkverkehr (2026-11-12)

**Methode:** Wie die „Backend Architect“-Rolle aus clone-team: ein Testkonto im Browser, schreibgeschützt durch Seiten geklickt (Startseite, Inbox, Meine Aufgaben, Projekt: Übersicht/Liste/Board/Zeitleiste/Kalender, Aufgaben öffnen). Aufgezeichnet wurden **nur Feldnamen und Typen**, keine Werte, Tokens oder Cookies. Es wurde nichts verändert.

## Wie Asana Daten überträgt
- Kein klassisches REST. Alle Daten laufen über **einen WebSocket** (`/socket`): der Client abonniert benannte „Projektionen“ (`sub`), der Server liefert Objekte (`added`/`changed`/`batch_removed`), Änderungen gehen als `mutation` hinaus und kommen als `committed`/`reflected` zurück. Verbindung wird mit `resumeToken` wieder aufgenommen.
- Daneben wenige HTTP-Aufrufe: Sitzungsstart, Experimente, Diagramm-Abfragen fürs Dashboard (`execute_legacy_chart_query`: `objectType`, `metrics[aggregator]`, `filters`, `groupBys`, `asanaChartType`).
- Asanu macht es einfacher und bleibt bei REST plus Live-Hinweisen (SSE). Das ist gewollt.

## Aufgaben-Felder, die Asanu noch nicht hat
| Asana-Feld | Bedeutung | Asanu |
|---|---|---|
| `recurrenceType`, `recurrenceJson`, `recursDaysAfterCompletion` | **Wiederkehrende Aufgaben** | fehlt |
| `dueTime`, `startTime` | Uhrzeit zu Datum | nur Datum |
| `richDescription` | Rich-Text-Beschreibung | Klartext |
| `numHearts` | „Gefällt mir“ | fehlt |
| `numIncompleteSubtasks`, `subtaskDateRollupsMode` | Zähler und Datum-Zusammenfassung der Unteraufgaben | Zähler ja, Zusammenfassung nein |
| `totalTrackedTimeMinutes`, `isTimeTrackingEnabled`, `billableTimeDefault` | **Zeiterfassung** | fehlt |
| `autoShiftDependencyDates` | Abhängige Aufgaben verschieben sich automatisch mit | fehlt |
| `customFieldDisplayValues`, `enumOptionSortMode` | Eigene Felder (Auswahl-Optionen sortierbar, Farben) | Text/Zahl/Datum/Auswahl, ohne Farben |
| `completionState`, `unreadByAssignee` | Erledigt-Zustand, „ungelesen für Verantwortliche“ | erledigt ja |
| `timelineRow`, `timelineInitializationState` | Zeile in der Zeitleiste | automatisch |
| `taskStoryFeedFilterType`, `taskStoryFeedSortType` | Aktivitätsverlauf der Aufgabe (Filter/Sortierung) | fehlt |
| `addToCollaborators`, `followedByQuery`, `assigneeSpeedbumpPreference` | Beteiligte/Folgen | fehlt |

Farbwerte (Asana-Palette): aqua, blue, blue-green, cool-gray, green, purple, red, yellow, yellow-orange.

## Daraus folgende Reihenfolge
1. **Wiederkehrende Aufgaben** (täglich, wöchentlich, monatlich, X Tage nach Erledigung).
2. **Beteiligte** (folgen, in Inbox benachrichtigt).
3. **Zeiterfassung** (Minuten pro Aufgabe, Summe im Dashboard).
4. Uhrzeit, Gefällt mir, Aktivitätsverlauf, Abhängigkeiten verschieben automatisch.
5. Anhänge und Rich-Text (größer).

## Grenzen
Nur sichtbare Seiten und geöffnete Aufgaben, Menüs nicht bedient. Die Feldliste ist die Vereinigung aller Objekttypen (Konto, Team, Aufgabe …), deshalb steht hier nur, was sich eindeutig Aufgaben zuordnen lässt.
