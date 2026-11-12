import { DragDropContext, Draggable, type DropResult, Droppable } from '@hello-pangea/dnd';
import { useCallback, useEffect, useState } from 'react';
import { BsChevronDown, BsChevronRight, BsGripVertical } from 'react-icons/bs';
import type { MySection, Task } from './api';
import { useApp, useServerEvents } from './ctx';
import { Avatar, CheckCircle, DueText, PriorityPill } from './ui';

const BUCKETS: { key: MySection; name: string }[] = [
  { key: '', name: 'Kürzlich zugewiesen' },
  { key: 'today', name: 'Heute erledigen' },
  { key: 'next_week', name: 'Nächste Woche' },
  { key: 'later', name: 'Später' },
];

// shortcut: order inside a bucket follows the due date, not a stored position; add one if manual ordering is wanted.
export function MyTasksView() {
  const { api, user, users, projects, openTask, route, run, create } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setTasks(await api.myTasks());
    } catch {
      /* indicator */
    }
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);
  useServerEvents((e) => {
    if (e === 'reconnect' || e.type === 'task') load();
  });

  const onDragEnd = async ({ draggableId, destination, source }: DropResult) => {
    if (!destination || destination.droppableId === source.droppableId) return;
    const t = tasks?.find((x) => x.id === Number(draggableId));
    if (!t) return;
    const mySection = destination.droppableId.slice(2) as MySection; // ids are "b:<key>"
    setTasks((ts) => ts && ts.map((x) => (x.id === t.id ? { ...x, mySection } : x)));
    if (!(await run(api.updateTask(t, { mySection })))) load();
  };

  if (!tasks) return <div className="empty-state muted">Lade …</div>;
  return (
    <div className="project">
      <header className="project-header" data-tauri-drag-region>
        <div className="project-title-row">
          <Avatar user={users.get(user.id) ?? user} size={30} />
          <h1 className="project-name">Meine Aufgaben</h1>
        </div>
        <div className="tabs">
          <a className="active" href="#/my" aria-current="page">
            Liste
          </a>
        </div>
      </header>
      <div className="toolbar">
        <button type="button" className="btn primary small" onClick={() => create()}>
          + Aufgabe hinzufügen
        </button>
        <span className="muted small">Aufgaben aus allen Projekten, die dir zugewiesen sind. Zwischen Abschnitten ziehen, um sie einzuplanen.</span>
      </div>
      <div className="list-view">
        <div className="list-head my">
          <span>Aufgabenname</span>
          <span>Fällig</span>
          <span>Priorität</span>
          <span>Projekt</span>
        </div>
        <DragDropContext onDragEnd={onDragEnd}>
          {BUCKETS.map((b) => {
            const items = tasks.filter((t) => t.mySection === b.key);
            const open = !closed.has(b.key);
            return (
              <section key={b.key} className="section">
                <div className="section-head">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={open ? 'Einklappen' : 'Ausklappen'}
                    onClick={() => setClosed((c) => (c.delete(b.key) ? new Set(c) : new Set(c).add(b.key)))}
                  >
                    {open ? <BsChevronDown /> : <BsChevronRight />}
                  </button>
                  <span className="section-name">{b.name}</span>
                  <span className="muted small">{items.length}</span>
                </div>
                {open && (
                  <Droppable droppableId={`b:${b.key}`}>
                    {(p) => (
                      <div ref={p.innerRef} {...p.droppableProps} className="rows">
                        {items.map((t, i) => {
                          const proj = projects.find((x) => x.id === t.projectId);
                          return (
                            <Draggable key={t.id} draggableId={String(t.id)} index={i}>
                              {(d, snap) => (
                                <div ref={d.innerRef} {...d.draggableProps} className={`row-wrap ${snap.isDragging ? 'dragging' : ''}`}>
                                  {/* biome-ignore lint/a11y/useSemanticElements: row contains its own buttons */}
                                  <div
                                    className={`task-row my ${route.taskId === t.id ? 'selected' : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openTask(t.id)}
                                    onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && openTask(t.id)}
                                  >
                                    <span className="grip" {...d.dragHandleProps} aria-label="Ziehen zum Einplanen">
                                      <BsGripVertical />
                                    </span>
                                    <span className="col-title">
                                      <CheckCircle
                                        done={t.completed}
                                        onToggle={async () => {
                                          await run(api.updateTask(t, { completed: true }));
                                          load();
                                        }}
                                        label="Als erledigt markieren"
                                      />
                                      <span className="ellipsis">{t.title}</span>
                                      {t.parentId && <span className="muted small">Unteraufgabe</span>}
                                    </span>
                                    <span>
                                      <DueText t={t} />
                                    </span>
                                    <span>
                                      <PriorityPill p={t.priority} />
                                    </span>
                                    <span>
                                      {proj && (
                                        <span className="project-chip small ellipsis">
                                          <span className="project-dot" style={{ background: proj.color }} /> {proj.name}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {p.placeholder}
                        {!items.length && <div className="empty-row muted small">Keine Aufgaben</div>}
                      </div>
                    )}
                  </Droppable>
                )}
              </section>
            );
          })}
        </DragDropContext>
      </div>
    </div>
  );
}
