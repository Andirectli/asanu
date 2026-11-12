import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { BsChatLeft, BsDiagram3, BsHourglassSplit, BsTrash } from 'react-icons/bs';
import { useApp } from './ctx';
import { AddSection, AddTaskRow } from './ListView';
import type { BoardModel } from './ProjectView';
import { Avatar, CheckCircle, DueText, InlineEdit, LabelPills, PriorityPill, StatusPill } from './ui';

export function BoardView({ m }: { m: BoardModel }) {
  const { openTask, route, labels, users } = useApp();
  return (
    <div className="board-view">
      <DragDropContext onDragEnd={m.onDragEnd}>
        {m.board.sections.map((s, i) => {
          const tasks = m.bySection.get(s.id) ?? [];
          return (
            <div key={s.id} className="column">
              <div className="column-head">
                <InlineEdit className="section-name" value={s.name} ariaLabel="Spaltenname" onSave={(n) => m.renameSection(s, n)} />
                <span className="muted small">{tasks.length}</span>
                {!m.board.tasks.some((t) => t.sectionId === s.id) && (
                  <button type="button" className="icon-btn hover-only" aria-label="Leere Spalte löschen" title="Leere Spalte löschen" onClick={() => m.deleteSection(s)}>
                    <BsTrash />
                  </button>
                )}
              </div>
              <Droppable droppableId={String(s.id)}>
                {(p, snap) => (
                  <div ref={p.innerRef} {...p.droppableProps} className={`cards ${snap.isDraggingOver ? 'over' : ''}`}>
                    {tasks.map((t, idx) => {
                      const sub = m.subCounts.get(t.id);
                      return (
                        <Draggable key={t.id} draggableId={String(t.id)} index={idx} isDragDisabled={m.sorted}>
                          {(d, ds) => (
                            <div
                              ref={d.innerRef}
                              {...d.draggableProps}
                              {...d.dragHandleProps}
                              className={`card ${ds.isDragging ? 'dragging' : ''} ${route.taskId === t.id ? 'selected' : ''} ${t.completed ? 'completed' : ''}`}
                              onClick={() => openTask(t.id)}
                              onKeyDown={(e) => e.key === 'Enter' && openTask(t.id)}
                              aria-label={`Aufgabe ${t.title} öffnen`}
                            >
                              <div className="card-title">
                                <CheckCircle done={t.completed} onToggle={() => m.toggle(t)} label={t.completed ? 'Als offen markieren' : 'Als erledigt markieren'} />
                                <span>{t.title}</span>
                              </div>
                              {(t.priority || t.status || t.labelIds.length > 0) && (
                                <div className="card-pills">
                                  <PriorityPill p={t.priority} />
                                  <StatusPill s={t.status} />
                                  <LabelPills ids={t.labelIds} labels={labels} />
                                </div>
                              )}
                              <div className="card-meta">
                                {t.assigneeId && <Avatar user={users.get(t.assigneeId)} size={22} />}
                                <DueText t={t} />
                                <span className="spacer" />
                                {t.openBlockers > 0 && !t.completed && (
                                  <span className="meta waiting" title={`Wartet auf ${t.openBlockers} Aufgabe(n)`}>
                                    <BsHourglassSplit />
                                  </span>
                                )}
                                {sub && (
                                  <span className="meta">
                                    {sub.done}/{sub.total} <BsDiagram3 />
                                  </span>
                                )}
                                {t.commentCount > 0 && (
                                  <span className="meta">
                                    {t.commentCount} <BsChatLeft />
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {p.placeholder}
                    <AddTaskRow compact first={i === 0} onAdd={(title) => m.addTask(s.id, title)} />
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </DragDropContext>
      <div className="column add">
        <AddSection m={m} column />
      </div>
    </div>
  );
}
