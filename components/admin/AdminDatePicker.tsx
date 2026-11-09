'use client';

import { forwardRef, useId, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { adminDateLabel, dateOnly, dateOnlyKey } from '@/lib/admin/dates';
import { adminCalendarClassNames } from './calendar-styles';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange'> & {
  value?: string; onValueChange: (value: string) => void;
  min?: string; max?: string; required?: boolean; allowedDates?: string[];
};

const AdminDatePicker = forwardRef<HTMLButtonElement, Props>(function AdminDatePicker({ value = '', onValueChange, min, max, required, allowedDates, className = '', disabled, name, ...props }, ref) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const requiredHint = useId();
  const valid = !!dateOnly(value) && (!min || value >= min) && (!max || value <= max) && (!allowedDates || allowedDates.includes(value));
  const choose = (next: string) => { onValueChange(next); setOpen(false); };
  return <span className={`admin-datepicker ${className}`}>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button {...props} ref={(node) => { trigger.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }} type="button" className="admin-datepicker-trigger" disabled={disabled} aria-describedby={[props['aria-describedby'], required ? requiredHint : undefined].filter(Boolean).join(' ') || undefined}>
        <CalendarBlank size={17} aria-hidden="true" /><span>{valid ? adminDateLabel(value) : 'DD/MM/AAAA'}</span>
      </button></PopoverTrigger>
      <PopoverContent className="admin-calendar-popover" align="start" aria-label="Elegir fecha">
        <Calendar mode="single" selected={valid ? dateOnly(value) : undefined} defaultMonth={dateOnly(value) ?? dateOnly(max) ?? new Date()} captionLayout="dropdown" startMonth={dateOnly(min) ?? new Date(1900, 0)} endMonth={dateOnly(max) ?? new Date(2100, 11)} classNames={adminCalendarClassNames} disabled={(date) => { const key = dateOnlyKey(date); return (!!min && key < min) || (!!max && key > max) || (!!allowedDates && !allowedDates.includes(key)); }} onSelect={(date) => { if (date) choose(dateOnlyKey(date)); }} />
        <div className="admin-calendar-actions">{!required && <button type="button" onClick={() => choose('')}>Limpiar fecha</button>}<button type="button" onClick={() => setOpen(false)}>Cerrar</button></div>
      </PopoverContent>
    </Popover>
    <input className="admin-date-validation" type="text" name={name} value={valid ? value : ''} onChange={() => {}} required={required} disabled={disabled} tabIndex={-1} aria-hidden="true" onInvalid={(event) => { event.preventDefault(); trigger.current?.focus(); setOpen(true); }} />
    {required && <span id={requiredHint} className="sr-only">Campo obligatorio: seleccioná una fecha en el calendario.</span>}
  </span>;
});
export default AdminDatePicker;
