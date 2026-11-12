import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Api, errorText, type Label, type Project, type ServerEvent, type User } from './api';
import { CreateDialog } from './CreateDialog';
import { HomeView } from './HomeView';
import { InboxView } from './InboxView';
import { MyTasksView } from './MyTasksView';
import { AppCtx, type Ctx, parseRoute, type Route, routeHash, type Toast } from './ctx';
import { isMod } from './platform';
import { ProjectView } from './ProjectView';
import { SearchView } from './SearchView';
import { Rail, Sidebar, Topbar } from './Sidebar';
import { TaskDetailPane } from './TaskDetail';

export function Workspace({ api, user, onLogout }: { api: Api; user: User; onLogout: (serverSide: boolean) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Map<number, Label>>(new Map());
  const [users, setUsers] = useState<Map<number, User>>(new Map([[user.id, user]]));
  const [creating, setCreating] = useState<{ projectId?: number; dueDate?: string } | null>(null);
  const [online, setOnline] = useState(false);
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const listeners = useRef(new Set<(e: ServerEvent | 'reconnect') => void>());

  useEffect(() => {
    const f = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const go = useCallback((r: Route) => {
    location.hash = routeHash(r);
  }, []);

  const toast = useCallback<Ctx['toast']>((text, kind = 'error', action) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);

  const run = useCallback<Ctx['run']>(
    async (p) => {
      try {
        return await p;
      } catch (e) {
        toast(errorText(e));
        return null;
      }
    },
    [toast],
  );

  const reloadProjects = useCallback(async () => {
    try {
      setProjects(await api.projects());
    } catch {
      /* status shown via connection indicator */
    }
  }, [api]);
  const reloadUsers = useCallback(async () => {
    try {
      setUsers(new Map((await api.users()).map((u) => [u.id, u])));
    } catch {
      /* ditto */
    }
  }, [api]);
  const reloadLabels = useCallback(async () => {
    try {
      setLabels(new Map((await api.labels()).map((l) => [l.id, l])));
    } catch {
      /* ditto */
    }
  }, [api]);

  // live updates
  const subscribe = useCallback((fn: (e: ServerEvent | 'reconnect') => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);
  useEffect(() => {
    api.onUnauthorized = () => onLogout(false);
    const conn = api.listen({
      onStatus: setOnline,
      onOpen: () => {
        reloadProjects();
        reloadLabels();
        reloadUsers();
        for (const l of listeners.current) l('reconnect');
      },
      onEvent: (e) => {
        // task changes alter the per-project counters too
        if (e.type === 'project' || e.type === 'task') reloadProjects();
        if (e.type === 'label') reloadLabels();
        for (const l of listeners.current) l(e);
      },
    });
    // Mac woke up / network came back: reconnect immediately, which also refetches
    const wake = () => document.visibilityState === 'visible' && conn.kick();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      conn.stop();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [api, onLogout, reloadLabels, reloadProjects, reloadUsers]);

  const openTask = useCallback((taskId: number | undefined) => go({ ...parseRoute(location.hash), taskId }), [go]);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isMod(e) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setCreating({});
      }
      if (isMod(e) && e.key === '[') history.back();
      if (isMod(e) && e.key === ']') history.forward();
      if (isMod(e) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
      if (e.key === 'Escape' && parseRoute(location.hash).taskId && !(e.target as HTMLElement).closest('input,textarea')) openTask(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openTask]);

  const ctx = useMemo<Ctx>(
    () => ({
      api,
      user,
      projects,
      labels,
      users,
      create: (projectId?: number, dueDate?: string) => setCreating({ projectId, dueDate }),
      online,
      route,
      go,
      openTask,
      reloadProjects,
      reloadLabels,
      toast,
      run,
      subscribe,
      logout: () => onLogout(true),
    }),
    [api, user, projects, labels, users, online, route, go, openTask, reloadProjects, reloadLabels, toast, run, subscribe, onLogout],
  );

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <Topbar />
        <div className="layout">
        <Rail />
        <Sidebar />
        <main className="main">
          {route.page === 'project' && <ProjectView key={route.projectId} projectId={route.projectId} view={route.view} />}
          {route.page === 'search' && <SearchView q={route.q} />}
          {route.page === 'home' && <HomeView />}
          {route.page === 'my' && <MyTasksView />}
          {route.page === 'inbox' && <InboxView />}
        </main>
        {route.taskId && <TaskDetailPane key={route.taskId} taskId={route.taskId} />}
        </div>
      </div>
      {creating && <CreateDialog projectId={creating.projectId} dueDate={creating.dueDate} onClose={() => setCreating(null)} />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  t.action?.run();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}
