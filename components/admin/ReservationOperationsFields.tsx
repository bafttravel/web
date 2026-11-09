'use client';
import { useEffect, useState } from 'react';
import { operationsFetch } from '@/lib/operations/client';
import type { Counterparty, ReservationOperationsInput } from '@/lib/operations/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AdminTimePicker from './AdminTimePicker';
import { salesChannels, salesChannelLabel } from '@/lib/admin/sales-channels';

export default function ReservationOperationsFields({ value, onChange }: { value: ReservationOperationsInput; onChange: (v: ReservationOperationsInput) => void }) {
  const [hotels, setHotels] = useState<Counterparty[]>([]);
  const [error, setError] = useState('');
  const [sellerMode, setSellerMode] = useState<'direct' | 'hotel'>(value.sellerHotelId ? 'hotel' : 'direct');
  useEffect(() => { operationsFetch<{ counterparties: Counterparty[] }>('/api/admin/counterparties').then((d) => setHotels(d.counterparties.filter((p) => p.kind === 'hotel'))).catch((e) => setError(e.message)); }, []);
  useEffect(() => setSellerMode(value.sellerHotelId ? 'hotel' : 'direct'), [value.sellerHotelId]);
  const selectHotel = (id: string) => { const hotel = hotels.find((h) => h.id === id); onChange({ ...value, pickupHotelId: id, pickupAddress: hotel?.address ?? '' }); };
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">Venta y comisión</legend>
      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="admin-choice-field"><legend>¿Quién realizó la venta?</legend><div className="admin-flow-options"><button type="button" aria-pressed={sellerMode === 'direct'} onClick={() => { setSellerMode('direct'); onChange({ ...value, sellerHotelId: '', commissionMethod: '' }); }}>Baftravel</button><button type="button" aria-pressed={sellerMode === 'hotel'} onClick={() => setSellerMode('hotel')}>Hotel</button></div></fieldset>
        {sellerMode === 'hotel' && <label className="space-y-1 text-sm">Hotel<select aria-label="Hotel que realizó la venta" className="h-10 w-full rounded-md border bg-white px-2" required value={value.sellerHotelId} onChange={(e) => onChange({ ...value, sellerHotelId: e.target.value })}><option value="">Seleccioná</option>{hotels.filter((h) => h.active || h.id === value.sellerHotelId).map((h) => <option key={h.id} value={h.id}>{h.name}{!h.active ? ' (inactivo)' : ''}</option>)}</select></label>}
        <label className="space-y-1 text-sm">Canal de venta<select className="h-10 w-full rounded-md border bg-white px-2" value={value.channel} onChange={(e) => onChange({ ...value, channel: e.target.value as ReservationOperationsInput['channel'] })}>{salesChannels.map((channel) => <option key={channel.value} value={channel.value}>{channel.label}</option>)}{!salesChannels.some((channel) => channel.value === String(value.channel)) && <option value={value.channel}>{salesChannelLabel(value.channel)}</option>}</select></label>
        {sellerMode === 'hotel' && <label className="space-y-1 text-sm">Medio de pago de la reserva<select aria-label="Medio de pago de la reserva" className="h-10 w-full rounded-md border bg-white px-2" required value={value.commissionMethod} onChange={(e) => onChange({ ...value, commissionMethod: e.target.value as ReservationOperationsInput['commissionMethod'] })}><option value="">Seleccioná</option><option value="cash">Pesos / efectivo</option><option value="transfer">Transferencia / depósito</option><option value="card">Tarjeta de crédito</option></select></label>}
      </div>
    </fieldset>
    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">Punto de retiro</legend>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">Dónde se retira al pasajero<select className="h-10 w-full rounded-md border bg-white px-2" value={value.pickupType} onChange={(e) => onChange({ ...value, pickupType: e.target.value as 'hotel' | 'other', pickupHotelId: '', pickupAddress: '' })}><option value="hotel">En un hotel</option><option value="other">En otro lugar</option></select></label>
        {value.pickupType === 'hotel' && <label className="space-y-1 text-sm">Hotel de retiro<select className="h-10 w-full rounded-md border bg-white px-2" required value={value.pickupHotelId} onChange={(e) => selectHotel(e.target.value)}><option value="">Seleccioná un hotel</option>{hotels.filter((h) => h.active || h.id === value.pickupHotelId).map((h) => <option key={h.id} value={h.id}>{h.name}{!h.active ? ' (inactivo)' : ''}</option>)}</select></label>}
        <div><Label htmlFor="pickup-address">{value.pickupType === 'hotel' ? 'Dirección del hotel' : 'Dirección / punto de encuentro'}</Label><Input id="pickup-address" value={value.pickupAddress} readOnly={value.pickupType === 'hotel'} placeholder={value.pickupType === 'other' ? 'Ingresá el punto de encuentro' : ''} onChange={(e) => onChange({ ...value, pickupAddress: e.target.value })} /></div>
        <div><Label htmlFor="pickup-time">Horario de retiro (24 h)</Label><AdminTimePicker id="pickup-time" label="Horario de retiro" value={value.pickupTime} onValueChange={(pickupTime) => onChange({ ...value, pickupTime })} /></div>
      </div>
    </fieldset>
    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">Información operativa</legend>
      <div><Label htmlFor="operational-notes">Indicaciones para el equipo</Label><textarea id="operational-notes" className="min-h-20 w-full rounded-md border bg-white p-2 text-sm" value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} /></div>
      <div><Label htmlFor="passenger-diet">Dieta / alergias del titular</Label><Input id="passenger-diet" value={value.diet} onChange={(e) => onChange({ ...value, diet: e.target.value })} /></div>
    </fieldset>
  </div>;
}
