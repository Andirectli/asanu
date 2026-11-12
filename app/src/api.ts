export type User = { id: number; email: string; name: string };
export type Project = { id: number; name: string; color: string; archived: boolean; position: number; version: number; description: string; icon: string; favorite: boolean; status: ProjectStatus; createdAt: string; openTasks: number; dueSoon: number };
export type ProjectUpdate = { id: number; projectId: number; userId: number; userName: string; status: ProjectStatus; body: string; createdAt: string };
export type Section = { id: number; projectId: number; name: string; position: number; version: number };
export type Priority = '' | 'low' | 'medium' | 'high';
export type Status = '' | 'on_track' | 'at_risk' | 'off_track';
export type ProjectStatus = Status | 'on_hold' | 'complete' | 'dropped';
export type MySection = '' | 'today' | 'next_week' | 'later';
export type Task = {
  id: number;
  projectId: number;
  sectionId: number | null;
  parentId: number | null;
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  priority: Priority;
  status: Status;
  assigneeId: number | null;
  mySection: MySection;
  completed: boolean;
  completedAt: string;
  position: number;
  version: number;
  updatedAt: string;
  labelIds: number[];
  blockedBy: number[];
  openBlockers: number;
  commentCount: number;
};
export type Label = { id: number; name: string; color: string };
export type Comment = { id: number; taskId: number; userId: number; userName: string; body: string; createdAt: string };
export type Board = { project: Project; sections: Section[]; tasks: Task[] };
export type TaskDetail = { task: Task; subtasks: Task[]; comments: Comment[]; parent: Task | null; blockedBy: Task[]; blocking: Task[] };
export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'startDate' | 'dueDate' | 'priority' | 'status' | 'mySection' | 'completed' | 'labelIds' | 'blockedBy'>> & {
  assigneeId?: number; // 0 clears
};
export type ServerEvent = { type: 'project' | 'section' | 'task' | 'label' | 'comment'; id: number; projectId?: number; taskId?: number };

