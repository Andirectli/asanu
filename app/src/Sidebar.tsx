import { useState } from 'react';
import { BsArrowLeft, BsArrowRight, BsCheckCircle, BsChevronDown, BsChevronRight, BsHouse, BsPlus, BsSearch } from 'react-icons/bs';
import { useApp } from './ctx';
import { modKey } from './platform';
import { COLORS } from './ui';

export function Sidebar() {
  const { projects, route, go, api, run, reloadProjects, online, user, logout, create: openCreate } = useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState(route.page === 'search' ? route.q : '');

  const active = projects.filter((p) => !p.archived);
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
        <span className="project-dot" style={{ background: p.color }} />
        <span className="ellipsis">{p.name}</span>
      </a>
    </li>
  );

  return (
    <nav className="sidebar" aria-label="Navigation">
      <div className="sidebar-top" data-tauri-drag-region>
        <img src="/logo.svg" alt="" width={22} data-tauri-drag-region />
        <span className="brand" data-tauri-drag-region>
          Asanu
        </span>
        <span className="spacer" data-tauri-drag-region />
        <button type="button" className="icon-btn dark" aria-label="Zurück" title={`Zurück (${modKey}[)`} onClick={() => history.back()}>
          <BsArrowLeft />
        </button>
        <button type="button" className="icon-btn dark" aria-label="Vor" title={`Vor (${modKey}])`} onClick={() => history.forward()}>
          <BsArrowRight />
        </button>
      </div>
      <button type="button" className="create-btn" onClick={() => openCreate(current || undefined)} title={`${modKey}⇧N`}>
        <span className="create-plus">
          <BsPlus size={18} />
        </span>
        Erstellen
      </button>
      <form
        className="sidebar-search"
        onSubmit={(e) => {
          e.preventDefault();
          go({ page: 'search', q: q.trim() });
        }}
      >
        <BsSearch aria-hidden />
        <input id="global-search" type="search" placeholder={`Suchen (${modKey}K)`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Aufgaben suchen" />
      </form>

      <div className="sidebar-scroll">
        <ul className="nav-list main-nav">
          <li>
            <a href="#/" className={`nav-item ${route.page === 'home' ? 'selected' : ''}`} aria-current={route.page === 'home' ? 'page' : undefined}>
              <BsHouse /> Startseite
            </a>
          </li>
          <li>
            <a href="#/my" className={`nav-item ${route.page === 'my' ? 'selected' : ''}`} aria-current={route.page === 'my' ? 'page' : undefined}>
              <BsCheckCircle /> Meine Aufgaben
            </a>
          </li>
        </ul>
        <div className="nav-heading">
          <span>Projekte</span>
          <button type="button" className="icon-btn dark" aria-label="Neues Projekt" title="Neues Projekt" onClick={() => setAdding(true)}>
            <BsPlus size={18} />
          </button>
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

      <div className="sidebar-footer">
        <span className={`conn ${online ? 'on' : 'off'}`} title={online ? `Verbunden mit ${api.server}` : 'Keine Live-Verbindung – verbinde neu …'} />
        <span className="ellipsis" title={user.email}>
          {online ? user.name : 'Getrennt – verbinde neu …'}
        </span>
        <button type="button" className="btn dark small" onClick={logout}>
          Abmelden
        </button>
      </div>
    </nav>
  );
}
