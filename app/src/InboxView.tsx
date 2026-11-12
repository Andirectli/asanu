import { useCallback, useEffect, useState } from 'react';
import type { Notification } from './api';
import { useApp, useServerEvents } from './ctx';

const ago = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Inbox: who assigned you something or commented on your tasks (Asana's "Inbox"). */
export function InboxView() {
  const { api, run, openTask, route } = useApp();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const load = useCallback(() => {
    api.inbox().then(setItems).catch(() => {});
  }, [api]);
  useEffect(load, [load]);
  useServerEvents((e) => (e === 'reconnect' || e.type === 'inbox') && load());

  const shown = (items ?? []).filter((n) => !onlyUnread || !n.read);
  const unread = (items ?? []).filter((n) => !n.read).length;
  return (
    <div className="inbox">
      <header className="inbox-head">
        <h1>Inbox</h1>
        <span className="spacer" />
        <label className="check-line">
          <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Nur ungelesene
        </label>
        <button type="button" className="btn small" disabled={!unread} onClick={async () => (await run(api.markInboxRead())) !== null && load()}>
          Alle als gelesen markieren
        </button>
      </header>
      {items && shown.length === 0 && <p className="muted inbox-empty">{onlyUnread ? 'Keine ungelesenen Benachrichtigungen.' : 'Noch nichts da. Hier erscheint, wenn dir jemand eine Aufgabe zuweist oder kommentiert.'}</p>}
      <ul className="inbox-list">
        {shown.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={`inbox-item ${n.read ? '' : 'unread'} ${route.taskId === n.taskId ? 'selected' : ''}`}
              onClick={async () => {
                openTask(n.taskId);
                if (!n.read) await run(api.markInboxRead([n.id]));
              }}
            >
              <span className="inbox-dot" aria-hidden />
              <span className="inbox-main">
                <span className="inbox-line">
                  <strong>{n.actorName || 'Jemand'}</strong> {n.kind === 'assigned' ? 'hat dir eine Aufgabe zugewiesen' : 'hat kommentiert'}
                </span>
                <span className="inbox-title">{n.title}</span>
                {n.body && <span className="inbox-body muted">{n.body}</span>}
                <span className="muted small">
                  {n.project} · {ago(n.createdAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
