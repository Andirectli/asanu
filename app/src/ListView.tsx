import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { useState } from 'react';
import { BsChatLeft, BsChevronDown, BsChevronRight, BsDiagram3, BsGripVertical, BsHourglassSplit, BsTrash } from 'react-icons/bs';
import type { Section, Task } from './api';
import { useApp } from './ctx';
import type { BoardModel } from './ProjectView';
import { Avatar, CheckCircle, DueText, InlineEdit, LabelPills, PriorityPill, StatusPill } from './ui';

export function ListView({ m }: { m: BoardModel }) {
  return (
    <div className="list-view">
      <div className="list-head">
        <span className="col-title">Aufgabenname</span>
        <span>Verantwortlich</span>
        <span className="col-due">Fällig</span>
        <span className="col-prio">Priorität</span>
        <span>Status</span>
        <span className="col-labels">Labels</span>
      </div>
      <DragDropContext onDragEnd={m.onDragEnd}>
        {m.board.sections.map((s, i) => (
          <SectionBlock key={s.id} s={s} tasks={m.bySection.get(s.id) ?? []} m={m} first={i === 0} />
        ))}
      </DragDropContext>
      <AddSection m={m} />
    </div>
  );
}

function SectionBlock({ s, tasks, m, first }: { s: Section; tasks: Task[]; m: BoardModel; first: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="section">
      <div className="section-head">
        <button type="button" className="icon-btn" aria-label={open ? 'Abschnitt einklappen' : 'Abschnitt ausklappen'} onClick={() => setOpen(!open)}>
          {open ? <BsChevronDown /> : <BsChevronRight />}
        </button>
        <InlineEdit className="section-name" value={s.name} ariaLabel="Abschnittsname" onSave={(n) => m.renameSection(s, n)} />
        <span className="muted small">{tasks.length}</span>
        {tasks.length === 0 && !m.board.tasks.some((t) => t.sectionId === s.id) && (
          <button type="button" className="icon-btn hover-only" aria-label="Leeren Abschnitt löschen" title="Leeren Abschnitt löschen" onClick={() => m.deleteSection(s)}>
            <BsTrash />
          </button>
        )}
      </div>
      {open && (
        <Droppable droppableId={String(s.id)}>
          {(p) => (
            <div ref={p.innerRef} {...p.droppableProps} className="rows">
              {tasks.map((t, i) => (
                <Draggable key={t.id} draggableId={String(t.id)} index={i} isDragDisabled={m.sorted}>
                  {(d, snap) => (
                    <div ref={d.innerRef} {...d.draggableProps} className={`row-wrap ${snap.isDragging ? 'dragging' : ''}`}>
                      <TaskRow t={t} m={m} handle={d.dragHandleProps} />
                    </div>
                  )}
                </Draggable>
              ))}
              {p.placeholder}
              <AddTaskRow onAdd={(title) => m.addTask(s.id, title)} first={first} />
            </div>
          )}
        </Droppable>
      )}
    </section>
  );
}

function TaskRow({ t, m, handle }: { t: Task; m: BoardModel; handle: React.HTMLAttributes<HTMLElement> | null | undefined }) {
  const { openTask, route, labels, users } = useApp();
  const sub = m.subCounts.get(t.id);
  const selected = route.taskId === t.id;
  return (
    // biome-ignore lint/a11y/useSemanticElements: row contains its own buttons
    <div
      className={`task-row ${selected ? 'selected' : ''} ${t.completed ? 'completed' : ''}`}
      onClick={() => openTask(t.id)}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && openTask(t.id)}
      role="button"
      tabIndex={0}
      aria-label={`Aufgabe ${t.title} öffnen`}
    >
      <span className="grip" {...handle} aria-label="Ziehen zum Verschieben">
        <BsGripVertical />
      </span>
      <span className="col-title">
        <CheckCircle done={t.completed} onToggle={() => m.toggle(t)} label={t.completed ? 'Als offen markieren' : 'Als erledigt markieren'} />
        {/* stopPropagation: editing the title must not open the detail pane */}
        <span className="title-edit" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <InlineEdit value={t.title} ariaLabel="Aufgabentitel" onSave={(v) => m.renameTask(t, v)} />
        </span>
        {sub && (
          <span className="meta" title="Unteraufgaben">
            {sub.done}/{sub.total} <BsDiagram3 />
          </span>
        )}
        {t.commentCount > 0 && (
          <span className="meta" title="Kommentare">
            {t.commentCount} <BsChatLeft />
          </span>
        )}
        {t.openBlockers > 0 && !t.completed && (
          <span className="meta waiting" title={`Wartet auf ${t.openBlockers} Aufgabe(n)`}>
            <BsHourglassSplit />
          </span>
        )}
      </span>
      <span>{t.assigneeId && <Avatar user={users.get(t.assigneeId)} size={22} />}</span>
      <span className="col-due">
        <DueText t={t} />
      </span>
      <span className="col-prio">
        <PriorityPill p={t.priority} />
      </span>
      <span>
        <StatusPill s={t.status} />
      </span>
      <span className="col-labels">
        <LabelPills ids={t.labelIds} labels={labels} />
      </span>
    </div>
  );
}

export function AddTaskRow({ onAdd, first, compact }: { onAdd: (title: string) => Promise<boolean>; first: boolean; compact?: boolean }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!v.trim() || busy) return;
    setBusy(true);
    if (await onAdd(v.trim())) setV(''); // on failure keep the text
    setBusy(false);
  };
  return (
    <div className={compact ? 'add-card' : 'add-row'}>
      <input
        {...(first ? { 'data-add-input': true } : {})}
        value={v}
        disabled={busy}
        placeholder="Aufgabe hinzufügen …"
        maxLength={500}
        aria-label="Neue Aufgabe"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            setV('');
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

export function AddSection({ m, column }: { m: BoardModel; column?: boolean }) {
  const [v, setV] = useState('');
  const [editing, setEditing] = useState(false);
  const submit = async () => {
    if (!v.trim()) return setEditing(false);
    if (await m.addSection(v.trim())) {
      setV('');
      setEditing(false);
    }
  };
  if (!editing)
    return (
      <button type="button" className={column ? 'add-column' : 'btn link add-section'} onClick={() => setEditing(true)}>
        + Abschnitt hinzufügen
      </button>
    );
  return (
    <input
      className={column ? 'add-column-input' : 'add-section-input'}
      autoFocus
      value={v}
      maxLength={200}
      placeholder="Name des Abschnitts"
      aria-label="Name des neuen Abschnitts"
      onChange={(e) => setV(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}
