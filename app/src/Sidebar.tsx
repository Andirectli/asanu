import { useCallback, useEffect, useRef, useState } from 'react';
import { BsBell, BsCheckCircle, BsChevronDown, BsChevronLeft, BsChevronRight, BsGrid1X2Fill, BsHouse, BsList, BsPlus, BsSearch } from 'react-icons/bs';
import { errorText } from './api';
import { useApp, useServerEvents } from './ctx';
import { modKey } from './platform';
import { Avatar, COLORS, Popover, ProjectIcon } from './ui';

/** Top bar like Asana: menu, create, history, search in the middle. Doubles as the window drag area. */
export function Topbar() {
  const { route, go, create: openCreate } = useApp();
  const [q, setQ] = useState(route.page === 'search' ? route.q : '');
  const [collapsed, setCollapsed] = useState(() => document.documentElement.classList.contains('nav-collapsed'));
  const toggle = () => {
    const on = document.documentElement.classList.toggle('nav-collapsed');
    setCollapsed(on);
    try {
      localStorage.setItem('asanu-nav-collapsed', on ? '1' : '');
    } catch {
      /* ignore */
    }
  };
  const current = route.page === 'project' ? route.projectId : 0;
  return (
    <header className="topbar" data-tauri-drag-region>
      <button type="button" className="top-icon" aria-label="Navigation ein- oder ausblenden" aria-pressed={collapsed} onClick={toggle}>
        <BsList size={20} />
      </button>
      <button type="button" className="create-btn" onClick={() => openCreate(current || undefined)} title={`${modKey}⇧N`}>
        <span className="create-plus">
          <BsPlus size={18} />
        </span>
        Erstellen
      </button>
      <span className="top-nav" data-tauri-drag-region>
        <button type="button" className="top-icon" aria-label="Zurück" title={`Zurück (${modKey}[)`} onClick={() => history.back()}>
          <BsChevronLeft />
        </button>
        <button type="button" className="top-icon" aria-label="Vor" title={`Vor (${modKey}])`} onClick={() => history.forward()}>
          <BsChevronRight />
        </button>
      </span>
      <form
        className="top-search"
        onSubmit={(e) => {
          e.preventDefault();
          go({ page: 'search', q: q.trim() });
        }}
      >
        <BsSearch aria-hidden />
        <input id="global-search" type="search" placeholder={`Suchen (${modKey}K)`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Aufgaben suchen" />
      </form>
      <span className="top-right" data-tauri-drag-region />
    </header>
  );
}

/** Narrow icon rail: section switcher on top, account at the bottom. */
export function Rail() {
  const { user, online, api, logout, route } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className="rail" role="presentation">
      <a href="#/" className="rail-item selected" aria-label="Arbeit" aria-current="page" data-section={route.page}>
        <span className="rail-icon">
          <BsGrid1X2Fill />
        </span>
        Arbeit
      </a>
      <span className="spacer" />
      <div className="anchor rail-account">
        <button type="button" className="rail-avatar" aria-label={`Konto: ${user.name}`} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
          <Avatar user={user} size={28} />
          <span className={`conn ${online ? 'on' : 'off'}`} title={online ? `Verbunden mit ${api.server}` : 'Keine Live-Verbindung – verbinde neu …'} />
        </button>
        <Popover open={open} onClose={() => setOpen(false)}>
          <div className="popover-title">{user.name}</div>
          <div className="muted small account-line">{user.email}</div>
          <div className="muted small account-line">{online ? `Verbunden mit ${api.server}` : 'Getrennt – verbinde neu …'}</div>
          <button type="button" className="menu-line" onClick={logout}>
            Abmelden
          </button>
        </Popover>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { projects, route, api, run, reloadProjects, go, user, online } = useApp();
  const [unread, setUnread] = useState(0);
  const loadUnread = useCallback(() => {
    api.inbox().then((l) => setUnread(l.filter((n) => !n.read).length)).catch(() => {});
  }, [api]);
  useEffect(loadUnread, [loadUnread]);
  useServerEvents((e) => (e === 'reconnect' || (e.type === 'inbox' && e.id === user.id)) && loadUnread());
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<'manual' | 'alpha' | 'recent'>(() => (localStorage.getItem('asanu-nav-sort') as 'manual' | 'alpha' | 'recent') || 'manual');
  const [sortOpen, setSortOpen] = useState(false);
  const [recent, setRecent] = useState<Record<number, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('asanu-recent') || '{}');
    } catch {
      return {};
    }
  });
  const [server, setServer] = useState<{ version: string; updater: boolean } | null>(null);
  const [updating, setUpdating] = useState(false);
  const { toast } = useApp();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    api
      .health()
      .then((h) => setServer({ version: h.version, updater: !!h.updater }))
      .catch(() => {});
  }, [api, online]); // refetched after every reconnect, so the version updates itself after a server update

  // Starts the update, then watches /api/health: a restart with a new version = updated, no restart = already current.
  const checkUpdate = async () => {
    if (!server || updating) return;
    setUpdating(true);
    const before = server.version;
    try {
      await api.startUpdate();
      toast('Suche nach Update …', 'info');
      let sawDown = false;
      for (let i = 0; i < 30 && alive.current; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const h = await api.health();
          if (h.version !== before) {
            setServer({ version: h.version, updater: !!h.updater });
            toast(`Server aktualisiert: ${before} → ${h.version}`, 'info');
            return;
          }
          if (sawDown) {
            toast(`Server neu gestartet (${h.version}).`, 'info');
            return;
          }
        } catch {
          sawDown = true; // the container is being replaced
        }
      }
      toast(`Server ist aktuell (${before}).`, 'info');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setUpdating(false);
    }
  };

  const current0 = route.page === 'project' ? route.projectId : 0;
  useEffect(() => {
    if (!current0) return;
    setRecent((r) => {
      const next = { ...r, [current0]: Date.now() };
      try {
        localStorage.setItem('asanu-recent', JSON.stringify(next));
      } catch {
        /* private mode: sorting by recent just won't persist */
      }
      return next;
    });
  }, [current0]);
  const pick = (v: 'manual' | 'alpha' | 'recent') => {
    setSort(v);
    setSortOpen(false);
    try {
      localStorage.setItem('asanu-nav-sort', v);
    } catch {
      /* ignore */
    }
  };
  const sorted = (list: typeof projects) =>
    sort === 'alpha' ? [...list].sort((a, b) => a.name.localeCompare(b.name, 'de')) : sort === 'recent' ? [...list].sort((a, b) => (recent[b.id] ?? 0) - (recent[a.id] ?? 0)) : list;
  const active = sorted(projects.filter((p) => !p.archived));
  const favorites = projects.filter((p) => !p.archived && p.favorite);
  const archived = projects.filter((p) => p.archived);
  const current = route.page === 'project' ? route.projectId : 0;

  const create = async () => {
    const n = name.trim();
    if (!n) return setAdding(false);
    const color = COLORS[projects.length % COLORS.length].hex;
    const p = await run(api.createProject(n, color));
    if (!p) return; // keep the typed name so nothing is lost
    setName('');
    setAdding(false);
    await reloadProjects();
    go({ page: 'project', projectId: p.id, view: 'list' });
  };

  const item = (p: (typeof projects)[number]) => (
    <li key={p.id}>
      <a href={`#/project/${p.id}/list`} className={`nav-item ${p.id === current ? 'selected' : ''}`} aria-current={p.id === current ? 'page' : undefined}>
        <ProjectIcon icon={p.icon} color={p.color} size={18} />
        <span className="ellipsis">{p.name}</span>
      </a>
    </li>
  );

  return (
    <nav className="sidebar" aria-label="Navigation">
      <div className="panel-title">Arbeit</div>
      <div className="sidebar-scroll">
        <ul className="nav-list main-nav">
          <li>
            <a href="#/" className={`nav-item ${route.page === 'home' ? 'selected' : ''}`} aria-current={route.page === 'home' ? 'page' : undefined}>
              <BsHouse /> Home
            </a>
          </li>
          <li>
            <a href="#/inbox" className={`nav-item ${route.page === 'inbox' ? 'selected' : ''}`} aria-current={route.page === 'inbox' ? 'page' : undefined}>
              <BsBell /> Inbox {unread > 0 && <span className="badge" aria-label={`${unread} ungelesen`}>{unread}</span>}
            </a>
          </li>
          <li>
            <a href="#/my" className={`nav-item ${route.page === 'my' ? 'selected' : ''}`} aria-current={route.page === 'my' ? 'page' : undefined}>
              <BsCheckCircle /> Meine Aufgaben
            </a>
          </li>
        </ul>
        {favorites.length > 0 && (
          <>
            <div className="nav-heading">
              <span>Favoriten</span>
            </div>
            <ul className="nav-list">{favorites.map(item)}</ul>
          </>
        )}
        <div className="nav-heading anchor">
          <button type="button" className="nav-sort" aria-haspopup="menu" aria-expanded={sortOpen} onClick={() => setSortOpen((o) => !o)} title="Projekte sortieren">
            Projekte <span className="muted-dark">· {sort === 'manual' ? 'Manuell' : sort === 'alpha' ? 'A–Z' : 'Zuletzt'}</span>
          </button>
          <button type="button" className="icon-btn dark" aria-label="Neues Projekt" title="Neues Projekt" onClick={() => setAdding(true)}>
            <BsPlus size={18} />
          </button>
          <Popover open={sortOpen} onClose={() => setSortOpen(false)}>
            <div className="popover-title">Sortieren</div>
            {(
              [
                ['manual', 'Manuell'],
                ['alpha', 'Alphabetisch'],
                ['recent', 'Zuletzt geöffnet'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="menuitemradio" aria-checked={sort === k} className="menu-line" onClick={() => pick(k)}>
                {sort === k ? '✓' : ''} {l}
              </button>
            ))}
          </Popover>
        </div>
        <ul className="nav-list">
          {active.map(item)}
          {adding && (
            <li>
              <input
                className="nav-input"
                autoFocus
                placeholder="Projektname"
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                onBlur={create}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') create();
                  if (e.key === 'Escape') {
                    setName('');
                    setAdding(false);
                  }
                }}
                aria-label="Name des neuen Projekts"
              />
            </li>
          )}
        </ul>
        {!active.length && !adding && (
          <button type="button" className="nav-item muted-dark" onClick={() => setAdding(true)}>
            + Erstes Projekt anlegen
          </button>
        )}
        {archived.length > 0 && (
          <>
            <button type="button" className="nav-heading as-button" onClick={() => setShowArchived((s) => !s)} aria-expanded={showArchived}>
              {showArchived ? <BsChevronDown /> : <BsChevronRight />} Archiviert ({archived.length})
            </button>
            {showArchived && <ul className="nav-list archived">{archived.map(item)}</ul>}
          </>
        )}
      </div>

      {server && (
        <div className="sidebar-version">
          <span className="muted-dark">Server {server.version}</span>
          {server.updater && (
            <button type="button" className="btn link small dark-link" onClick={checkUpdate} disabled={updating}>
              {updating ? 'Prüfe …' : 'Nach Update suchen'}
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
