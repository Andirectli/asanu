import { useEffect, useRef, useState } from 'react';
import { BsCheck } from 'react-icons/bs';
import type { Label, Priority, Status, Task, User } from './api';

// Asana project palette, same set the clone seeds as project base colors.
export const COLORS: { name: string; hex: string }[] = [
  { name: 'Rot', hex: '#f06a6a' },
  { name: 'Orange', hex: '#ec8d71' },
  { name: 'Gelborange', hex: '#f1bd6c' },
  { name: 'Gelb', hex: '#f8df72' },
  { name: 'Gelbgrün', hex: '#aecf55' },
  { name: 'Grün', hex: '#5da283' },
  { name: 'Blaugrün', hex: '#4ecbc4' },
  { name: 'Aqua', hex: '#9ee7e3' },
  { name: 'Blau', hex: '#4573d2' },
  { name: 'Indigo', hex: '#8d84e8' },
  { name: 'Lila', hex: '#b36bd4' },
  { name: 'Magenta', hex: '#f9aaef' },
  { name: 'Pink', hex: '#f26fb2' },
  { name: 'Rosa', hex: '#fc979a' },
  { name: 'Grau', hex: '#6d6e6f' },
];

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: '', label: 'Keine' },
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
];

export const STATUSES: { value: Status; label: string }[] = [
  { value: '', label: 'Kein Status' },
  { value: 'on_track', label: 'Planmäßig' },
  { value: 'at_risk', label: 'Gefährdet' },
  { value: 'off_track', label: 'Unplanmäßig' },
];

export function StatusPill({ s }: { s: Status }) {
  if (!s) return null;
  return <span className={`pill status-${s}`}>{STATUSES.find((x) => x.value === s)?.label}</span>;
}

const AVATAR_COLORS = ['#f8df72', '#9ee7e3', '#f9aaef', '#aecf55', '#fc979a', '#8d84e8', '#f1bd6c'];

export function Avatar({ user, size = 24 }: { user: User | undefined; size?: number }) {
  if (!user) return null;
  return (
    <span className="avatar" title={user.name} style={{ width: size, height: size, flexBasis: size, fontSize: size * 0.4, background: AVATAR_COLORS[user.id % AVATAR_COLORS.length] }}>
      {user.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function CheckCircle({ done, onToggle, size = 16, label }: { done: boolean; onToggle: () => void; size?: number; label: string }) {
  return (
    <button
      type="button"
      className={`check ${done ? 'done' : ''}`}
      style={{ width: size, height: size }}
      aria-label={label}
      aria-pressed={done}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <BsCheck />
    </button>
  );
}

export function PriorityPill({ p }: { p: Priority }) {
  if (!p) return null;
  return <span className={`pill prio-${p}`}>{PRIORITIES.find((x) => x.value === p)?.label}</span>;
}

export function LabelPills({ ids, labels }: { ids: number[]; labels: Map<number, Label> }) {
  return (
    <>
      {ids.map((id) => {
        const l = labels.get(id);
        return l ? (
          <span key={id} className="pill" style={{ background: `${l.color}33`, color: '#1e1f21' }}>
            {l.name}
          </span>
        ) : null;
      })}
    </>
  );
}

export const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
export const isoDay = (d: Date) => d.toLocaleDateString('sv-SE');

export function dueState(t: Pick<Task, 'dueDate' | 'completed'>): '' | 'overdue' | 'today' {
  if (!t.dueDate || t.completed) return '';
  const d = today();
  return t.dueDate < d ? 'overdue' : t.dueDate === d ? 'today' : '';
}

export function formatDue(date: string): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  const t = new Date(`${today()}T00:00:00`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', ...(d.getFullYear() !== t.getFullYear() ? { year: 'numeric' } : {}) });
}

export function DueText({ t }: { t: Pick<Task, 'dueDate' | 'completed'> & { startDate?: string } }) {
  if (!t.dueDate) return null;
  return (
    <span className={`due ${dueState(t)}`}>
      {t.startDate ? `${formatDue(t.startDate)} – ` : ''}
      {formatDue(t.dueDate)}
    </span>
  );
}

/** Text that turns into an input on click; saves on Enter/blur, Escape cancels. Keeps the draft if saving fails. */
export function InlineEdit({
  value,
  onSave,
  className,
  placeholder,
  ariaLabel,
  autoEdit = false,
}: {
  value: string;
  onSave: (v: string) => Promise<boolean>;
  className?: string;
  placeholder?: string;
  ariaLabel: string;
  autoEdit?: boolean;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const busy = useRef(false);
  const commit = async () => {
    if (busy.current) return; // disabling the input blurs it; don't save twice
    const v = draft.trim();
    if (!v || v === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    busy.current = true;
    setSaving(true);
    const ok = await onSave(v);
    setSaving(false);
    busy.current = false;
    if (ok) setEditing(false);
    else ref.current?.focus();
  };

  if (!editing)
    return (
      <button type="button" className={`inline-edit ${className ?? ''}`} onClick={() => setEditing(true)} aria-label={`${ariaLabel} bearbeiten`}>
        {value || <span className="muted">{placeholder}</span>}
      </button>
    );
  return (
    <input
      ref={ref}
      className={`inline-input ${className ?? ''}`}
      value={draft}
      aria-label={ariaLabel}
      disabled={saving}
      maxLength={500}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}

/** Small anchored popover that closes on outside click / Escape. */
export function Popover({ open, onClose, children, align = 'left' }: { open: boolean; onClose: () => void; children: React.ReactNode; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key, true);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`popover ${align}`} role="dialog">
      {children}
    </div>
  );
}

export function ColorGrid({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  return (
    <div className="color-grid">
      {COLORS.map((c) => (
        <button key={c.hex} type="button" title={c.name} aria-label={c.name} className="swatch" style={{ background: c.hex }} onClick={() => onPick(c.hex)}>
          {c.hex === value && <BsCheck color="#fff" />}
        </button>
      ))}
    </div>
  );
}
