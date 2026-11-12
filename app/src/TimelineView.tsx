import { useEffect, useMemo, useRef, useState } from 'react';
import { BsChevronDown, BsChevronLeft, BsChevronRight, BsDash, BsPlus } from 'react-icons/bs';
import type { Task } from './api';
import { useApp } from './ctx';
import type { BoardModel } from './ProjectView';
import { Avatar, isoDay, today } from './ui';

const DAY = 86400000;
const ZOOMS = [18, 28, 42, 64]; // pixels per day
const ROW = 40;
const LEFT = 190;

// day numbers count calendar days (UTC-based), so time zones and DST never shift a bar
const toDay = (iso: string) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, mo - 1, d) / DAY);
};
const fromDay = (n: number) => {
  const d = new Date(n * DAY);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Gantt-style timeline: one bar per dated task (start → due), grouped by section, coloured by priority. */
export function TimelineView({ m }: { m: BoardModel }) {
  const { openTask, route, users, create } = useApp();
  const [zoom, setZoom] = useState(1);
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);
  const px = ZOOMS[zoom];
  const t0 = toDay(today());

  const { rows, first, last, undated } = useMemo(() => {
    let lo = t0 - 14;
    let hi = t0 + 42;
    let undated = 0;
    const rows = m.board.sections.map((s) => {
      const items: { t: Task; a: number; b: number }[] = [];
      for (const t of m.bySection.get(s.id) ?? []) {
        if (!t.dueDate && !t.startDate) {
          undated++;
          continue;
        }
        const b = toDay(t.dueDate || t.startDate);
        const a = Math.min(toDay(t.startDate || t.dueDate), b);
        lo = Math.min(lo, a - 7);
        hi = Math.max(hi, b + 14);
        items.push({ t, a, b });
      }
      items.sort((x, y) => x.a - y.a || x.b - y.b);
      return { s, items };
    });
    return { rows, first: lo, last: hi, undated };
  }, [m.board.sections, m.bySection, t0]);

  const days = last - first + 1;
  const width = days * px;
  const x = (day: number) => (day - first) * px;

  const scrollToToday = (smooth = false) => {
    scroller.current?.scrollTo({ left: Math.max(0, x(t0) - 160), behavior: smooth ? 'smooth' : 'auto' });
  };
  useEffect(() => {
    scrollToToday();
  }, []);

  const months: { label: string; left: number; width: number }[] = [];
  for (let d = first; d <= last; ) {
    const date = fromDay(d);
    const end = Math.min(last, toDay(isoDay(new Date(date.getFullYear(), date.getMonth() + 1, 1))) - 1);
    months.push({ label: date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }), left: x(d), width: (end - d + 1) * px });
    d = end + 1;
  }

  const bg = { backgroundSize: `${px}px 100%`, backgroundImage: 'linear-gradient(to right, var(--line) 1px, transparent 1px)' };

  return (
    <div className="timeline">
      <div className="timeline-bar">
        <button type="button" className="btn small" onClick={() => scrollToToday(true)}>
          Heute
        </button>
        <button type="button" className="icon-btn" aria-label="Eine Woche zurück" onClick={() => scroller.current?.scrollBy({ left: -7 * px, behavior: 'smooth' })}>
          <BsChevronLeft />
        </button>
        <button type="button" className="icon-btn" aria-label="Eine Woche vor" onClick={() => scroller.current?.scrollBy({ left: 7 * px, behavior: 'smooth' })}>
          <BsChevronRight />
        </button>
        <span className="spacer" />
        {undated > 0 && <span className="muted small">{undated} ohne Datum (in Liste/Board)</span>}
        <span className="muted small">Zoom</span>
        <button type="button" className="icon-btn" aria-label="Verkleinern" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}>
          <BsDash />
        </button>
        <button type="button" className="icon-btn" aria-label="Vergrößern" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(zoom + 1)}>
          <BsPlus />
        </button>
      </div>
      <div className="timeline-scroll" ref={scroller}>
        <div style={{ width: width + LEFT, minHeight: '100%' }}>
          <div className="tl-head" style={{ paddingLeft: LEFT }}>
            <div className="tl-corner" style={{ width: LEFT }} />
            <div className="tl-months" style={{ width }}>
              {months.map((mo) => (
                <span key={mo.left} className="tl-month" style={{ left: mo.left, width: mo.width }}>
                  {mo.label}
                </span>
              ))}
            </div>
            <div className="tl-days" style={{ width }}>
              {Array.from({ length: days }, (_, i) => {
                const d = fromDay(first + i);
                const isToday = first + i === t0;
                return (
                  <span key={i} className={`tl-day ${isToday ? 'today' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : ''}`} style={{ left: i * px, width: px }}>
                    {px >= 28 || d.getDate() % 2 === 1 ? d.getDate() : ''}
                  </span>
                );
              })}
            </div>
          </div>
          {rows.map(({ s, items }) => {
            const open = !closed.has(s.id);
            return (
              <section key={s.id} className="tl-section">
                <div className="tl-sec-head" style={{ ...bg, paddingLeft: LEFT }}>
                  <button
                    type="button"
                    className="tl-sec-name"
                    style={{ width: LEFT }}
                    aria-expanded={open}
                    onClick={() => setClosed((c) => (c.delete(s.id) ? new Set(c) : new Set(c).add(s.id)))}
                  >
                    {open ? <BsChevronDown /> : <BsChevronRight />} {s.name} <span className="muted small">{items.length}</span>
                  </button>
                </div>
                {open &&
                  items.map(({ t, a, b }) => {
                    const left = x(a);
                    const w = Math.max((b - a + 1) * px, 24);
                    return (
                      <div key={t.id} className="tl-row" style={{ ...bg, height: ROW, paddingLeft: LEFT }}>
                        <button
                          type="button"
                          className={`tl-bar prio-bar-${t.priority || 'none'} ${t.completed ? 'completed' : ''} ${route.taskId === t.id ? 'selected' : ''} ${w < 150 ? 'narrow' : ''}`}
                          style={{ left: LEFT + left, width: w }}
                          title={`${t.title}${t.startDate ? ` · ${t.startDate} – ${t.dueDate}` : ` · ${t.dueDate}`}`}
                          onClick={() => openTask(t.id)}
                        >
                          {t.assigneeId && <Avatar user={users.get(t.assigneeId)} size={20} />}
                          <span className="tl-label ellipsis">{t.title}</span>
                        </button>
                      </div>
                    );
                  })}
                {open && (
                  <div className="tl-row tl-add" style={{ height: 30, paddingLeft: LEFT - 4 }}>
                    <button type="button" className="btn link small" onClick={() => create(m.board.project.id, isoDay(new Date()))}>
                      + Aufgabe hinzufügen
                    </button>
                  </div>
                )}
              </section>
            );
          })}
          <div className="tl-today" style={{ left: LEFT + x(t0) + px / 2 }} aria-hidden />
        </div>
      </div>
    </div>
  );
}