/** status 0 = network error (server unreachable). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public current?: unknown,
  ) {
    super(message);
  }
}

const messages: Record<number, string> = {
  0: 'Server nicht erreichbar. Änderung wurde nicht gespeichert.',
  401: 'Sitzung abgelaufen. Bitte neu anmelden.',
  404: 'Nicht mehr vorhanden – wurde vermutlich auf einem anderen Gerät gelöscht.',
  409: 'Auf einem anderen Gerät geändert.',
  429: 'Zu viele Fehlversuche. Bitte 15 Minuten warten.',
};

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.status === 400 ? `Ungültige Eingabe: ${e.message}` : (messages[e.status] ?? `Serverfehler (${e.status}): ${e.message}`);
  return String(e);
}

export function normalizeServer(input: string): string {
  let s = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return new URL(s).origin;
}

export class Api {
  onUnauthorized: () => void = () => {};
  constructor(
    public server: string,
    public token: string | null = null,
  ) {}

  async req<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.server + path, {
        method,
        signal: signal ?? AbortSignal.timeout(15000),
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ApiError(0, String(e));
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && this.token) this.onUnauthorized();
      throw new ApiError(res.status, data.error ?? res.statusText, data.current);
    }
    return data as T;
  }

  health = () => this.req<{ ok: boolean; app: string; version: string; updater?: boolean }>('GET', '/api/health', undefined, AbortSignal.timeout(5000));
  startUpdate = () => this.req<{ started: boolean; version: string }>('POST', '/api/update');
  login = (email: string, password: string, device: string) => this.req<{ token: string; user: User }>('POST', '/api/login', { email, password, device });
  logout = () => this.req<void>('POST', '/api/logout');
  me = () => this.req<User>('GET', '/api/me');
  projects = () => this.req<Project[]>('GET', '/api/projects');
  createProject = (name: string, color: string) => this.req<Project>('POST', '/api/projects', { name, color });
  updateProject = (p: Project, patch: Partial<Pick<Project, 'name' | 'color' | 'archived' | 'description' | 'icon'>>) =>
    this.req<Project>('PATCH', `/api/projects/${p.id}`, { version: p.version, ...patch });
  setFavorite = (id: number, on: boolean) => this.req<void>(on ? 'PUT' : 'DELETE', `/api/projects/${id}/favorite`);
  updates = (id: number) => this.req<ProjectUpdate[]>('GET', `/api/projects/${id}/updates`);
  addUpdate = (id: number, status: ProjectStatus, body: string) => this.req<ProjectUpdate>('POST', `/api/projects/${id}/updates`, { status, body });
  board = (id: number, signal?: AbortSignal) => this.req<Board>('GET', `/api/projects/${id}/board`, undefined, signal);
  createSection = (projectId: number, name: string) => this.req<Section>('POST', `/api/projects/${projectId}/sections`, { name });
  updateSection = (s: Section, name: string) => this.req<Section>('PATCH', `/api/sections/${s.id}`, { version: s.version, name });
  deleteSection = (s: Section) => this.req<void>('DELETE', `/api/sections/${s.id}`);
  createTask = (body: { projectId?: number; sectionId?: number; parentId?: number; title: string; index?: number }) => this.req<Task>('POST', '/api/tasks', body);
  task = (id: number) => this.req<TaskDetail>('GET', `/api/tasks/${id}`);
  updateTask = (t: Pick<Task, 'id' | 'version'>, patch: TaskPatch) =>
    this.req<Task>('PATCH', `/api/tasks/${t.id}`, { version: t.version, ...patch });
  moveTask = (id: number, sectionId: number, index: number) => this.req<Task>('POST', `/api/tasks/${id}/move`, { sectionId, index });
  deleteTask = (id: number) => this.req<void>('DELETE', `/api/tasks/${id}`);
  addComment = (taskId: number, body: string) => this.req<Comment>('POST', `/api/tasks/${taskId}/comments`, { body });
  users = () => this.req<User[]>('GET', '/api/users');
  myTasks = (completed = false) => this.req<Task[]>('GET', `/api/my-tasks${completed ? '?completed=1' : ''}`);
  labels = () => this.req<Label[]>('GET', '/api/labels');
  createLabel = (name: string, color: string) => this.req<Label>('POST', '/api/labels', { name, color });
  search = (q: string, completed: boolean, signal?: AbortSignal) =>
    this.req<Task[]>('GET', `/api/search?q=${encodeURIComponent(q)}${completed ? '&completed=1' : ''}`, undefined, signal);

  /**
   * Streams server events (SSE over fetch, so the token stays in a header and never in a URL).
   * Reconnects with backoff; onOpen fires on every (re)connect so callers refetch and never keep stale data.
   */
  listen(handlers: { onEvent: (e: ServerEvent) => void; onOpen: () => void; onStatus: (online: boolean) => void }): { stop: () => void; kick: () => void } {
    let stopped = false;
    let ctrl: AbortController | null = null;
    let delay = 1000;
    let wake: (() => void) | null = null;

    const run = async () => {
      while (!stopped) {
        ctrl = new AbortController();
        let watchdog = 0;
        const arm = () => {
          clearTimeout(watchdog);
          // server pings every 25 s; silence means a dead socket (e.g. after Mac sleep)
          watchdog = window.setTimeout(() => ctrl?.abort(), 60000);
        };
        try {
          const res = await fetch(`${this.server}/api/events`, { headers: { Authorization: `Bearer ${this.token}` }, signal: ctrl.signal });
          if (res.status === 401) {
            this.onUnauthorized();
            return;
          }
          if (!res.ok || !res.body) throw new Error(String(res.status));
          arm();
          handlers.onStatus(true);
          handlers.onOpen();
          delay = 1000;
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            arm();
            buf += value;
            let i: number;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const chunk = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const data = chunk.split('\n').find((l) => l.startsWith('data: '));
              if (data && !chunk.startsWith('event: hello')) handlers.onEvent(JSON.parse(data.slice(6)));
            }
          }
        } catch {
          /* reconnect below */
        } finally {
          clearTimeout(watchdog);
        }
        if (stopped) return;
        handlers.onStatus(false);
        await new Promise<void>((r) => {
          wake = r;
          setTimeout(r, delay);
        });
        wake = null;
        delay = Math.min(delay * 2, 10000); // LAN server: retry at least every 10 s
      }
    };
    run();
    return {
      stop: () => {
        stopped = true;
        ctrl?.abort();
        wake?.();
      },
      // after wake-from-sleep / network change: reconnect now instead of waiting for backoff
      kick: () => {
        delay = 1000;
        if (wake) wake();
        else ctrl?.abort();
      },
    };
  }
}
