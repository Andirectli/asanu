import { Fragment } from 'react';
import { FieldInput } from './FieldsMenu';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BsArrowUp, BsArrowsAngleContract, BsArrowsAngleExpand, BsCheck, BsChevronRight, BsHourglassSplit, BsLink45Deg, BsTrash, BsX } from 'react-icons/bs';
import { ApiError, errorText, type Task, type TaskDetail, type TaskPatch } from './api';
import { useApp, useServerEvents } from './ctx';
import { isMod, modKey } from './platform';
import { DependencyPicker } from './DependencyPicker';
import { Avatar, CheckCircle, COLORS, DueText, HoverSelect, Popover, PRIORITIES, PriorityPill, STATUSES, StatusPill } from './ui';

type Patch = TaskPatch;
type Conflict = { patch: Patch; current: Task };

export function TaskDetailPane({ taskId }: { taskId: number }) {
  const { api, openTask, projects, labels, users, user, run, toast, reloadLabels } = useApp();
  const [wide, setWide] = useState(false);
  const [d, setD] = useState<TaskDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState<string | null>(null); // null = not being edited
  const [desc, setDesc] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [labelOpen, setLabelOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [comment, setComment] = useState('');
  const [subtask, setSubtask] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const s = ++seq.current;
    try {
      const res = await api.task(taskId);
      if (s === seq.current) setD(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
    }
  }, [api, taskId]);
  useEffect(() => {
    load();
  }, [load]);
  useServerEvents((e) => {
    if (e === 'reconnect' || (e.type === 'project' && e.id === d?.task.projectId) || e.id === taskId || e.taskId === taskId || (e.type === 'task' && [...(d?.subtasks ?? []), ...(d?.blockedBy ?? []), ...(d?.blocking ?? [])].some((s) => s.id === e.id))) load();
  });

  const save = useCallback(
    async (patch: Patch, base?: Task): Promise<boolean> => {
      const t = base ?? d?.task;
      if (!t) return false;
      setSaveState('saving');
      try {
        const updated = await api.updateTask(t, patch);
        setD((x) => x && { ...x, task: updated });
        setSaveState('saved');
        setConflict(null);
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.current) {
          setConflict({ patch, current: e.current as Task });
          setSaveState('error');
          return false;
        }
        setSaveState('error');
        toast(errorText(e));
        return false;
      }
    },
    [api, d, toast],
  );

  // ⌘↩ toggles completion (outside the comment box)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isMod(e) && e.key === 'Enter' && d && !(e.target as HTMLElement).closest('.comment-box')) {
        e.preventDefault();
        save({ completed: !d.task.completed });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d, save]);

  if (missing)
    return (
      <aside className="detail">
        <div className="detail-bar">
          <span className="spacer" />
          <CloseBtn onClick={() => openTask(undefined)} />
        </div>
        <p className="pad muted">Diese Aufgabe existiert nicht mehr.</p>
      </aside>
    );
  if (!d)
    return (
      <aside className="detail">
        <p className="pad muted">Lade …</p>
      </aside>
    );

  const t = d.task;
  const project = projects.find((p) => p.id === t.projectId);

  const saveTitle = async () => {
    if (title === null) return;
    const v = title.trim();
    if (!v || v === t.title) return setTitle(null);
    if (await save({ title: v })) setTitle(null);
  };
  const saveDesc = async () => {
    if (desc === null || desc === t.description) return setDesc(null);
    if (await save({ description: desc })) setDesc(null);
  };

  const toggleLabel = (id: number) => save({ labelIds: t.labelIds.includes(id) ? t.labelIds.filter((x) => x !== id) : [...t.labelIds, id] });
  const createLabel = async () => {
    const name = newLabel.trim();
    if (!name) return;
    const l = await run(api.createLabel(name, COLORS[(labels.size * 5) % COLORS.length].hex));
    if (!l) return;
    setNewLabel('');
    await reloadLabels();
    if (!t.labelIds.includes(l.id)) save({ labelIds: [...t.labelIds, l.id] });
  };

  const addSubtask = async () => {
    const v = subtask.trim();
    if (!v) return;
    if (await run(api.createTask({ parentId: t.id, title: v }))) {
      setSubtask('');
      load();
    }
  };
  const toggleSub = async (s: Task) => {
    await run(api.updateTask(s, { completed: !s.completed }));
    load();
  };
  const addComment = async () => {
    const v = comment.trim();
    if (!v) return;
    if (await run(api.addComment(t.id, v))) {
      setComment('');
      load();
    }
  };
  const remove = async () => {
    // two-step confirm: native confirm() is not reliable inside the Tauri webview
    if (!confirmDelete) return setConfirmDelete(true);
    if ((await run(api.deleteTask(t.id))) !== null) openTask(t.parentId ?? undefined);
  };

  return (
    <aside className={`detail ${wide ? 'wide' : ''}`} aria-label="Aufgabendetails">
      <div className="detail-bar">
        <button type="button" className={`btn small ${t.completed ? 'success' : ''}`} onClick={() => save({ completed: !t.completed })} title={`${modKey}↩`}>
          <BsCheck /> {t.completed ? 'Erledigt' : 'Als erledigt markieren'}
        </button>
        <span className="save-state muted small" role="status">
          {saveState === 'saving' ? 'Speichert …' : saveState === 'saved' ? 'Gespeichert' : saveState === 'error' ? 'Nicht gespeichert' : ''}
        </span>
        <span className="spacer" />
        {confirmDelete ? (
          <>
            <button type="button" className="btn small danger" onClick={remove} autoFocus>
              Endgültig löschen
            </button>
            <button type="button" className="btn small" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </button>
          </>
        ) : (
          <button type="button" className="icon-btn" aria-label="Aufgabe löschen" title="Aufgabe löschen" onClick={remove}>
            <BsTrash />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label="Aufgabenlink kopieren"
          title="Aufgabenlink kopieren"
          onClick={() => navigator.clipboard.writeText(location.href).then(() => toast('Link kopiert', 'info'), () => toast('Kopieren nicht möglich.'))}
        >
          <BsLink45Deg size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label={wide ? 'Verkleinern' : 'Vergrößern'} title={wide ? 'Verkleinern' : 'Vergrößern'} onClick={() => setWide(!wide)}>
          {wide ? <BsArrowsAngleContract /> : <BsArrowsAngleExpand />}
        </button>
        <CloseBtn onClick={() => openTask(undefined)} />
      </div>

      {t.openBlockers > 0 && !t.completed && (
        <div className="banner waiting-banner">
          <BsHourglassSplit /> Wartet auf {t.openBlockers === 1 ? 'eine offene Aufgabe' : `${t.openBlockers} offene Aufgaben`}.
        </div>
      )}

      {conflict && (
        <div className="banner conflict" role="alert">
          <strong>Auf einem anderen Gerät geändert.</strong> Deine Eingabe ist noch nicht gespeichert.
          <div className="row gap">
            <button type="button" className="btn small primary" onClick={() => save(conflict.patch, conflict.current)}>
              Meine Änderung übernehmen
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setConflict(null);
                setTitle(null);
                setDesc(null);
                setSaveState('');
                load();
              }}
            >
              Verwerfen
            </button>
          </div>
        </div>
      )}

      <div className="detail-body">
        {d.parent && (
          <button type="button" className="btn link small crumb" onClick={() => openTask(d.parent?.id)}>
            {d.parent.title} <BsChevronRight />
          </button>
        )}
        <textarea
          className="detail-title"
          rows={1}
          value={title ?? t.title}
          maxLength={500}
          aria-label="Titel"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') setTitle(null);
          }}
        />

        <dl className="fields">
          <dt>Projekt</dt>
          <dd>
            {project && (
              <a href={`#/project/${project.id}/list?task=${t.id}`} className="project-chip">
                <span className="project-dot" style={{ background: project.color }} /> {project.name}
              </a>
            )}
          </dd>
          <dt>Verantwortlich</dt>
          <dd>
            <HoverSelect
              label="Verantwortlich"
              value={t.assigneeId ?? 0}
              onChange={(v) => save({ assigneeId: Number(v) })}
              options={[{ value: 0, label: 'Niemand' }, ...[...users.values()].map((u) => ({ value: u.id, label: u.id === user.id ? `${u.name} (ich)` : u.name }))]}
            >
              {t.assigneeId ? (
                <>
                  <Avatar user={users.get(t.assigneeId)} size={24} />
                  <span>{users.get(t.assigneeId)?.name}</span>
                </>
              ) : (
                <span className="muted">Niemand</span>
              )}
            </HoverSelect>
            {t.assigneeId !== user.id && (
              <button type="button" className="btn link small" onClick={() => save({ assigneeId: user.id })}>
                Mir zuweisen
              </button>
            )}
          </dd>
          <dt>Datum</dt>
          <dd className="date-row">
            <input id="start" type="date" aria-label="Startdatum" value={t.startDate} max={t.dueDate || undefined} onChange={(e) => save({ startDate: e.target.value })} />
            <span className="muted">–</span>
            <input id="due" type="date" aria-label="Fälligkeitsdatum" value={t.dueDate} min={t.startDate || undefined} onChange={(e) => save({ dueDate: e.target.value })} />
            {(t.dueDate || t.startDate) && (
              <button type="button" className="icon-btn" aria-label="Datum entfernen" onClick={() => save({ dueDate: '', startDate: '' })}>
                <BsX />
              </button>
            )}
          </dd>
          <dt>Priorität</dt>
          <dd>
            <HoverSelect label="Priorität" value={t.priority} onChange={(v) => save({ priority: v as Task['priority'] })} options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}>
              {t.priority ? <PriorityPill p={t.priority} /> : <span className="muted">—</span>}
            </HoverSelect>
          </dd>
          <dt>Status</dt>
          <dd>
            <HoverSelect label="Status" value={t.status} onChange={(v) => save({ status: v as Task['status'] })} options={STATUSES.map((x) => ({ value: x.value, label: x.label }))}>
              {t.status ? <StatusPill s={t.status} /> : <span className="muted">—</span>}
            </HoverSelect>
          </dd>
          <dt>Art</dt>
          <dd>
            <HoverSelect
              label="Art der Aufgabe"
              value={t.kind}
              onChange={(v) => save({ kind: v as Task['kind'] })}
              options={[
                { value: 'task', label: 'Aufgabe' },
                { value: 'milestone', label: 'Meilenstein' },
              ]}
            >
              <span>{t.kind === 'milestone' ? '◆ Meilenstein' : 'Aufgabe'}</span>
            </HoverSelect>
          </dd>
          {(d.fields ?? []).map((f) => (
            <Fragment key={f.id}>
              <dt>{f.name}</dt>
              <dd>
                <FieldInput
                  f={f}
                  value={d.fieldValues?.[f.id] ?? ''}
                  onSave={async (v) => {
                    await run(api.setFieldValue(t.id, f.id, v));
                    load();
                  }}
                />
              </dd>
            </Fragment>
          ))}
          <dt>Labels</dt>
          <dd className="row gap wrap anchor">
            {t.labelIds.map((id) => {
              const l = labels.get(id);
              return l ? (
                <span key={id} className="pill" style={{ background: `${l.color}33` }}>
                  {l.name}
                  <button type="button" className="pill-x" aria-label={`Label ${l.name} entfernen`} onClick={() => toggleLabel(id)}>
                    <BsX />
                  </button>
                </span>
              ) : null;
            })}
            <button type="button" className="btn link small" onClick={() => setLabelOpen(true)}>
              + Label
            </button>
            <Popover open={labelOpen} onClose={() => setLabelOpen(false)}>
              <div className="popover-title">Labels</div>
              {[...labels.values()].map((l) => (
                <label key={l.id} className="check-line">
                  <input type="checkbox" checked={t.labelIds.includes(l.id)} onChange={() => toggleLabel(l.id)} />
                  <span className="project-dot" style={{ background: l.color }} /> {l.name}
                </label>
              ))}
              <input
                className="popover-input"
                placeholder="Neues Label + Enter"
                value={newLabel}
                maxLength={50}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createLabel()}
                aria-label="Neues Label"
              />
            </Popover>
          </dd>
        </dl>

        <h3>Abhängigkeiten</h3>
        <div className="deps">
          <div className="muted small">Wartet auf</div>
          <ul className="subtasks">
            {d.blockedBy.map((b) => (
              <li key={b.id} className={b.completed ? 'completed' : ''}>
                <CheckCircle done={b.completed} onToggle={() => openTask(b.id)} label={`${b.title} öffnen`} />
                <button type="button" className="link-text" onClick={() => openTask(b.id)}>
                  {b.title}
                </button>
                <button type="button" className="icon-btn" aria-label={`Abhängigkeit ${b.title} entfernen`} onClick={() => save({ blockedBy: t.blockedBy.filter((x) => x !== b.id) })}>
                  <BsX />
                </button>
              </li>
            ))}
          </ul>
          <DependencyPicker exclude={[t.id, ...t.blockedBy]} onPick={(id) => save({ blockedBy: [...t.blockedBy, id] })} />
          {d.blocking.length > 0 && (
            <>
              <div className="muted small dep-gap">Blockiert</div>
              <ul className="subtasks">
                {d.blocking.map((b) => (
                  <li key={b.id} className={b.completed ? 'completed' : ''}>
                    <span className="meta waiting">
                      <BsHourglassSplit />
                    </span>
                    <button type="button" className="link-text" onClick={() => openTask(b.id)}>
                      {b.title}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <h3>Beschreibung</h3>
        <textarea
          className="description"
          placeholder="Worum geht es bei dieser Aufgabe?"
          value={desc ?? t.description}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={saveDesc}
          aria-label="Beschreibung"
        />

        {!t.parentId && (
          <>
            <h3>Unteraufgaben</h3>
            <ul className="subtasks">
              {d.subtasks.map((s) => (
                <li key={s.id} className={s.completed ? 'completed' : ''}>
                  <CheckCircle done={s.completed} onToggle={() => toggleSub(s)} label={s.completed ? 'Als offen markieren' : 'Als erledigt markieren'} />
                  <button type="button" className="link-text" onClick={() => openTask(s.id)}>
                    {s.title}
                  </button>
                  <DueText t={s} />
                </li>
              ))}
            </ul>
            <input
              className="add-subtask"
              placeholder="+ Unteraufgabe hinzufügen"
              value={subtask}
              maxLength={500}
              onChange={(e) => setSubtask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
              aria-label="Neue Unteraufgabe"
            />
          </>
        )}

        <h3>Kommentare</h3>
        <ul className="comments">
          {d.comments.map((c) => (
            <li key={c.id}>
              <span className="avatar" aria-hidden>
                {c.userName.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <div className="small">
                  <strong>{c.userName}</strong> <span className="muted">{new Date(c.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                <p className="comment-body">{c.body}</p>
              </div>
            </li>
          ))}
          {!d.comments.length && <li className="muted small">Noch keine Kommentare.</li>}
        </ul>
      </div>
      <div className="comment-box">
        <textarea
          placeholder="Kommentar schreiben oder @erwähnen …"
          value={comment}
          maxLength={10000}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (isMod(e) && e.key === 'Enter') {
              e.preventDefault();
              addComment();
            }
          }}
          aria-label="Kommentar"
        />
        <button type="button" className="send-btn" aria-label="Kommentar senden" title={`Senden (${modKey}↩)`} disabled={!comment.trim()} onClick={addComment}>
          <BsArrowUp />
        </button>
      </div>
    </aside>
  );
}

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="icon-btn" aria-label="Details schließen (Esc)" title="Schließen (Esc)" onClick={onClick}>
      <BsX size={20} />
    </button>
  );
}
