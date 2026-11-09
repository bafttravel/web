'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { CalendarBlank } from '@phosphor-icons/react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { adminDateLabel, dateOnly, dateOnlyKey } from '@/lib/admin/dates';
import { adminCalendarClassNames } from './calendar-styles';

export default function AdminDateRangePicker({ from, to, onValueChange, label = 'Período' }: { from: string; to: string; onValueChange: (from: string, to: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const [choosingEnd, setChoosingEnd] = useState(false);
  return <Popover open={open} onOpenChange={(next) => { if (next) { setDraft({ from: dateOnly(from), to: dateOnly(to) }); setChoosingEnd(false); } setOpen(next); }}>
    <PopoverTrigger asChild><button type="button" className="admin-datepicker-trigger admin-datepicker-range" aria-label={label}><CalendarBlank size={17} aria-hidden="true" /><span>{from ? adminDateLabel(from) : 'Desde'} — {to ? adminDateLabel(to) : 'Hasta'}</span></button></PopoverTrigger>
    <PopoverContent className="admin-calendar-popover" align="start" aria-label="Elegir período">
      <p className="admin-calendar-help">Elegí la fecha de inicio y la de fin.</p>
      <Calendar mode="range" selected={draft} onSelect={(range, day) => { if (!choosingEnd) { setDraft({ from: day }); setChoosingEnd(true); } else { setDraft(range); setChoosingEnd(false); } }} defaultMonth={dateOnly(from) ?? new Date()} captionLayout="dropdown" startMonth={new Date(1900, 0)} endMonth={new Date(2100, 11)} classNames={adminCalendarClassNames} />
      <div className="admin-calendar-actions"><button type="button" onClick={() => { onValueChange('', ''); setOpen(false); }}>Limpiar</button><button type="button" disabled={!draft?.from || !draft?.to} onClick={() => { onValueChange(dateOnlyKey(draft?.from), dateOnlyKey(draft?.to)); setOpen(false); }}>Usar fechas</button></div>
    </PopoverContent>
  </Popover>;
}
