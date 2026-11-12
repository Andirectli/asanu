import { useEffect, useMemo, useRef, useState } from 'react';
import { BsChevronDown, BsChevronLeft, BsChevronRight } from 'react-icons/bs';
import type { Task } from './api';
import { useApp } from './ctx';
import type { BoardModel } from './ProjectView';
import { Avatar, isoDay, today } from './ui';

const DAY = 86400000;
const ZOOMS = [
  { key: 'days', label: 'Tage', px: 30 },
  { key: 'weeks', label: 'Wochen', px: 14 },
  { key: 'months', label: 'Monate', px: 5 },
  { key: 'quarters', label: 'Quartale', px: 2 },
  { key: 'years', label: 'Jahre', px: 0.8 },
];
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

type Drag = { id: number; mode: 'move' | 'start' | 'end'; x0: number; delta: number; moved: boolean };

/** Gantt-style timeline: one bar per dated task (start → due), grouped by section, coloured by priority. Bars can be dragged and resized. */
export function TimelineView({ m }: { m: BoardModel }) {
  const { openTask, route, users, create } = useApp();
  const [zoom, setZoom] = useState(0);
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const px = ZOOMS[zoom].px;
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
        const a = t.kind === 'milestone' ? b : Math.min(toDay(t.startDate || t.dueDate), b);
        lo = Math.min(lo, a - 7);
        hi = Math.max(hi, b + 14);
        items.push({ t, a, b });
      }
      items.sort((x, y) => x.a - y.a || x.b - y.b);
      return { s, items };
    });
    // at coarse zoom levels leave room around today so the scroll bar is useful
    const pad = Math.ceil(400 / px);
    return { rows, first: lo - pad, last: hi + pad, undated };
  }, [m.board.sections, m.bySection, t0, px]);

  const days = last - first + 1;
  const width = days * px;
  const x = (day: number) => (day - first) * px;

  const scrollToToday = (smooth = false) => {
    scroller.current?.scrollTo({ left: Math.max(0, x(t0) - 160), behavior: smooth ? 'smooth' : 'auto' });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to today on first render and whenever the zoom changes
  useEffect(() => {
    scrollToToday();
  }, [zoom]);

  const months: { label: string; left: number; width: number }[] = [];
  for (let d = first; d <= last; ) {
    const date = fromDay(d);
    const end = Math.min(last, toDay(isoDay(new Date(date.getFullYear(), date.getMonth() + 1, 1))) - 1);
    months.push({ label: date.toLocaleDateString('de-DE', px >= 5 ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' }), left: x(d), width: (end - d + 1) * px });
    d = end + 1;
  }

  const gridStep = px >= 14 ? px : px >= 5 ? px * 7 : 0;
  const bg = gridStep ? { backgroundSize: `${gridStep}px 100%`, backgroundImage: 'linear-gradient(to right, var(--line) 1px, transparent 1px)' } : {};

  // ---- dragging: pointer capture on the bar; saves once on release ----
  const begin = (e: React.PointerEvent, t: Task, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
    setDrag({ id: t.id, mode, x0: e.clientX, delta: 0, moved: false });
  };
  const move = (e: React.PointerEvent) => {
    setDrag((d) => (d ? { ...d, delta: Math.round((e.clientX - d.x0) / px), moved: d.moved || Math.abs(e.clientX - d.x0) > 4 } : d));
  };
  const finish = async (t: Task, a: number, b: number) => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (!d.moved) return openTask(t.id); // a click, not a drag
    if (d.delta === 0) return;
    let na = a;
    let nb = b;
    if (d.mode !== 'end') na = a + d.delta;
    if (d.mode !== 'start') nb = b + d.delta;
    if (na > nb) [na, nb] = d.mode === 'start' ? [nb, nb] : [na, na]; // never cross over
    const iso = (n: number) => isoDay(fromDay(n));
    const keepsStart = t.kind !== 'milestone' && (!!t.startDate || na !== nb);
    await m.setDates(t, keepsStart ? iso(na) : '', iso(nb));
  };

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
        <span className="hover-select">
          <span className="hs-face">{ZOOMS[zoom].label}</span>
          <select aria-label="Zeitleisten-Zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {ZOOMS.map((z, i) => (
              <option key={z.key} value={i}>
                {z.label}
              </option>
            ))}
          </select>
        </span>
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
              {px >= 14 &&
                Array.from({ length: days }, (_, i) => {
                  const d = fromDay(first + i);
                  const isToday = first + i === t0;
                  const monday = d.getDay() === 1;
                  if (px < 28 && !monday && !isToday) return null; // week zoom: only Mondays get a number
                  return (
                    <span key={i} className={`tl-day ${isToday ? 'today' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : ''}`} style={{ left: i * px, width: Math.max(px, 22) }}>
                      {d.getDate()}
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
                    const dragging = drag?.id === t.id ? drag : null;
                    const da = dragging && dragging.mode !== 'end' ? dragging.delta : 0;
                    const db = dragging && dragging.mode !== 'start' ? dragging.delta : 0;
                    const ea = Math.min(a + da, b + db);
                    const eb = Math.max(a + da, b + db);
                    const milestone = t.kind === 'milestone';
                    const left = x(ea);
                    const w = Math.max((eb - ea + 1) * px, 24);
                    const title = `${t.title}${t.startDate ? ` · ${t.startDate} – ${t.dueDate}` : ` · ${t.dueDate}`}`;
                    return (
                      <div key={t.id} className="tl-row" style={{ ...bg, height: ROW, paddingLeft: LEFT }}>
                        {milestone ? (
                          <button
                            type="button"
                            className={`tl-milestone ${t.completed ? 'completed' : ''} ${route.taskId === t.id ? 'selected' : ''}`}
                            style={{ left: LEFT + x(eb) + px / 2 - 9 }}
                            title={title}
                            onPointerDown={(e) => begin(e, t, 'move')}
                            onPointerMove={dragging ? move : undefined}
                            onPointerUp={() => finish(t, a, b)}
                          >
                            <span className="tl-diamond" />
                            <span className="tl-label">{t.title}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`tl-bar prio-bar-${t.priority || 'none'} ${t.completed ? 'completed' : ''} ${route.taskId === t.id ? 'selected' : ''} ${w < 150 ? 'narrow' : ''} ${dragging?.moved ? 'dragging' : ''}`}
                            style={{ left: LEFT + left, width: w }}
                            title={title}
                            onPointerDown={(e) => begin(e, t, (e.target as HTMLElement).dataset.h === 'l' ? 'start' : (e.target as HTMLElement).dataset.h === 'r' ? 'end' : 'move')}
                            onPointerMove={dragging ? move : undefined}
                            onPointerUp={() => finish(t, a, b)}
                            onKeyDown={(e) => e.key === 'Enter' && openTask(t.id)}
                          >
                            <span className="tl-handle l" data-h="l" />
                            {t.assigneeId && <Avatar user={users.get(t.assigneeId)} size={20} />}
                            <span className="tl-label ellipsis">{t.title}</span>
                            <span className="tl-handle r" data-h="r" />
                          </button>
                        )}
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
