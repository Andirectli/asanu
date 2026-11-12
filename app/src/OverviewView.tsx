import { useCallback, useEffect, useState } from 'react';
import type { ProjectUpdate, Status } from './api';
import { useApp, useServerEvents } from './ctx';
import type { BoardModel } from './ProjectView';
import { Avatar, STATUSES } from './ui';

const CHOICES = STATUSES.filter((s) => s.value);

/** Project overview: describe the project, report a status, see the history (Asana's "Overview" tab). */
export function OverviewView({ m, onDescription }: { m: BoardModel; onDescription: (text: string) => Promise<boolean> }) {
  const { api, run, users } = useApp();
  const p = m.board.project;
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [pick, setPick] = useState<Status>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [desc, setDesc] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUpdates(await api.updates(p.id));
    } catch {
      /* indicator shows connection problems */
    }
  }, [api, p.id]);
  useEffect(() => {
    load();
  }, [load]);
  useServerEvents((e) => {
    if (e === 'reconnect' || (e.type === 'project' && e.id === p.id)) load();
  });

  const post = async () => {
    if (!pick || busy) return;
    setBusy(true);
    const ok = await run(api.addUpdate(p.id, pick, note.trim()));
    setBusy(false);
    if (!ok) return; // keep the typed note
    setPick('');
    setNote('');
    load();
  };

  const total = m.board.tasks.filter((t) => !t.parentId);
  const done = total.filter((t) => t.completed).length;
  const late = total.filter((t) => !t.completed && t.dueDate && t.dueDate < new Date().toLocaleDateString('sv-SE')).length;

  return (
    <div className="overview">
      <div className="overview-main">
        <section>
          <h2>Projektbeschreibung</h2>
          <textarea
            className="description"
            placeholder="Worum geht es in diesem Projekt?"
            value={desc ?? p.description}
            maxLength={20000}
            aria-label="Projektbeschreibung"
            onChange={(e) => setDesc(e.target.value)}
            onBlur={async () => {
              if (desc === null || desc === p.description) return setDesc(null);
              if (await onDescription(desc)) setDesc(null);
            }}
          />
        </section>
        <section>
          <h2>Stand</h2>
          <div className="stat-row">
            <div className="stat">
              <strong>{total.length - done}</strong>
              <span className="muted small">offen</span>
            </div>
            <div className="stat">
              <strong>{done}</strong>
              <span className="muted small">erledigt</span>
            </div>
            <div className={`stat ${late ? 'late' : ''}`}>
              <strong>{late}</strong>
              <span className="muted small">überfällig</span>
            </div>
          </div>
          {total.length > 0 && (
            <div className="progress" role="progressbar" aria-valuenow={Math.round((done / total.length) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Fortschritt">
              <span style={{ width: `${(done / total.length) * 100}%`, background: p.color }} />
            </div>
          )}
        </section>
      </div>
      <aside className="overview-side">
        <h2>Wie ist der Status?</h2>
        <div className="status-picks" role="radiogroup" aria-label="Status wählen">
          {CHOICES.map((s) => (
            <button key={s.value} type="button" role="radio" aria-checked={pick === s.value} className={`status-pick ${pick === s.value ? `on status-${s.value}` : ''}`} onClick={() => setPick(s.value)}>
              <span className={`status-dot dot-${s.value}`} /> {s.label}
            </button>
          ))}
        </div>
        {pick && (
          <div className="status-form">
            <textarea placeholder="Was gibt es Neues? (optional)" value={note} maxLength={10000} onChange={(e) => setNote(e.target.value)} aria-label="Statusnotiz" />
            <div className="row gap">
              <button type="button" className="btn primary small" onClick={post} disabled={busy}>
                {busy ? 'Speichert …' : 'Status melden'}
              </button>
              <button type="button" className="btn small" onClick={() => setPick('')}>
                Abbrechen
              </button>
            </div>
          </div>
        )}
        <ol className="feed">
          {updates.map((u) => (
            <li key={u.id}>
              <Avatar user={users.get(u.userId)} size={26} />
              <div>
                <div>
                  <span className={`pill status-${u.status}`}>{CHOICES.find((c) => c.value === u.status)?.label}</span>
                </div>
                {u.body && <p className="comment-body">{u.body}</p>}
                <div className="muted small">
                  {u.userName} · {new Date(u.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
            </li>
          ))}
          <li className="feed-created">
            <span className="feed-dot" />
            <div>
              <strong>Projekt erstellt</strong>
              <div className="muted small">{new Date(p.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
          </li>
        </ol>
      </aside>
    </div>
  );
}
