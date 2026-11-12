import { useMemo } from 'react';
import type { Task } from './api';
import { useApp } from './ctx';
import type { BoardModel } from './ProjectView';
import { PRIORITIES, STATUSES, today } from './ui';

type Bar = { label: string; done: number; open: number };

function BarChart({ title, bars }: { title: string; bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.done + b.open));
  return (
    <section className="dash-card">
      <h3>{title}</h3>
      {bars.length === 0 || bars.every((b) => b.done + b.open === 0) ? (
        <p className="muted small">Keine Daten</p>
      ) : (
        bars.map((b) => (
          <div key={b.label} className="dash-bar-row" title={`${b.label}: ${b.open} offen, ${b.done} erledigt`}>
            <span className="dash-bar-label ellipsis">{b.label}</span>
            <span className="dash-bar-track">
              <span className="dash-bar done" style={{ width: `${(b.done / max) * 100}%` }} />
              <span className="dash-bar open" style={{ width: `${(b.open / max) * 100}%` }} />
            </span>
            <span className="dash-bar-n">{b.done + b.open}</span>
          </div>
        ))
      )}
    </section>
  );
}

const group = (tasks: Task[], key: (t: Task) => string, order?: string[]): Bar[] => {
  const m = new Map<string, Bar>((order ?? []).map((l) => [l, { label: l, done: 0, open: 0 }]));
  for (const t of tasks) {
    const l = key(t);
    const b = m.get(l) ?? { label: l, done: 0, open: 0 };
    b[t.completed ? 'done' : 'open']++;
    m.set(l, b);
  }
  return [...m.values()];
};

/** Dashboard: counts and charts computed from the project's tasks (Asana's "Dashboard" tab). */
export function DashboardView({ m }: { m: BoardModel }) {
  const { users } = useApp();
  const { board } = m;
  const d = useMemo(() => {
    const tasks = board.tasks.filter((t) => !t.parentId);
    const t0 = today();
    const secName = new Map(board.sections.map((s) => [s.id, s.name]));
    const weeks: Bar[] = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
      weeks.push({ label: from.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }), open: 0, done: tasks.filter((t) => t.completed && t.completedAt && new Date(t.completedAt) >= from && new Date(t.completedAt) < to).length });
    }
    return {
      tasks,
      total: tasks.length,
      done: tasks.filter((t) => t.completed).length,
      overdue: tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < t0).length,
      unassigned: tasks.filter((t) => !t.completed && !t.assigneeId).length,
      bySection: group(tasks, (t) => secName.get(t.sectionId ?? -1) ?? '—', board.sections.map((s) => s.name)),
      byAssignee: group(tasks, (t) => (t.assigneeId ? (users.get(t.assigneeId)?.name ?? '?') : 'Nicht zugewiesen')),
      byPrio: group(tasks, (t) => PRIORITIES.find((p) => p.value === t.priority)?.label ?? 'Keine', PRIORITIES.map((p) => p.label)),
      byStatus: group(tasks, (t) => STATUSES.find((s) => s.value === t.status)?.label ?? 'Kein Status', STATUSES.map((s) => s.label)),
      weeks,
    };
  }, [board, users]);
  const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
  const tiles: [string, string | number][] = [
    ['Aufgaben gesamt', d.total],
    ['Erledigt', `${d.done} (${pct} %)`],
    ['Überfällig', d.overdue],
    ['Nicht zugewiesen', d.unassigned],
  ];
  return (
    <div className="dashboard">
      <div className="dash-tiles">
        {tiles.map(([l, v]) => (
          <div key={l} className={`dash-tile ${l === 'Überfällig' && d.overdue ? 'warn' : ''}`}>
            <span className="dash-tile-n">{v}</span>
            <span className="muted small">{l}</span>
          </div>
        ))}
      </div>
      <div className="dash-legend muted small">
        <span className="dash-key done" /> erledigt <span className="dash-key open" /> offen
      </div>
      <div className="dash-grid">
        <BarChart title="Aufgaben pro Abschnitt" bars={d.bySection} />
        <BarChart title="Aufgaben pro Verantwortlichem" bars={d.byAssignee} />
        <BarChart title="Nach Priorität" bars={d.byPrio} />
        <BarChart title="Nach Status" bars={d.byStatus} />
        <BarChart title="Erledigt pro Woche (8 Wochen)" bars={d.weeks} />
        {(board.fields ?? [])
          .filter((f) => f.type === 'select')
          .map((f) => (
            <BarChart key={f.id} title={f.name} bars={group(d.tasks, (t) => board.fieldValues?.[t.id]?.[f.id] || '—', f.options)} />
          ))}
      </div>
    </div>
  );
}
