import { useCallback, useEffect, useState } from 'react';
import { BsCheck2, BsListUl, BsPlus } from 'react-icons/bs';
import type { Task } from './api';
import { useApp, useServerEvents } from './ctx';
import { Avatar, CheckCircle, COLORS, DueText, dueState } from './ui';

type Tab = 'upcoming' | 'overdue' | 'done';

export function HomeView() {
  const { api, user, users, projects, openTask, run, go, reloadProjects, create } = useApp();
  const [open, setOpen] = useState<Task[]>([]);
  const [done, setDone] = useState<Task[]>([]);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [newProject, setNewProject] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, d] = await Promise.all([api.myTasks(), api.myTasks(true)]);
      setOpen(o);
      setDone(d);
    } catch {
      /* connection indicator shows the problem */
    }
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);
  useServerEvents((e) => {
    if (e === 'reconnect' || e.type === 'task') load();
  });

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const doneThisWeek = done.filter((t) => new Date(t.completedAt) >= weekStart).length;
  const list = tab === 'done' ? done.slice(0, 30) : open.filter((t) => (tab === 'overdue' ? dueState(t) === 'overdue' : dueState(t) !== 'overdue'));
  const active = projects.filter((p) => !p.archived);

  const addProject = async () => {
    const name = newProject?.trim();
    if (!name) return setNewProject(null);
    const p = await run(api.createProject(name, COLORS[projects.length % COLORS.length].hex));
    if (!p) return;
    setNewProject(null);
    await reloadProjects();
    go({ page: 'project', projectId: p.id, view: 'list' });
  };

  return (
    <div className="home">
      <header className="home-head" data-tauri-drag-region>
        <div className="muted">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>
          {greeting}, {user.name}
        </h1>
        <div className="home-stats">
          <span>
            <BsCheck2 /> {doneThisWeek} {doneThisWeek === 1 ? 'Aufgabe' : 'Aufgaben'} diese Woche erledigt
          </span>
          <span>{open.length} offen zugewiesen</span>
        </div>
      </header>
      <div className="home-grid">
        <section className="widget">
          <div className="widget-head">
            <Avatar user={users.get(user.id) ?? user} size={28} />
            <a href="#/my" className="widget-title">
              Meine Aufgaben
            </a>
          </div>
          <div className="widget-tabs" role="tablist">
            {(
              [
                ['upcoming', 'Anstehend'],
                ['overdue', `Überfällig${open.some((t) => dueState(t) === 'overdue') ? ` (${open.filter((t) => dueState(t) === 'overdue').length})` : ''}`],
                ['done', 'Erledigt'],
              ] as [Tab, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          <button type="button" className="widget-add" onClick={() => create()}>
            <BsPlus /> Aufgabe erstellen
          </button>
          <ul className="widget-list">
            {list.map((t) => {
              const p = projects.find((x) => x.id === t.projectId);
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: rows are reachable via the title button
                <li key={t.id} onClick={() => openTask(t.id)}>
                  <CheckCircle
                    done={t.completed}
                    onToggle={async () => {
                      await run(api.updateTask(t, { completed: !t.completed }));
                      load();
                    }}
                    label={t.completed ? 'Als offen markieren' : 'Als erledigt markieren'}
                  />
                  <button type="button" className="link-text">
                    {t.title}
                  </button>
                  {p && (
                    <span className="project-chip small ellipsis">
                      <span className="project-dot" style={{ background: p.color }} /> {p.name}
                    </span>
                  )}
                  <DueText t={t} />
                </li>
              );
            })}
            {!list.length && <li className="muted small">{tab === 'done' ? 'Noch nichts erledigt.' : tab === 'overdue' ? 'Nichts überfällig.' : 'Keine anstehenden Aufgaben.'}</li>}
          </ul>
        </section>
        <section className="widget">
          <div className="widget-head">
            <span className="widget-title">Projekte</span>
          </div>
          <div className="project-tiles">
            {newProject === null ? (
              <button type="button" className="project-tile" onClick={() => setNewProject('')}>
                <span className="tile-icon dashed">
                  <BsPlus size={22} />
                </span>
                <span>Projekt erstellen</span>
              </button>
            ) : (
              <div className="project-tile">
                <span className="tile-icon dashed">
                  <BsPlus size={22} />
                </span>
                <input
                  autoFocus
                  value={newProject}
                  placeholder="Projektname"
                  maxLength={200}
                  onChange={(e) => setNewProject(e.target.value)}
                  onBlur={addProject}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addProject();
                    if (e.key === 'Escape') setNewProject(null);
                  }}
                  aria-label="Name des neuen Projekts"
                />
              </div>
            )}
            {active.map((p) => (
              <a key={p.id} href={`#/project/${p.id}/list`} className="project-tile">
                <span className="tile-icon" style={{ background: p.color }}>
                  <BsListUl color="#fff" size={20} />
                </span>
                <span>
                  <span className="tile-name">{p.name}</span>
                  <span className="muted small">{p.dueSoon ? `${p.dueSoon} bald fällig` : `${p.openTasks} offen`}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
