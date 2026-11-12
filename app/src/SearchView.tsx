import { useEffect, useState } from 'react';
import { errorText, type Task } from './api';
import { useApp, useServerEvents } from './ctx';
import { CheckCircle, DueText, LabelPills, PriorityPill } from './ui';

export function SearchView({ q }: { q: string }) {
  const { api, projects, openTask, labels, route, run } = useApp();
  const [results, setResults] = useState<Task[] | null>(null);
  const [withDone, setWithDone] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useServerEvents((e) => {
    if (e === 'reconnect' || e.type === 'task') setTick((n) => n + 1);
  });

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .search(q, withDone, ctrl.signal)
      .then((r) => {
        setResults(r);
        setError('');
      })
      .catch((e) => !ctrl.signal.aborted && setError(errorText(e)));
    return () => ctrl.abort();
  }, [api, q, withDone, tick]);

  return (
    <div className="project">
      <header className="project-header" data-tauri-drag-region>
        <div className="project-title-row">
          <h1 className="project-name">Suche: „{q}"</h1>
          <span className="spacer" />
          <label className="filter">
            <input type="checkbox" checked={withDone} onChange={(e) => setWithDone(e.target.checked)} /> Erledigte einbeziehen
          </label>
        </div>
      </header>
      {error && <div className="banner">{error}</div>}
      {q.length < 2 && <p className="pad muted">Mindestens 2 Zeichen eingeben.</p>}
      {results && q.length >= 2 && (
        <div className="list-view">
          {!results.length && <p className="pad muted">Keine Treffer.</p>}
          {results.map((t) => {
            const p = projects.find((x) => x.id === t.projectId);
            return (
              // biome-ignore lint/a11y/useSemanticElements: row contains its own button
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                className={`task-row ${route.taskId === t.id ? 'selected' : ''} ${t.completed ? 'completed' : ''}`}
                onClick={() => openTask(t.id)}
                onKeyDown={(e) => e.key === 'Enter' && openTask(t.id)}
              >
                <span className="col-title">
                  <CheckCircle
                    done={t.completed}
                    onToggle={async () => {
                      await run(api.updateTask(t, { completed: !t.completed }));
                      setTick((n) => n + 1);
                    }}
                    label="Erledigt umschalten"
                  />
                  <span className="ellipsis">{t.title}</span>
                  {t.parentId && <span className="muted small">(Unteraufgabe)</span>}
                </span>
                <span className="col-due">
                  <DueText t={t} />
                </span>
                <span className="col-prio">
                  <PriorityPill p={t.priority} />
                </span>
                <span className="col-labels">
                  <LabelPills ids={t.labelIds} labels={labels} />
                  {p && (
                    <span className="project-chip small">
                      <span className="project-dot" style={{ background: p.color }} /> {p.name}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
