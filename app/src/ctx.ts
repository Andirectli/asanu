import { createContext, useContext, useEffect, useRef } from 'react';
import type { Api, Label, Project, ServerEvent, User } from './api';

export type ProjectTab = 'list' | 'board' | 'calendar';
export type Route =
  | { page: 'project'; projectId: number; view: ProjectTab; taskId?: number }
  | { page: 'search'; q: string; taskId?: number }
  | { page: 'my'; taskId?: number }
  | { page: 'home'; taskId?: number };

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const qs = new URLSearchParams(query);
  const taskId = Number(qs.get('task')) || undefined;
  const m = path.match(/^\/project\/(\d+)(?:\/(list|board|calendar))?/);
  if (m) return { page: 'project', projectId: Number(m[1]), view: (m[2] as ProjectTab) ?? 'list', taskId };
  if (path.startsWith('/my')) return { page: 'my', taskId };
  if (path.startsWith('/search')) return { page: 'search', q: qs.get('q') ?? '', taskId };
  return { page: 'home', taskId };
}

export function routeHash(r: Route): string {
  const qs = new URLSearchParams();
  if (r.page === 'search' && r.q) qs.set('q', r.q);
  if (r.taskId) qs.set('task', String(r.taskId));
  const q = qs.toString() ? `?${qs}` : '';
  if (r.page === 'project') return `#/project/${r.projectId}/${r.view}${q}`;
  if (r.page === 'search') return `#/search${q}`;
  if (r.page === 'my') return `#/my${q}`;
  return `#/${q}`;
}

export type Toast = { id: number; text: string; kind: 'error' | 'info'; action?: { label: string; run: () => void } };

export type Ctx = {
  api: Api;
  user: User;
  projects: Project[];
  labels: Map<number, Label>;
  users: Map<number, User>;
  /** opens the quick-create dialog, optionally preselecting a project */
  create: (projectId?: number, dueDate?: string) => void;
  online: boolean;
  route: Route;
  go: (r: Route) => void;
  openTask: (id: number | undefined) => void;
  reloadProjects: () => Promise<void>;
  reloadLabels: () => Promise<void>;
  toast: (text: string, kind?: Toast['kind'], action?: Toast['action']) => void;
  /** Run a mutation; on failure show a toast and return null (never pretend it worked). */
  run: <T>(p: Promise<T>) => Promise<T | null>;
  subscribe: (fn: (e: ServerEvent | 'reconnect') => void) => () => void;
  logout: () => void;
};

export const AppCtx = createContext<Ctx>(null!);
export const useApp = () => useContext(AppCtx);

/** Calls fn for every server event and after each reconnect. */
export function useServerEvents(fn: (e: ServerEvent | 'reconnect') => void) {
  const { subscribe } = useApp();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}
