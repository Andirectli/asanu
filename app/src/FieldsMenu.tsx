import { useState } from 'react';
import { BsX } from 'react-icons/bs';
import type { Field, FieldType } from './api';
import { useApp } from './ctx';

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Zahl' },
  { value: 'date', label: 'Datum' },
  { value: 'select', label: 'Auswahl' },
];

/** Manage a project's custom fields (inside the "Spalten" popover). */
export function FieldsMenu({ projectId, fields, onChange }: { projectId: number; fields: Field[]; onChange: () => void }) {
  const { api, run } = useApp();
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [options, setOptions] = useState('');
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await run(api.createField(projectId, name.trim(), type, options.split(',')));
    if (!ok) return;
    setName('');
    setOptions('');
    onChange();
  };
  const remove = async (f: Field) => {
    if (!window.confirm(`Feld „${f.name}" mit allen Werten löschen?`)) return;
    await run(api.deleteField(f.id));
    onChange();
  };
  return (
    <>
      <div className="popover-title">Eigene Felder</div>
      {fields.map((f) => (
        <div key={f.id} className="check-line">
          <span style={{ flex: 1 }}>
            {f.name} <span className="muted small">{FIELD_TYPES.find((t) => t.value === f.type)?.label}</span>
          </span>
          <button type="button" className="icon-btn" aria-label={`Feld ${f.name} löschen`} onClick={() => remove(f)}>
            <BsX />
          </button>
        </div>
      ))}
      <form onSubmit={add} className="field-add">
        <input className="popover-input" placeholder="Neues Feld" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Name des Felds" />
        <select value={type} onChange={(e) => setType(e.target.value as FieldType)} aria-label="Typ des Felds">
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {type === 'select' && <input className="popover-input" placeholder="Optionen, mit Komma getrennt" value={options} onChange={(e) => setOptions(e.target.value)} aria-label="Optionen" />}
        <button className="btn small" disabled={!name.trim() || (type === 'select' && !options.trim())}>
          Hinzufügen
        </button>
      </form>
    </>
  );
}

/** One editable cell/row value for a field; saves on change/blur. */
export function FieldInput({ f, value, onSave }: { f: Field; value: string; onSave: (v: string) => void }) {
  if (f.type === 'select')
    return (
      <select className="field-input" aria-label={f.name} value={value} onChange={(e) => onSave(e.target.value)}>
        <option value="">—</option>
        {f.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  return (
    <input
      key={value}
      className="field-input"
      aria-label={f.name}
      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
      step="any"
      maxLength={500}
      defaultValue={value}
      onBlur={(e) => e.target.value !== value && onSave(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
