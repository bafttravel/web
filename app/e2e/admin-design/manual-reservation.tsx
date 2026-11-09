'use client';
import { useState } from 'react';
import ManualReservationFlow from '@/components/admin/ManualReservationFlow';
import { EMPTY_RESERVATION_OPERATIONS, type Counterparty } from '@/lib/operations/types';
import { Button } from '@/components/ui/button';
import { manualReservationPaymentFields } from '@/lib/admin/manual-reservation';

const hotels: Counterparty[] = ['Hotel Lago Austral', 'Patagonia Suites'].map((name, i) => ({ id: `hotel-${i}`, kind: 'hotel', name, address: i ? 'Calle Sur 200' : 'Avenida Lago 100', taxId: '', active: true, email: '', phone: '', contact: '', notes: '', commissions: { cash: { type: 'percent', value: 10, currency: 'ARS' }, bank: { type: 'percent', value: 10, currency: 'ARS' } } }));
const catalog: Counterparty[] = [
  ...hotels,
  ...Array.from({ length: 9 }, (_, i) => ({ ...hotels[0], id: `extra-${i}`, name: `Hotel de prueba ${i + 1}` })),
  { ...hotels[0], id: 'inactive-hotel', name: 'Hotel inactivo de prueba', active: false },
  { ...hotels[0], id: 'provider-only', kind: 'provider', name: 'Proveedor de prueba' },
];
export const loadManualReservationFixtureHotels = async () => ({ counterparties: catalog });
export default function ManualReservationPreview() {
  const [operations, setOperations] = useState({ ...EMPTY_RESERVATION_OPERATIONS });
  const [saved, setSaved] = useState('');
  return <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); setSaved(JSON.stringify({ operations, ...manualReservationPaymentFields(false) })); }}><h1>Reserva manual · vista de prueba</h1><ManualReservationFlow value={operations} onChange={setOperations} total={20000000} currency="ARS" loader={loadManualReservationFixtureHotels} /><Button>Probar reserva sin guardar</Button><output className="block break-all" aria-label="Datos de reserva de prueba">{saved}</output></form>;
}
