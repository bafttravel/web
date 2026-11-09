'use client';
import AdminDatePicker from './AdminDatePicker';
import { adminDateLabel } from '@/lib/admin/dates';

import { useMemo, useState } from 'react';
import { CalendarDays, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Salida } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  salidas: Salida[];
  onSalidasChange: (salidas: Salida[]) => void;
  fechaVencimiento: string;
  onFechaVencimientoChange: (value: string) => void;
};

type SalidaDraft = {
  fecha: string;
  precio: number;
  observaciones: string;
};

const EMPTY_DRAFT: SalidaDraft = {
  fecha: '',
  precio: 0,
  observaciones: '',
};

function formatShortDate(value: string) {
  return adminDateLabel(value);
}

function makeSalidaId() {
  return `salida-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeSalida(id: string, draft: SalidaDraft): Salida {
  const fecha = draft.fecha.trim();
  return {
    id,
    fecha,
    fechaVuelta: fecha,
    ciudadSalida: '',
    precio: Number(draft.precio) || 0,
    moneda: 'ARS',
    observaciones: draft.observaciones.trim(),
  };
}

export default function PackageAvailabilityStudio({
  salidas,
  onSalidasChange,
  fechaVencimiento,
  onFechaVencimientoChange,
}: Props) {
  const [draft, setDraft] = useState<SalidaDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sortedSalidas = useMemo(
    () => [...salidas].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()),
    [salidas]
  );

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  };

  const saveSalida = () => {
    if (!draft.fecha) {
      toast.error('Cargá una fecha válida.');
      return;
    }
    if ((Number(draft.precio) || 0) <= 0) {
      toast.error('Cargá un precio válido.');
      return;
    }

    const nextSalida = sanitizeSalida(editingId ?? makeSalidaId(), draft);
    const next = editingId
      ? salidas.map((salida) => (salida.id === editingId ? nextSalida : salida))
      : [...salidas, nextSalida];

    onSalidasChange(next);
    resetDraft();
    toast.success(editingId ? 'Fecha actualizada.' : 'Fecha agregada.');
  };

  const editSalida = (salida: Salida) => {
    setEditingId(salida.id);
    setDraft({
      fecha: String(salida.fecha ?? ''),
      precio: Number(salida.precio) || 0,
      observaciones: String(salida.observaciones ?? ''),
    });
  };

  const removeSalida = (id: string) => {
    onSalidasChange(salidas.filter((salida) => salida.id !== id));
    if (editingId === id) resetDraft();
    toast.success('Fecha eliminada.');
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Vigencia del paquete</CardTitle>
          <p className="text-sm text-gray-500">Definí hasta cuándo se muestra el paquete publicado.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="fechaVencimiento">Fecha de vencimiento (opcional)</Label>
            <AdminDatePicker
              id="fechaVencimiento"
              value={fechaVencimiento}
              onValueChange={onFechaVencimientoChange}
              className="mt-1.5"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Fechas del paquete</CardTitle>
          <p className="text-sm text-gray-500">Cada paquete necesita al menos una fecha y su precio base.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
              <div>
                <Label htmlFor="salidaFecha">Fecha *</Label>
                <AdminDatePicker
                  id="salidaFecha"
                  value={draft.fecha}
                  onValueChange={(fecha) => setDraft((prev) => ({ ...prev, fecha }))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="salidaPrecio">Precio base *</Label>
                <FormattedAmountInput
                  id="salidaPrecio"
                  value={draft.precio}
                  onChange={(value) => setDraft((prev) => ({ ...prev, precio: value }))}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="mt-4">
              <Label htmlFor="salidaObservaciones">Observación interna</Label>
              <Textarea
                id="salidaObservaciones"
                value={draft.observaciones}
                onChange={(event) => setDraft((prev) => ({ ...prev, observaciones: event.target.value }))}
                placeholder="Notas internas opcionales para esta fecha"
                className="mt-1.5"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" onClick={saveSalida}>
                {editingId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {editingId ? 'Guardar fecha' : 'Agregar fecha'}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={resetDraft}>
                  Cancelar edición
                </Button>
              ) : null}
            </div>
          </div>

          {sortedSalidas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                <CalendarDays className="h-5 w-5 text-gray-500" />
              </div>
              <div className="mt-4 text-base font-semibold text-gray-900">Todavía no cargaste fechas</div>
              <div className="mt-1 text-sm text-gray-500">Agregá al menos una fecha para poder vender el paquete.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedSalidas.map((salida, index) => (
                <div key={salida.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                        Fecha {index + 1}
                      </div>
                      <div className="text-lg font-bold text-gray-900">{formatShortDate(salida.fecha)}</div>
                      <div className="text-sm font-medium text-gray-600">
                        ${Number(salida.precio || 0).toLocaleString('es-AR')} ARS
                      </div>
                      {salida.observaciones ? <div className="text-sm text-gray-500">{salida.observaciones}</div> : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => editSalida(salida)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                      <Button type="button" variant="outline" onClick={() => removeSalida(salida.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
