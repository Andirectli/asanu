import type { DropResult } from '@hello-pangea/dnd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BsArchive, BsBoxArrowUpLeft, BsStar, BsStarFill } from 'react-icons/bs';
import { ApiError, type Board, type Section, type Task } from './api';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { OverviewView } from './OverviewView';
import { TimelineView } from './TimelineView';
import { type ProjectTab, useApp, useServerEvents } from './ctx';
import { ListView } from './ListView';
import { isMod, modKey } from './platform';
import { ColorGrid, dueState, IconGrid, InlineEdit, Popover, PRIORITIES, ProjectIcon, projectStatusLabel } from './ui';

export type Filter = { status: 'open' | 'done' | 'all'; priority: string; label: number; due: '' | 'overdue' | 'today' | 'week' | 'none'; assignee: '' | 'me' | 'none' };
const defaultFilter: Filter = { status: 'open', priority: '', label: 0, due: '', assignee: '' };
export type Sort = 'manual' | 'due' | 'priority' | 'title';
const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, '': 3 };

export type BoardModel = {
  board: Board;
  bySection: Map<number, Task[]>;
  sorted: boolean; // drag & drop is only meaningful in manual order
  subCounts: Map<number, { total: number; done: number }>;
  onDragEnd: (r: DropResult) => void;
  addTask: (sectionId: number, title: string) => Promise<boolean>;
  toggle: (t: Task) => void;
  renameTask: (t: Task, title: string) => Promise<boolean>;
  addSection: (name: string) => Promise<boolean>;
  renameSection: (s: Section, name: string) => Promise<boolean>;
  deleteSection: (s: Section) => void;
};

function matches(t: Task, f: Filter, me: number): boolean {
  if (f.assignee === 'me' && t.assigneeId !== me) return false;
  if (f.assignee === 'none' && t.assigneeId) return false;
  if (f.status === 'open' && t.completed) return false;
  if (f.status === 'done' && !t.completed) return false;
  if (f.priority && t.priority !== f.priority) return false;
  if (f.label && !t.labelIds.includes(f.label)) return false;
  if (f.due === 'none') return !t.dueDate;
  if (f.due === 'overdue') return dueState(t) === 'overdue';
  if (f.due === 'today') return !!t.dueDate && t.dueDate <= new Date().toLocaleDateString('sv-SE');
  if (f.due === 'week') {
    const end = new Date(Date.now() + 7 * 86400000).toLocaleDateString('sv-SE');
    return !!t.dueDate && t.dueDate <= end;
  }
  return true;
}

