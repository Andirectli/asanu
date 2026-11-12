#!/usr/bin/env python3
"""Fill a Asanu server with a realistic demo data set via the public API.

usage: python3 tools/seed_demo.py http://127.0.0.1:8380 EMAIL  (password via ASANU_PASSWORD env)
"""
import json
import os
import random
import sys
import urllib.request

base, email = sys.argv[1].rstrip("/"), sys.argv[2]
token = None


def call(method, path, body=None):
    req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"null")


token = call("POST", "/api/login", {"email": email, "password": os.environ["ASANU_PASSWORD"], "device": "seed"})["token"]
random.seed(7)
labels = [call("POST", "/api/labels", {"name": n, "color": c}) for n, c in
          [("Einkauf", "#4ecbc4"), ("Wohnung", "#f1bd6c"), ("Arbeit", "#4573d2"), ("Garten", "#5da283"), ("Dringend", "#f06a6a")]]
projects = {
    "Haushalt": "#f06a6a", "Renovierung Bad": "#4573d2", "Urlaub Portugal": "#f1bd6c", "Homeserver": "#5da283",
}
verbs = ["Angebot einholen für", "Termin machen:", "Prüfen:", "Bestellen:", "Aufräumen:", "Notizen zu", "Reparieren:", "Planen:"]
things = ["Fliesen", "Waschmaschine", "Steuererklärung", "Fahrrad", "Backup-Platte", "Flüge", "Mietwagen", "Router", "Heizung", "Fenster", "Regal", "Gartenschlauch"]
n = 0
for name, color in projects.items():
    p = call("POST", "/api/projects", {"name": name, "color": color})
    board = call("GET", f"/api/projects/{p['id']}/board")
    for s in board["sections"]:
        for _ in range(random.randint(8, 14)):
            t = call("POST", "/api/tasks", {"projectId": p["id"], "sectionId": s["id"], "title": f"{random.choice(verbs)} {random.choice(things)}"})
            n += 1
            patch = {"version": t["version"], "description": "Details folgen. " * random.randint(0, 6),
                     "priority": random.choice(["", "", "low", "medium", "high"]),
                     "labelIds": random.sample([l["id"] for l in labels], random.randint(0, 2))}
            if random.random() < 0.6:
                patch["dueDate"] = f"2026-11-{random.randint(1, 30):02d}"
            if s["name"] == "Erledigt":
                patch["completed"] = True
            call("PATCH", f"/api/tasks/{t['id']}", patch)
            for _ in range(random.randint(0, 3)):
                call("POST", "/api/tasks", {"parentId": t["id"], "title": f"Teilschritt {random.choice(things)}"})
                n += 1
            if random.random() < 0.3:
                call("POST", f"/api/tasks/{t['id']}/comments", {"body": "Habe ich mir angeschaut, passt so."})
print(f"seeded {len(projects)} projects, {n} tasks")
