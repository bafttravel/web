/** Customer-facing voucher data only: never include internal IDs or financial costs. */
export type VoucherSource = {
  reservationCode?: unknown; customerName?: unknown; packageTitle?: unknown; experienceTitle?: unknown;
  date?: unknown; people?: unknown; peopleAdults?: unknown; peopleMinors?: unknown;
  createdByName?: unknown; confirmedByName?: unknown;
  createdByAdmin?: unknown; createdByVendorId?: unknown; status?: unknown;
  statusHistory?: Array<{ status?: unknown; actor?: unknown }>;
  operations?: { pickupHotelName?: unknown; pickupAddress?: unknown; pickupTime?: unknown; notes?: unknown };
  selectedSeats?: unknown;
};
export type VoucherData = {
  code: string; customer: string; service: string; date: string; time: string; pickup: string;
  people: string; adults: string; minors: string; confirmedBy: string; bookedBy: string; status: string;
  details: Array<{ label: string; value: string }>;
};
const text = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim() : '';
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

export function voucherData(source: VoucherSource): VoucherData {
  const op = source.operations;
  const people = count(source.people);
  const adults = count(source.peopleAdults);
  const minors = count(source.peopleMinors);
  // Historical reservations may have only a total. Do not invent an age breakdown.
  const validBreakdown = adults !== null && minors !== null && (people === null || adults + minors === people);
  const iso = text(source.date);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : null;
  const date = parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso.split('-').reverse().join('/') : 'A coordinar';
  const time = text(op?.pickupTime);
  const details: VoucherData['details'] = [];
  if (Array.isArray(source.selectedSeats) && source.selectedSeats.length) details.push({ label: 'Butacas / Seats', value: source.selectedSeats.map(text).filter(Boolean).join(', ') });
  if (text(op?.notes)) details.push({ label: 'Indicaciones / Instructions', value: text(op?.notes) });
  const confirmation = Array.isArray(source.statusHistory) ? source.statusHistory.find((entry) => entry && (entry.status === 'reserved' || entry.status === 'completed')) : undefined;
  const actor = ({ admin: 'Administración', vendor: 'Vendedor', system: 'Sistema' } as Record<string, string>)[text(confirmation?.actor)];
  return {
    code: text(source.reservationCode) || 'Sin código', customer: text(source.customerName) || 'Sin informar',
    service: text(source.packageTitle) || text(source.experienceTitle) || 'Servicio a confirmar', date,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : 'A confirmar',
    pickup: [text(op?.pickupHotelName), text(op?.pickupAddress)].filter(Boolean).join(' — ') || 'A confirmar',
    people: people === null ? 'Sin informar' : String(people),
    adults: validBreakdown ? String(adults) : 'Sin informar', minors: validBreakdown ? String(minors) : 'Sin informar',
    confirmedBy: text(source.confirmedByName) || actor || 'Sin informar',
    bookedBy: text(source.createdByName) || (text(source.createdByVendorId) ? 'Vendedor' : source.createdByAdmin === true ? 'Administración' : source.createdByAdmin === false ? 'Web' : 'Sin informar'),
    status: ({ pending: 'Pendiente / Pending', reserved: 'Reservada / Reserved', completed: 'Completada / Completed', cancelled: 'CANCELADA / CANCELLED' } as Record<string, string>)[text(source.status)] || '', details,
  };
}

export function voucherFilename(code: string): string {
  return `voucher-${code.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'reserva'}.pdf`;
}
