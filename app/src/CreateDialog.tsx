import { useEffect, useState } from 'react';
import type { Section } from './api';
import { useApp } from './ctx';

/** Quick create (Asana's "Create" button): title, project, section, assignee, due date. */
export function CreateDialog({ projectId, onClose, dueDate: initialDue = '' }: { projectId?: number; onClose: () => void; dueDate?: string }) {
  const { api, projects, user, run, openTask, toast } = useApp();
  const active = projects.filter((p) => !p.archived);
  const [title, setTitle] = useState('');
  const [pid, setPid] = useState(projectId ?? active[0]?.id ?? 0);
  const [sections, setSections] = useState<Section[]>([]);
  const [sid, setSid] = useState(0);
  const [mine, setMine] = useState(true);
  const [milestone, setMilestone] = useState(false);
  const [due, setDue] = useState(initialDue);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pid) return;
    let alive = true;
    api
      .board(pid)
      .then((b) => {
        if (!alive) return;
        setSections(b.sections);
        setSid(b.sections[0]?.id ?? 0);
      })
      .catch(() => alive && setSections([]));
    return () => {
      alive = false;
    };
  }, [api, pid]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !sid || busy) return;
    setBusy(true);
    const t = await run(api.createTask({ projectId: pid, sectionId: sid, title: title.trim(), kind: milestone ? 'milestone' : 'task' }));
    if (!t) return setBusy(false); // keep the dialog and the typed title
    if (mine || due) {
      const ok = await run(api.updateTask(t, { ...(mine ? { assigneeId: user.id } : {}), ...(due ? { dueDate: due } : {}) }));
      if (!ok) toast('Aufgabe angelegt, aber Zuständigkeit/Datum nicht gespeichert.');
    }
    setBusy(false);
    onClose();
    openTask(t.id);
  };

  if (!active.length)
    return (
      <div className="modal-backdrop" onMouseDown={onClose}>
        <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
          <p>Lege zuerst ein Projekt an.</p>
        </div>
      </div>
    );
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} aria-label="Aufgabe erstellen">
        <h2>Aufgabe erstellen</h2>
        <input className="modal-title" autoFocus placeholder="Aufgabenname" value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} aria-label="Aufgabenname" />
        <div className="modal-grid">
          <label>
            Projekt
            <select value={pid} onChange={(e) => setPid(Number(e.target.value))}>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Abschnitt
            <select value={sid} onChange={(e) => setSid(Number(e.target.value))}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fällig
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className="check-line">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mir zuweisen
          </label>
          <label className="check-line">
            <input type="checkbox" checked={milestone} onChange={(e) => setMilestone(e.target.checked)} /> Als Meilenstein
          </label>
        </div>
        <div className="row gap modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!title.trim() || !sid || busy}>
            {busy ? 'Speichert …' : 'Erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
}