export function ProjectView({ projectId, view }: { projectId: number; view: ProjectTab }) {
  const { api, run, toast, go, reloadProjects, labels, user, create } = useApp();
  const [sort, setSort] = useState<Sort>('manual');
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const [colorOpen, setColorOpen] = useState(false);
  const loadSeq = useRef(0);
  const timer = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current; // ignore out-of-order responses
    try {
      const b = await api.board(projectId);
      if (seq === loadSeq.current) {
        setBoard(b);
        setError('');
      }
    } catch (e) {
      if (seq !== loadSeq.current) return;
      if (e instanceof ApiError && e.status === 404) setError('Projekt nicht gefunden.');
      else setError('Projekt konnte nicht geladen werden. Verbindung wird wiederhergestellt …');
    }
  }, [api, projectId]);

  useEffect(() => {
    load();
  }, [load]);
  useServerEvents((e) => {
    // any task event: a blocker in another project changes this project's "waiting" markers
    if (e === 'reconnect' || e.projectId === projectId || e.type === 'label' || e.type === 'task') {
      clearTimeout(timer.current);
      timer.current = window.setTimeout(load, 120);
    }
  });

  // shortcuts: ⌘1 list, ⌘2 board, ⌘N new task
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isMod(e)) return;
      const tab = ({ '0': 'overview', '1': 'list', '2': 'board', '3': 'timeline', '4': 'calendar' } as Record<string, ProjectTab>)[e.key];
      if (tab) {
        e.preventDefault();
        go({ page: 'project', projectId, view: tab });
      }
      if (e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault();
        (document.querySelector('[data-add-task]') as HTMLElement | null)?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, projectId]);

  const model = useMemo<BoardModel | null>(() => {
    if (!board) return null;
    const bySection = new Map<number, Task[]>(board.sections.map((s) => [s.id, []]));
    const subCounts = new Map<number, { total: number; done: number }>();
    for (const t of board.tasks) {
      if (t.parentId) {
        const c = subCounts.get(t.parentId) ?? { total: 0, done: 0 };
        c.total++;
        if (t.completed) c.done++;
        subCounts.set(t.parentId, c);
      } else if (t.sectionId && matches(t, filter, user.id)) bySection.get(t.sectionId)?.push(t);
    }
    const cmp: Record<Sort, (a: Task, b: Task) => number> = {
      manual: (a, b) => a.position - b.position,
      due: (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.position - b.position,
      priority: (a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.position - b.position,
      title: (a, b) => a.title.localeCompare(b.title, 'de'),
    };
    for (const list of bySection.values()) list.sort(cmp[sort]);

    const onDragEnd = async ({ draggableId, source, destination }: DropResult) => {
      if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return;
      const id = Number(draggableId);
      const to = Number(destination.droppableId);
      // translate the index among visible (filtered) tasks into an index among all siblings
      const visible = (bySection.get(to) ?? []).filter((t) => t.id !== id);
      const all = board.tasks.filter((t) => t.sectionId === to && !t.parentId && t.id !== id).sort((a, b) => a.position - b.position);
      const anchor = visible[destination.index];
      const index = anchor ? all.findIndex((t) => t.id === anchor.id) : visible.length ? all.findIndex((t) => t.id === visible[visible.length - 1].id) + 1 : all.length;
      // optimistic: show the move now, roll back by refetching if the server refuses
      const before = all[index - 1]?.position;
      const after = all[index]?.position;
      const pos = before === undefined ? (after ?? 1024) - 1024 : after === undefined ? before + 1024 : (before + after) / 2;
      setBoard((b) => b && { ...b, tasks: b.tasks.map((t) => (t.id === id ? { ...t, sectionId: to, position: pos } : t)) });
      const res = await run(api.moveTask(id, to, index));
      if (!res) load();
    };

    return {
      board,
      bySection,
      sorted: sort !== 'manual',
      subCounts,
      onDragEnd,
      addTask: async (sectionId, title) => !!(await run(api.createTask({ projectId, sectionId, title }))) && (load(), true),
      toggle: async (t) => {
        const res = await run(api.updateTask(t, { completed: !t.completed }));
        if (res && res.completed) toast(`„${res.title}" erledigt`, 'info', { label: 'Rückgängig', run: () => run(api.updateTask(res, { completed: false })) });
        load();
      },
      renameTask: async (t, title) => {
        const ok = !!(await run(api.updateTask(t, { title })));
        load();
        return ok;
      },
      addSection: async (name) => !!(await run(api.createSection(projectId, name))) && (load(), true),
      renameSection: async (s, name) => {
        const ok = !!(await run(api.updateSection(s, name)));
        load();
        return ok;
      },
      deleteSection: async (s) => {
        if (await run(api.deleteSection(s))) load();
      },
    };
  }, [board, filter, sort, api, run, load, projectId, toast, user.id]);

  if (error && !board) return <div className="empty-state">{error}</div>;
  if (!board || !model) return <div className="empty-state muted">Lade …</div>;
  const p = board.project;

  const updateProject = async (patch: Parameters<typeof api.updateProject>[1]) => {
    const res = await run(api.updateProject(p, patch));
    await Promise.all([load(), reloadProjects()]);
    return !!res;
  };

  return (
    <div className="project">
      <header className="project-header" data-tauri-drag-region>
        <div className="project-title-row">
          <div className="anchor">
            <button type="button" className="icon-plain" aria-label="Farbe und Symbol ändern" onClick={() => setColorOpen((o) => !o)}>
              <ProjectIcon icon={p.icon} color={p.color} size={30} />
            </button>
            <Popover open={colorOpen} onClose={() => setColorOpen(false)}>
              <div className="popover-title">Farbe</div>
              <ColorGrid
                value={p.color}
                onPick={(color) => {
                  setColorOpen(false);
                  updateProject({ color });
                }}
              />
              <div className="popover-title" style={{ marginTop: 10 }}>
                Symbol
              </div>
              <IconGrid
                value={p.icon}
                onPick={(icon) => {
                  setColorOpen(false);
                  updateProject({ icon });
                }}
              />
            </Popover>
          </div>
          <InlineEdit className="project-name" value={p.name} ariaLabel="Projektname" onSave={(name) => updateProject({ name })} />
          <a href={`#/project/${p.id}/overview`} className={`project-status ${p.status ? `status-${p.status}` : ''}`} title="Status melden">
            <span className={`status-dot ${p.status ? `dot-${p.status}` : 'dot-none'}`} /> {p.status ? projectStatusLabel(p.status) : 'Status setzen'}
          </a>
          <button
            type="button"
            className={`icon-btn star-btn ${p.favorite ? 'on' : ''}`}
            aria-pressed={p.favorite}
            aria-label={p.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            title={p.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            onClick={async () => {
              await run(api.setFavorite(p.id, !p.favorite));
              await Promise.all([load(), reloadProjects()]);
            }}
          >
            {p.favorite ? <BsStarFill /> : <BsStar />}
          </button>
          {p.archived && <span className="pill archived-pill">Archiviert</span>}
          <span className="spacer" />
          <button type="button" className="btn small" onClick={() => updateProject({ archived: !p.archived })}>
            {p.archived ? <BsBoxArrowUpLeft /> : <BsArchive />} {p.archived ? 'Wiederherstellen' : 'Archivieren'}
          </button>
        </div>
        <div className="tabs" role="tablist">
          <a role="tab" aria-selected={view === 'overview'} className={view === 'overview' ? 'active' : ''} href={`#/project/${p.id}/overview`} title={`${modKey}0`}>
            Übersicht
          </a>
          <a role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} href={`#/project/${p.id}/list`} title={`${modKey}1`}>
            Liste
          </a>
          <a role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'active' : ''} href={`#/project/${p.id}/board`} title={`${modKey}2`}>
            Board
          </a>
          <a role="tab" aria-selected={view === 'timeline'} className={view === 'timeline' ? 'active' : ''} href={`#/project/${p.id}/timeline`} title={`${modKey}3`}>
            Zeitleiste
          </a>
          <a role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'active' : ''} href={`#/project/${p.id}/calendar`} title={`${modKey}4`}>
            Kalender
          </a>
        </div>
      </header>
      {view !== 'overview' && <div className="toolbar">
        <button type="button" className="btn primary small" data-add-task onClick={() => {
            const input = document.querySelector<HTMLInputElement>('[data-add-input]');
            if (input) input.focus();
            else create(p.id); // calendar view has no inline add row
          }} title={`${modKey}N`}>
          + Aufgabe hinzufügen
        </button>
        <span className="spacer" />
        <FilterSelect label="Status" value={filter.status} onChange={(v) => setFilter({ ...filter, status: v as Filter['status'] })} options={[['open', 'Offen'], ['done', 'Erledigt'], ['all', 'Alle']]} />
        <FilterSelect label="Priorität" value={filter.priority} onChange={(v) => setFilter({ ...filter, priority: v })} options={[['', 'Alle'], ...PRIORITIES.filter((x) => x.value).map((x) => [x.value, x.label] as [string, string])]} />
        <FilterSelect label="Label" value={String(filter.label)} onChange={(v) => setFilter({ ...filter, label: Number(v) })} options={[['0', 'Alle'], ...[...labels.values()].map((l) => [String(l.id), l.name] as [string, string])]} />
        <FilterSelect label="Verantwortlich" value={filter.assignee} onChange={(v) => setFilter({ ...filter, assignee: v as Filter['assignee'] })} options={[['', 'Alle'], ['me', 'Ich'], ['none', 'Niemand']]} />
        <FilterSelect label="Fällig" value={filter.due} onChange={(v) => setFilter({ ...filter, due: v as Filter['due'] })} options={[['', 'Egal'], ['overdue', 'Überfällig'], ['today', 'Bis heute'], ['week', 'Nächste 7 Tage'], ['none', 'Ohne Datum']]} />
        {(view === 'list' || view === 'board') && (
          <FilterSelect label="Sortieren" value={sort} onChange={(v) => setSort(v as Sort)} options={[['manual', 'Manuell'], ['due', 'Fälligkeit'], ['priority', 'Priorität'], ['title', 'Name']]} />
        )}
        {JSON.stringify(filter) !== JSON.stringify(defaultFilter) && (
          <button type="button" className="btn link small" onClick={() => setFilter(defaultFilter)}>
            Zurücksetzen
          </button>
        )}
      </div>}
      {error && <div className="banner">{error}</div>}
      {view === 'overview' ? <OverviewView m={model} onDescription={(description) => updateProject({ description })} /> : view === 'list' ? <ListView m={model} /> : view === 'board' ? <BoardView m={model} /> : view === 'timeline' ? <TimelineView m={model} /> : <CalendarView m={model} />}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className={`filter ${value && value !== '0' && !(label === 'Status' && value === 'open') && !(label === 'Sortieren' && value === 'manual') ? 'active' : ''}`}>
      {label}:
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
