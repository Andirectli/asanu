import { useState } from 'react';
import { BsChevronLeft, BsChevronRight, BsPlus } from 'react-icons/bs';
import { useApp } from './ctx';
import type { BoardModel } from './ProjectView';
import { dueState, isoDay, today } from './ui';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Month calendar of the project's (filtered) tasks; a task spans start → due. */
export function CalendarView({ m }: { m: BoardModel }) {
  const { openTask, route, create } = useApp();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const tasks = [...m.bySection.values()].flat().filter((t) => t.dueDate);
  const first = new Date(month);
  first.setDate(1 - ((month.getDay() + 6) % 7)); // back to Monday
  const days = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  const t0 = today();
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const undated = [...m.bySection.values()].flat().filter((t) => !t.dueDate).length;

  return (
    <div className="calendar">
      <div className="calendar-bar">
        <button type="button" className="btn small" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
          Heute
        </button>
        <button type="button" className="icon-btn" aria-label="Voriger Monat" onClick={() => shift(-1)}>
          <BsChevronLeft />
        </button>
        <button type="button" className="icon-btn" aria-label="Nächster Monat" onClick={() => shift(1)}>
          <BsChevronRight />
        </button>
        <strong>{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</strong>
        <span className="spacer" />
        {undated > 0 && <span className="muted small">{undated} ohne Datum (in Liste/Board)</span>}
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const key = isoDay(d);
          const items = tasks.filter((t) => (t.startDate || t.dueDate) <= key && key <= t.dueDate);
          return (
            <div key={key} className={`cal-day ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${key === t0 ? 'today' : ''}`}>
              <div className="cal-day-head">
                <span className="cal-num">{d.getDate()}</span>
                <button type="button" className="icon-btn hover-only" aria-label={`Aufgabe am ${d.toLocaleDateString('de-DE')} erstellen`} onClick={() => create(m.board.project.id, key)}>
                  <BsPlus />
                </button>
              </div>
              {items.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`cal-task ${t.completed ? 'completed' : ''} ${dueState(t)} ${route.taskId === t.id ? 'selected' : ''}`}
                  style={{ borderLeftColor: m.board.project.color }}
                  onClick={() => openTask(t.id)}
                  title={t.title}
                >
                  {t.title}
                </button>
              ))}
              {items.length > 4 && <span className="muted small">+{items.length - 4} weitere</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
