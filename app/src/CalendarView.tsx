import { useState } from 'react';
import { BsChevronLeft, BsChevronRight, BsPlus } from 'react-icons/bs';
import { useApp } from './ctx';
import type { BoardModel } from './ProjectView';
import { dueState, isoDay, today } from './ui';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Month calendar of the project's (filtered) tasks; a task spans start → due. */
export function CalendarView({ m }: { m: BoardModel }) {
  const { openTask, route, create } = useApp();
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => new Date()); // any day inside the shown month/week
  const tasks = [...m.bySection.values()].flat().filter((t) => t.dueDate);
  const month = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const base = mode === 'month' ? month : anchor;
  const first = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7)); // back to Monday
  const days = Array.from({ length: mode === 'month' ? 42 : 7 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  const t0 = today();
  const shift = (n: number) => setAnchor(mode === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth() + n, 1) : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * n));
  const title = mode === 'month' ? month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) : `${days[0].toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const undated = [...m.bySection.values()].flat().filter((t) => !t.dueDate).length;

  return (
    <div className="calendar">
      <div className="calendar-bar">
        <button type="button" className="btn small" onClick={() => setAnchor(new Date())}>
          Heute
        </button>
        <button type="button" className="icon-btn" aria-label={mode === 'month' ? 'Voriger Monat' : 'Vorige Woche'} onClick={() => shift(-1)}>
          <BsChevronLeft />
        </button>
        <button type="button" className="icon-btn" aria-label={mode === 'month' ? 'Nächster Monat' : 'Nächste Woche'} onClick={() => shift(1)}>
          <BsChevronRight />
        </button>
        <strong>{title}</strong>
        <span className="spacer" />
        {undated > 0 && <span className="muted small">{undated} ohne Datum (in Liste/Board)</span>}
        <span className="hover-select">
          <span className="hs-face">{mode === 'month' ? 'Monate' : 'Wochen'}</span>
          <select aria-label="Zeitraum der Ansicht" value={mode} onChange={(e) => setMode(e.target.value as 'month' | 'week')}>
            <option value="week">Wochen</option>
            <option value="month">Monate</option>
          </select>
        </span>
      </div>
      <div className={`cal-grid ${mode}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const key = isoDay(d);
          const items = tasks.filter((t) => (t.startDate || t.dueDate) <= key && key <= t.dueDate);
          return (
            <div key={key} className={`cal-day ${mode === 'month' && d.getMonth() !== month.getMonth() ? 'other' : ''} ${key === t0 ? 'today' : ''}`}>
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
