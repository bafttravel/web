'use client';
import { Clock3 } from 'lucide-react';

export default function AdminTimePicker({ value, onValueChange, id, label = 'Horario', appearance = 'default' }: { value: string; onValueChange: (value: string) => void; id?: string; label?: string; appearance?: 'default' | 'field' }) {
  const valid = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const [hours, minutes] = valid ? value.split(':') : ['', ''];
  return <span className={`admin-timepicker${appearance === 'field' ? ' admin-timepicker-field' : ''}`} role="group" aria-label={label}>
    {appearance === 'field' && <Clock3 size={16} aria-hidden="true" />}
    <select id={id} aria-label={`${label}: hora`} value={hours} onChange={(e) => onValueChange(e.target.value ? `${e.target.value}:${minutes || '00'}` : '')}><option value="">HH</option>{Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((hour) => <option key={hour}>{hour}</option>)}</select>
    <span aria-hidden="true">:</span><select aria-label={`${label}: minutos`} value={minutes} onChange={(e) => onValueChange(e.target.value ? `${hours || '00'}:${e.target.value}` : '')}><option value="">mm</option>{Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((minute) => <option key={minute}>{minute}</option>)}</select>
    {value && <button type="button" aria-label={`Limpiar ${label.toLowerCase()}`} onClick={() => onValueChange('')}>×</button>}
  </span>;
}
