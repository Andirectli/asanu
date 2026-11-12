# Abgleich mit Asana (2026-11-12)

Quelle: Bildschirmfotos der angemeldeten Asana-Desktop-App des Nutzers (Startseite, Meine Aufgaben, Aufgabe „Task 1"). Nur angesehen, nichts geändert. Andere Ansichten ließen sich per Link nicht öffnen; der Rest stützt sich auf bekanntes Asana-Verhalten.

REA wurde nicht verwendet: Der REA-MCP-Server ist hier nicht registriert, und das Nachladen per `npx rea-agents` (ungeprüftes Paket) wurde bewusst nicht ausgeführt. Für eine bereits offene Oberfläche sieht der Skill ohnehin Beobachtung vor; das geschah per Bildschirmfoto.

## Beobachtet in Asana → Stand in Asanu 0.2

| Asana | Asanu 0.2 |
|---|---|
| Startseite: Begrüßung, Datum, „0 tasks completed", Widget *My tasks* mit Upcoming/Overdue/Completed, Widget *Projects* mit „3 tasks due soon" | **gebaut** |
| *My tasks*: eigene Abschnitte Recently assigned / Do today / Do next week / Do later, Spalten Due date + Projects | **gebaut** (Abschnitte per Drag & Drop) |
| Feld *Assignee* | **gebaut** (alle Konten des Servers) |
| Datumsbereich „13 – 17 Nov" (Start + Fällig) | **gebaut** |
| Feld *Status* (On track …) | **gebaut** (Im Plan / Gefährdet / Verzug) |
| *Dependencies* | **gebaut** („Wartet auf" / „Blockiert"), mit Zyklusprüfung |
| Tabs List / Board / **Calendar** | Kalender **gebaut** (Monat, Aufgaben auf Datum/Bereich, Anlegen per +) |
| *Sort* in der Liste | **gebaut** (manuell, Fälligkeit, Priorität, Name) |
| *Create*-Knopf oben links | **gebaut** (Schnell-Anlegen: Titel, Projekt, mir zuweisen) |
| Zurück/Vor-Pfeile | **gebaut** |
| Detail vergrößern (Expand) | **gebaut** |
| Dunkles Design | **gebaut** (folgt macOS-Einstellung) |

## Bewusst nicht nachgebaut

Inbox/Benachrichtigungen, Likes, Kollaboratoren/Follower, Sichtbarkeit pro Aufgabe, Aufgabe in mehreren Projekten, eigene Felder je Projekt, Dashboard-, Knowledge-, Portfolio-, Strategy-, Agents- und KI-Funktionen (Cloud-KI widerspricht „vollständig selbst gehostet"), Emoji/@-Erwähnungen im Kommentar, Abrechnung/Testphase.
