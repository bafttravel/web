'use client';
import AdminDatePicker from './AdminDatePicker';
import { adminDateLabel } from '@/lib/admin/dates';

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Salida } from '@/types';
import { Button } from '@/components/ui/button';
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  salidas: Salida[];
  onSalidasChange: (salidas: Salida[]) => void;
};

type Draft = Omit<Salida, 'id'>;

const EMPTY_DRAFT: Draft = {
  fecha: '',
  fechaVuelta: '',
  ciudadSalida: '',
  precio: 0,
  moneda: 'ARS',
  observaciones: '',
};

function toIso(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function parseIso(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDate(value: string) {
  return adminDateLabel(value);
}

function makeSalida(draft: Draft, fecha: string, id?: string): Salida {
  return {
    id: id || `salida-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fecha,
    fechaVuelta: draft.fechaVuelta?.trim() || fecha,
    ciudadSalida: draft.ciudadSalida.trim(),
    precio: Number(draft.precio) || 0,
    moneda: draft.moneda,
    observaciones: draft.observaciones?.trim() || '',
  };
}

export default function SalidasManager({ salidas, onSalidasChange }: Props) {
  const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
  const today = toIso(new Date());
  const [month, setMonth] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  const datesByIso = useMemo(() => new Set(salidas.map((salida) => salida.fecha)), [salidas]);
  const sortedSalidas = useMemo(() => [...salidas].sort((a, b) => a.fecha.localeCompare(b.fecha)), [salidas]);
  const totalPages = Math.max(1, Math.ceil(sortedSalidas.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedSalidas = useMemo(
    () => sortedSalidas.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, sortedSalidas]
  );
  const firstVisible = sortedSalidas.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastVisible = Math.min(currentPage * pageSize, sortedSalidas.length);
  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: offset + last.getDate() }, (_, index) => {
      if (index < offset) return null;
      return new Date(month.getFullYear(), month.getMonth(), index - offset + 1);
    });
  }, [month]);

  const resetEditor = () => {
    setDraft({ ...EMPTY_DRAFT });
    setEditingId(null);
  };

  const selectDate = (value: string) => {
    if (!rangeStart || rangeEnd) {
      setRangeStart(value);
      setRangeEnd('');
    } else if (value < rangeStart) {
      setRangeEnd(rangeStart);
      setRangeStart(value);
    } else {
      setRangeEnd(value);
    }
  };

  const addRange = () => {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
      toast.error('Elegí un rango de fechas válido.');
      return;
    }
    if (draft.precio <= 0) {
      toast.error('Cargá el precio antes de agregar las fechas.');
      return;
    }

    const next = [...salidas];
    const cursor = parseIso(rangeStart);
    const end = parseIso(rangeEnd);
    let added = 0;
    while (cursor <= end) {
      const date = toIso(cursor);
      if (date >= today && !datesByIso.has(date)) {
        next.push(makeSalida(draft, date));
        added += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (!added) {
      toast.info('Todas las fechas del rango ya están cargadas o quedaron atrás.');
      return;
    }
    onSalidasChange(next);
    setPage(1);
    setRangeStart('');
    setRangeEnd('');
    toast.success(`${added} fecha${added === 1 ? '' : 's'} agregada${added === 1 ? '' : 's'}.`);
  };

  const editSalida = (salida: Salida) => {
    setEditingId(salida.id);
    setDraft({
      fecha: salida.fecha,
      fechaVuelta: salida.fechaVuelta || salida.fecha,
      ciudadSalida: salida.ciudadSalida || '',
      precio: Number(salida.precio) || 0,
      moneda: salida.moneda,
      observaciones: salida.observaciones || '',
    });
  };

  const saveEdit = () => {
    if (!editingId || !draft.fecha || !draft.fechaVuelta || draft.precio <= 0) {
      toast.error('Completá ida, vuelta y un precio válido.');
      return;
    }
    if (draft.fechaVuelta < draft.fecha) {
      toast.error('La vuelta no puede ser anterior a la ida.');
      return;
    }
    if (salidas.some((salida) => salida.id !== editingId && salida.fecha === draft.fecha)) {
      toast.error('Ya existe una salida para esa fecha.');
      return;
    }
    onSalidasChange(salidas.map((salida) => salida.id === editingId ? makeSalida(draft, draft.fecha, editingId) : salida));
    resetEditor();
    toast.success('Salida actualizada.');
  };

  const removeSalida = (id: string) => {
    onSalidasChange(salidas.filter((salida) => salida.id !== id));
    if (editingId === id) resetEditor();
    if (currentPage > 1 && paginatedSalidas.length === 1) setPage((value) => Math.max(1, value - 1));
    toast.success('Salida eliminada.');
  };

  return (
    <div className="space-y-5">
      {!editingId ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Seleccioná las fechas</p>
                <p className="mt-1 text-xs text-gray-500">Un clic para una fecha, dos para completar un rango.</p>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="min-w-32 text-center text-sm font-medium capitalize text-gray-700">{month.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</span>
                <Button type="button" variant="ghost" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="admin-caption mt-4 grid grid-cols-7 text-center font-medium text-gray-400">{['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarDays.map((date, index) => {
                if (!date) return <span key={`empty-${index}`} className="aspect-square" />;
                const iso = toIso(date);
                const past = iso < today;
                const selected = iso === rangeStart || iso === rangeEnd;
                const inRange = Boolean(rangeStart && rangeEnd && iso >= rangeStart && iso <= rangeEnd);
                const loaded = datesByIso.has(iso);
                return <button key={iso} type="button" disabled={past} onClick={() => selectDate(iso)} className={`relative aspect-square rounded-md text-sm transition-colors ${past ? 'cursor-not-allowed text-gray-300' : 'text-gray-700 hover:bg-gray-100'} ${inRange ? 'bg-gray-100' : ''} ${selected ? 'bg-gray-900 text-white hover:bg-gray-800' : ''}`}>{date.getDate()}{loaded ? <span className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${selected ? 'bg-white' : 'bg-[#0f766e]'}`} /> : null}</button>;
              })}
            </div>
            <div className="mt-4 flex gap-4 text-xs text-gray-500"><span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[#0f766e]" />Ya cargada</span><span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-gray-300" />No disponible</span></div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-gray-900">Agregar fechas</p><p className="mt-1 text-xs text-gray-500">Los datos se aplican al rango elegido.</p></div>{rangeStart ? <button type="button" onClick={() => { setRangeStart(''); setRangeEnd(''); }} className="text-gray-400 hover:text-gray-700" aria-label="Limpiar selección"><X className="h-4 w-4" /></button> : null}</div>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="salidas-desde" className="text-xs">Desde</Label><AdminDatePicker id="salidas-desde" min={today} value={rangeStart} onValueChange={setRangeStart} className="mt-1" /></div><div><Label htmlFor="salidas-hasta" className="text-xs">Hasta</Label><AdminDatePicker id="salidas-hasta" min={rangeStart || today} value={rangeEnd} onValueChange={setRangeEnd} className="mt-1" /></div></div>
              <div><Label htmlFor="salidas-precio" className="text-xs">Precio por persona</Label><FormattedAmountInput id="salidas-precio" value={draft.precio} onChange={(value) => setDraft((prev) => ({ ...prev, precio: value }))} className="mt-1 bg-white" /></div>
              <div><Label htmlFor="salidas-moneda" className="text-xs">Moneda</Label><Select value={draft.moneda} onValueChange={(value: Draft['moneda']) => setDraft((prev) => ({ ...prev, moneda: value }))}><SelectTrigger id="salidas-moneda" className="mt-1 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ARS">ARS</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent></Select></div>
              <div><Label htmlFor="salidas-ciudad" className="text-xs">Ciudad de salida</Label><Input id="salidas-ciudad" value={draft.ciudadSalida} onChange={(event) => setDraft((prev) => ({ ...prev, ciudadSalida: event.target.value }))} className="mt-1 bg-white" placeholder="Opcional" /></div>
              <Button type="button" onClick={addRange} className="w-full"><Plus className="mr-2 h-4 w-4" />Agregar fechas</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold text-gray-900">Editar salida · {formatDate(draft.fecha)}</p><Button type="button" variant="ghost" size="icon" onClick={resetEditor} aria-label="Cancelar edición"><X className="h-4 w-4" /></Button></div>
          <div className="mt-4 grid gap-3 md:grid-cols-3"><div><Label htmlFor="edit-fecha" className="text-xs">Ida</Label><AdminDatePicker id="edit-fecha" min={today} value={draft.fecha} onValueChange={(fecha) => setDraft((prev) => ({ ...prev, fecha }))} className="mt-1" /></div><div><Label htmlFor="edit-vuelta" className="text-xs">Vuelta</Label><AdminDatePicker id="edit-vuelta" min={draft.fecha || today} value={draft.fechaVuelta} onValueChange={(fechaVuelta) => setDraft((prev) => ({ ...prev, fechaVuelta }))} className="mt-1" /></div><div><Label htmlFor="edit-precio" className="text-xs">Precio</Label><FormattedAmountInput id="edit-precio" value={draft.precio} onChange={(value) => setDraft((prev) => ({ ...prev, precio: value }))} className="mt-1 bg-white" /></div></div>
          <div className="mt-3 grid gap-3 md:grid-cols-2"><div><Label htmlFor="edit-ciudad" className="text-xs">Ciudad de salida</Label><Input id="edit-ciudad" value={draft.ciudadSalida} onChange={(event) => setDraft((prev) => ({ ...prev, ciudadSalida: event.target.value }))} className="mt-1 bg-white" /></div><div><Label htmlFor="edit-observaciones" className="text-xs">Observaciones</Label><Textarea id="edit-observaciones" value={draft.observaciones} onChange={(event) => setDraft((prev) => ({ ...prev, observaciones: event.target.value }))} className="mt-1 bg-white" rows={1} /></div></div>
          <div className="mt-3 flex justify-end"><Button type="button" onClick={saveEdit}>Guardar cambios</Button></div>
        </div>
      )}

      <div className="border-t border-gray-200 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Salidas configuradas</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {sortedSalidas.length} {sortedSalidas.length === 1 ? 'fecha cargada' : 'fechas cargadas'}
            </p>
          </div>
          {sortedSalidas.length > 0 ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Mostrar</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[76px] bg-white text-xs" aria-label="Cantidad de salidas por página">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>por página</span>
            </div>
          ) : null}
        </div>

        {sortedSalidas.length === 0 ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">
            <CalendarDays className="h-5 w-5 text-gray-400" />
            Todavía no hay fechas cargadas.
          </div>
        ) : (
          <>
            <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {paginatedSalidas.map((salida) => (
                <div key={salida.id} className="flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-gray-50/80 sm:px-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-gray-900">
                      <span>{formatDate(salida.fecha)}</span>
                      {salida.fechaVuelta && salida.fechaVuelta !== salida.fecha ? <span className="text-gray-400">hasta {formatDate(salida.fechaVuelta)}</span> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{salida.moneda} {Number(salida.precio || 0).toLocaleString('es-AR')}</span>
                      {salida.ciudadSalida ? <span className="truncate">{salida.ciudadSalida}</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => editSalida(salida)} disabled={Boolean(editingId)} aria-label={`Editar salida ${formatDate(salida.fecha)}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeSalida(salida.id)} disabled={Boolean(editingId)} aria-label={`Eliminar salida ${formatDate(salida.fecha)}`}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 ? (
              <div className="mt-3 flex flex-col gap-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
                <span>Mostrando {firstVisible}–{lastVisible} de {sortedSalidas.length}</span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Página anterior">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-20 text-center font-medium text-gray-700">Página {currentPage} de {totalPages}</span>
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages} aria-label="Página siguiente">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
