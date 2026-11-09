'use client';

import { useEffect, useState } from 'react';
import { operationsFetch } from '@/lib/operations/client';
import type { Counterparty, ReservationOperationsInput } from '@/lib/operations/types';
import { salesChannels, salesChannelLabel } from '@/lib/admin/sales-channels';
import { Input } from '@/components/ui/input';
import AdminTimePicker from './AdminTimePicker';

export const loadReservationHotels = () => operationsFetch<{ counterparties: Counterparty[] }>('/api/admin/counterparties');

export default function ManualReservationFlow({ value, onChange, total, currency, loader = loadReservationHotels, embedded = false, onHotelsLoaded }: {
  value: ReservationOperationsInput; onChange: (value: ReservationOperationsInput) => void;
  total: number; currency: string;
  loader?: typeof loadReservationHotels; embedded?: boolean; onHotelsLoaded?: (hotels: Counterparty[]) => void;
}) {
  const [hotels, setHotels] = useState<Counterparty[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sellerMode, setSellerMode] = useState<'direct' | 'hotel'>(value.sellerHotelId ? 'hotel' : 'direct');
  const pickupMode = value.pickupType;
  const [missingHotel, setMissingHotel] = useState(false);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = await loader(); const items = data.counterparties.filter((party) => party.kind === 'hotel');
      setHotels(items); onHotelsLoaded?.(items);
    } catch { setError('No se pudieron cargar los hoteles. Podés reintentar sin perder lo ingresado.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); // Loader and callback are stable for this form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const seller = hotels.find((hotel) => hotel.id === value.sellerHotelId);
  const pickup = hotels.find((hotel) => hotel.id === value.pickupHotelId);
  const options = (selected: string) => hotels.filter((hotel) => hotel.active || hotel.id === selected).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const money = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount / 100);
  const chooseSellerMode = (mode: 'direct' | 'hotel') => {
    if (mode === sellerMode) return;
    setSellerMode(mode); setMissingHotel(false);
    onChange({ ...value, sellerHotelId: '', commissionMethod: '' });
  };
  const chooseSeller = (hotel: Counterparty) => {
    onChange({ ...value, sellerHotelId: hotel.id });
    setMissingHotel(false);
  };
  const choosePickup = (mode: 'hotel' | 'other') => {
    if (mode === pickupMode) return;
    onChange({ ...value, pickupType: mode, pickupHotelId: '', pickupAddress: '' });
    setMissingHotel(false);
  };
  const hotelOptions = (selected: string) => <>
    <option value="" disabled>{loading ? 'Cargando hoteles…' : error ? 'No se pudieron cargar los hoteles' : !options(selected).length ? 'No hay hoteles disponibles' : 'Seleccioná un hotel'}</option>
    {options(selected).map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}{!hotel.active ? ' (inactivo)' : ''}</option>)}
  </>;
  const missing = () => { setMissingHotel(true); document.getElementById('reservation-pickup')?.scrollIntoView({ block: 'start' }); };

  return <div className={`admin-manual-flow${embedded ? ' admin-manual-flow-embedded' : ''}`}>
    <section id="reservation-pickup" className="admin-reservation-section">
       <header className="admin-reservation-section-heading"><h2>03 · Venta y retiro</h2></header>
       <div className="admin-sale-fields">
         <fieldset className="admin-choice-field"><legend>¿Quién realizó la venta?</legend><div className="admin-flow-options"><button type="button" aria-pressed={sellerMode === 'direct'} onClick={() => chooseSellerMode('direct')}>Baftravel</button><button type="button" aria-pressed={sellerMode === 'hotel'} onClick={() => chooseSellerMode('hotel')}>Hotel</button></div></fieldset>
         <label>Canal de venta<select aria-label="Canal de venta" value={value.channel} onChange={(e) => onChange({ ...value, channel: e.target.value as ReservationOperationsInput['channel'] })}>{salesChannels.map((channel) => <option key={channel.value} value={channel.value}>{channel.label}</option>)}{!salesChannels.some((channel) => channel.value === String(value.channel)) && <option value={value.channel}>{salesChannelLabel(value.channel)}</option>}</select></label>
         {sellerMode === 'hotel' && <div className="admin-flow-hotel">
           <label>Hotel<select aria-label="Hotel que realizó la venta" value={value.sellerHotelId} disabled={loading || !!error || !options(value.sellerHotelId).length} required onChange={(e) => { const hotel = hotels.find((item) => item.id === e.target.value); if (hotel) chooseSeller(hotel); }} onInvalid={() => setMissingHotel(true)}>{hotelOptions(value.sellerHotelId)}</select></label>
           <label>Medio de pago de la reserva<select aria-label="Medio de pago de la reserva" value={value.commissionMethod} required onChange={(e) => onChange({ ...value, commissionMethod: e.target.value as ReservationOperationsInput['commissionMethod'] })}><option value="">Seleccioná</option><option value="cash">Pesos / efectivo</option><option value="transfer">Transferencia / depósito</option><option value="card">Tarjeta de crédito</option></select></label>
          <input className="admin-date-validation" aria-hidden="true" tabIndex={-1} value={value.sellerHotelId} onChange={() => {}} required onInvalid={(e) => { e.preventDefault(); missing(); }} />
          {loading && <p role="status">Cargando hoteles…</p>}
          {!loading && !error && !options(value.sellerHotelId).length && <p>No hay hoteles activos cargados. Creá o activá un hotel en Hoteles para seleccionarlo.</p>}
        </div>}
      </div>
      {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Reintentar</button></p>}
      {missingHotel && sellerMode === 'hotel' && !value.sellerHotelId && <p role="alert">Seleccioná el hotel vendedor antes de continuar.</p>}
      {missingHotel && pickupMode === 'hotel' && !value.pickupHotelId && <p role="alert">Seleccioná el hotel de retiro antes de continuar.</p>}
      <div className="admin-pickup-fields">
        <div className="admin-pickup-location">
          <fieldset className="admin-choice-field"><legend>Punto de retiro</legend><div className="admin-flow-options"><button type="button" aria-pressed={pickupMode === 'hotel'} onClick={() => choosePickup('hotel')}>Hotel</button><button type="button" aria-pressed={pickupMode === 'other'} onClick={() => choosePickup('other')}>Otro</button></div></fieldset>
          {pickupMode === 'hotel' && <label>Hotel de retiro<select aria-label="Hotel de retiro" value={value.pickupHotelId} disabled={loading || !!error || !options(value.pickupHotelId).length} required onChange={(e) => { const hotel = hotels.find((item) => item.id === e.target.value); if (hotel) { onChange({ ...value, pickupType: 'hotel', pickupHotelId: hotel.id, pickupAddress: hotel.address }); setMissingHotel(false); } }}>{hotelOptions(value.pickupHotelId)}</select></label>}
          {pickupMode !== 'other' ? <div className="admin-flow-selected"><strong>{pickup?.name || 'Seleccioná el hotel para completar el retiro'}</strong><p>{value.pickupAddress || 'Falta la dirección del retiro.'}</p>{value.pickupHotelId && !pickup?.address && <label>Dirección de retiro<Input aria-label="Dirección de retiro" value={value.pickupAddress} onChange={(e) => onChange({ ...value, pickupAddress: e.target.value })} /></label>}<input className="admin-date-validation" aria-hidden="true" tabIndex={-1} value={value.pickupHotelId} onChange={() => {}} required onInvalid={(e) => { e.preventDefault(); missing(); }} /></div> : <label>Punto de encuentro (opcional)<Input aria-label="Punto de encuentro" placeholder="Dirección o lugar de encuentro" value={value.pickupAddress} onChange={(e) => onChange({ ...value, pickupAddress: e.target.value })} /></label>}
        </div>
        <div className="admin-pickup-time"><label htmlFor="reservation-pickup-time">Horario de retiro</label><AdminTimePicker id="reservation-pickup-time" label="Horario de retiro" appearance="field" value={value.pickupTime} onValueChange={(pickupTime) => onChange({ ...value, pickupTime })} /><p className="admin-caption">Formato de 24 horas. Si todavía no lo conocés, queda a confirmar.</p></div>
      </div>
    </section>
    {!embedded && <aside className="admin-flow-summary" aria-label="Resumen de venta y retiro"><h3>Resumen de la reserva</h3><p>Venta: <strong>{sellerMode === 'hotel' ? seller?.name || 'Hotel por seleccionar' : 'Baftravel'}</strong> · {salesChannelLabel(value.channel)}</p><p>Retiro: <strong>{pickup?.name || value.pickupAddress || 'A confirmar'}</strong> · {value.pickupTime || 'Horario a confirmar'}</p><p>Total <strong>{money(total)}</strong></p></aside>}
  </div>;
}
