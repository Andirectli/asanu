import { useEffect, useState } from 'react';
import type { Task } from './api';
import { useApp } from './ctx';

/** Search field that picks a task this one should wait for. */
export function DependencyPicker({ exclude, onPick }: { exclude: number[]; onPick: (id: number) => void }) {
  const { api, projects } = useApp();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Task[]>([]);

  const ex = exclude.join(','); // stable dependency for the effect
  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api
        .search(q.trim(), true, ctrl.signal)
        .then((r) => setHits(r.filter((t) => !ex.split(',').includes(String(t.id))).slice(0, 8)))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [api, q, ex]);

  return (
    <div className="anchor">
      <input className="add-subtask" placeholder="+ Abhängigkeit hinzufügen (Aufgabe suchen)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Abhängigkeit suchen" />
      {hits.length > 0 && (
        <div className="popover left dep-results" role="listbox">
          {hits.map((t) => {
            const p = projects.find((x) => x.id === t.projectId);
            return (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={false}
                className="check-line"
                onClick={() => {
                  onPick(t.id);
                  setQ('');
                  setHits([]);
                }}
              >
                {p && <span className="project-dot" style={{ background: p.color }} />}
                <span className="ellipsis">{t.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
