'use client';
import AdminDatePicker from './AdminDatePicker';
import { adminDateLabel } from '@/lib/admin/dates';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Paquete } from '@/types';
import { toast } from 'sonner';

type ResultItem = {
  id: string;
  reservationCode?: string;
  customerName: string;
  customerEmail: string;
  status: string;
  commercialStatusLabel?: string;
  operationalStatusLabel?: string;
  paymentStatus?: string;
  paymentStatusLabel?: string;
  packageTitle: string;
  date: string;
  people: number;
  selectedSeats?: string[] | null;
  amountTotal?: number;
  currency?: string;
  orderId?: string | null;
  vendorName?: string | null;
  mercadoPagoPaymentId?: string | null;
};

function formatDateLabel(date: string) {
  return date === 'sin-fecha' ? 'A coordinar' : adminDateLabel(date);
}

function formatAmount(amountTotal: number | undefined, currency: string | undefined) {
  const cents = Number(amountTotal ?? 0);
  const c = String(currency ?? '').toUpperCase() || 'ARS';
  const v = cents / 100;
  if (c === 'ARS') return `$${v.toLocaleString('es-AR')}`;
  if (c === 'BRL') return `R$ ${v.toLocaleString('pt-BR')}`;
  return `${v.toFixed(2)} ${c}`;
}

export default function ReservaSearchDashboard({ paquetes }: { paquetes: Paquete[] }) {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [packageId, setPackageId] = useState<string>('all');
  const [date, setDate] = useState<string>('');
  const [status, setStatus] = useState<string>('all');
  const [paymentMethod, setPaymentMethod] = useState<string>('all');
  const [seat, setSeat] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ResultItem[]>([]);

  const search = async () => {
    if (!user) return;
    const queryText = q.trim();
    if (queryText.length < 2) {
      toast.error('Ingresá al menos 2 caracteres');
      return;
    }
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      params.set('q', queryText);
      if (packageId !== 'all') params.set('packageId', packageId);
      if (date) params.set('date', date);
      if (status !== 'all') params.set('status', status);
      if (paymentMethod !== 'all') params.set('paymentMethod', paymentMethod);
      if (seat.trim()) params.set('seat', seat.trim());
      const res = await fetch(`/api/admin/reservas/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || 'No se pudo buscar');
      }
      const json = await res.json();
      setItems(Array.isArray(json?.items) ? json.items : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo buscar');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const paquetesOptions = useMemo(() => {
    return [...paquetes].sort((a, b) => String(a.titulo).localeCompare(String(b.titulo)));
  }, [paquetes]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-gray-900">Buscar ventas</h1>
          <p className="text-sm text-gray-500">
            Búsqueda pragmática: código/id/orderId/email/nombre/teléfono/DNI/butaca y filtros.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/ventas">Volver al listado</Link>
        </Button>
      </div>

      <Card className="bg-white/90 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-900">Criterios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Búsqueda</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, id, orderId, email, nombre, DNI, teléfono, MP paymentId" />
            </div>
            <div className="space-y-1">
              <Label>Butaca (opcional)</Label>
              <Input value={seat} onChange={(e) => setSeat(e.target.value)} placeholder="Ej: 12" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Paquete</Label>
              <Select value={packageId} onValueChange={setPackageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {paquetesOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Salida</Label>
              <AdminDatePicker aria-label="Fecha de excursión" value={date} onValueChange={setDate} />
            </div>
            <div className="space-y-1">
              <Label>Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="reserved">reserved</SelectItem>
                  <SelectItem value="completed">completed</SelectItem>
                  <SelectItem value="cancelled">cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Método</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="mercadopago">mercadopago</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => { setItems([]); setQ(''); setSeat(''); }} disabled={loading}>
              Limpiar
            </Button>
            <Button onClick={() => void search()} disabled={loading}>
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/90 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-900">Resultados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <div className="text-sm text-gray-600">Sin resultados.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">Código</th>
                    <th className="py-2 pr-4">Cliente</th>
                    <th className="py-2 pr-4">Paquete</th>
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Pago</th>
                    <th className="py-2 pr-4">Butacas</th>
                    <th className="py-2 pr-4">Total</th>
                    <th className="py-2 pr-4">Order</th>
                    <th className="py-2 pr-4">Vendedor</th>
                    <th className="py-2 pr-0">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="py-3 pr-4 font-mono text-xs text-gray-900">{r.reservationCode || r.id.slice(0, 8)}</td>
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-gray-900">{r.customerName || '—'}</div>
                        <div className="text-xs text-gray-500">{r.customerEmail || '—'}</div>
                        {r.mercadoPagoPaymentId ? <div className="text-xs text-gray-400">MP: {r.mercadoPagoPaymentId}</div> : null}
                      </td>
                      <td className="py-3 pr-4">{r.packageTitle}</td>
                      <td className="py-3 pr-4">{formatDateLabel(r.date)}</td>
                      <td className="py-3 pr-4">
                        <div>{r.commercialStatusLabel || r.status}</div>
                        <div className="text-xs text-gray-500">{r.operationalStatusLabel || '—'}</div>
                      </td>
                      <td className="py-3 pr-4">{r.paymentStatusLabel || r.paymentStatus || '—'}</td>
                      <td className="py-3 pr-4">{r.selectedSeats?.length ? r.selectedSeats.join(', ') : '—'}</td>
                      <td className="py-3 pr-4">{formatAmount(r.amountTotal, r.currency)}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-gray-600">{r.orderId || '—'}</td>
                      <td className="py-3 pr-4">{r.vendorName || '—'}</td>
                      <td className="py-3 pr-0">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/admin/ventas/${encodeURIComponent(r.id)}`}>Ver detalle</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
