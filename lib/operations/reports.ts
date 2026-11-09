import { ageAt, ageBand, dateKey, isCashPayment, reservationFinancials, signedPayment, type BusinessReservation } from './calculations.ts';
import type { Counterparty, LedgerEntry, PaymentRecord } from './types';
import { currencyCode, currencyIssues } from './currency.ts';

export type ReportFilters = {
  from: string; to: string; dateBy: 'sale' | 'departure' | 'payment'; currency: string;
  packageId: string; nationality: string; age: string; vendorId: string; hotelId: string;
  providerId: string; method: string; status: string;
  channel: string;
};
export type ReportData = {
  reservations: BusinessReservation[]; payments: PaymentRecord[]; ledger: LedgerEntry[];
  counterparties: Counterparty[]; packages: Array<{ id: string; titulo?: unknown; visible?: unknown }>;
};
export type ReportRow = Record<string, string | number | null>;
export type ReportSection = { title: string; rows: ReportRow[] };
export function inPeriod(date: string, f: Pick<ReportFilters, 'from' | 'to'>) {
  return !!date && (!f.from || date >= f.from) && (!f.to || date <= f.to);
}
export function travelers(r: BusinessReservation) {
  const people = [{ name: r.customerName ?? '', nationality: r.customerCountry?.trim() || 'Sin informar', birthDate: r.customerBirthDate },
    ...(r.passengerDetails ?? []).map((p) => ({ name: `${p.firstName} ${p.lastName}`.trim(), nationality: p.nationality?.trim() || 'Sin informar', birthDate: p.birthDate }))];
  while (people.length < r.people) people.push({ name: '', nationality: 'Sin informar', birthDate: undefined });
  return people.slice(0, r.people).map((p) => ({ ...p, age: ageAt(p.birthDate, r.date), band: ageBand(ageAt(p.birthDate, r.date)) }));
}
function paymentIsInScope(p: PaymentRecord, f: ReportFilters) {
  return !!currencyCode(p.currency) && currencyCode(p.currency) === f.currency && (!f.method || p.method === f.method) && (f.dateBy !== 'payment' || inPeriod(dateKey(p.occurredAt ?? p.createdAt), f));
}
export function filterReservations(data: ReportData, f: ReportFilters, includeAllStates = false) {
  const paymentReservations = new Set(data.payments.filter((p) => isCashPayment(p) && paymentIsInScope(p, f)).map((p) => p.reservationId));
  return data.reservations.filter((r) => {
    if (!currencyCode(r.currency) || currencyCode(r.currency) !== f.currency || (f.status ? r.status !== f.status : !includeAllStates && (r.status === 'cancelled' || r.status === 'pending'))) return false;
    if (f.dateBy === 'payment' ? !paymentReservations.has(r.id) : !inPeriod(f.dateBy === 'departure' ? r.date : dateKey(r.createdAt), f)) return false;
    if (f.packageId && (r.packageId ?? r.experienceId) !== f.packageId) return false;
    if (f.vendorId && r.referredBy?.vendorId !== f.vendorId) return false;
    if (f.hotelId && r.operations?.sellerHotelId !== f.hotelId) return false;
    if (f.providerId && !r.operations?.providers.some((p) => p.providerId === f.providerId)) return false;
    if (f.channel && r.operations?.channel !== f.channel) return false;
    if (f.method && !paymentReservations.has(r.id)) return false;
    return travelers(r).some((p) => (!f.nationality || p.nationality === f.nationality) && (!f.age || p.band === f.age));
  });
}
function groupRows(rows: Array<{ key: string; name: string; amount: number; people?: number; margin?: number | null }>): ReportRow[] {
  const map = new Map<string, { Nombre: string; Reservas: number; Pasajeros: number; Importe: number; Margen: number; Incompletas: number }>();
  for (const r of rows) {
    const row = map.get(r.key) ?? { Nombre: r.name, Reservas: 0, Pasajeros: 0, Importe: 0, Margen: 0, Incompletas: 0 };
    row.Reservas++; row.Pasajeros += r.people ?? 0; row.Importe += r.amount;
    if (r.margin === null) row.Incompletas++; else row.Margen += r.margin ?? 0;
    map.set(r.key, row);
  }
  return [...map.values()].map((r) => ({ ...r, Margen: r.Incompletas ? null : r.Margen })).sort((a, b) => b.Importe - a.Importe);
}
export function buildReport(data: ReportData, filters: ReportFilters) {
  const selected = filterReservations(data, filters);
  const facts = selected.map((r) => ({ r, f: reservationFinancials(r, data.payments, data.ledger) }));
  const ids = new Set(selected.map((r) => r.id));
  const payments = data.payments.filter((p) => ids.has(p.reservationId) && isCashPayment(p) && paymentIsInScope(p, filters));
  const matchingPeople = selected.filter((r) => r.status !== 'cancelled').flatMap((r) => travelers(r).filter((p) => (!filters.nationality || filters.nationality === p.nationality) && (!filters.age || filters.age === p.band)));
  const nationality = new Map<string, number>(); const ages = new Map<string, number>();
  matchingPeople.forEach((p) => { nationality.set(p.nationality, (nationality.get(p.nationality) ?? 0) + 1); ages.set(p.band, (ages.get(p.band) ?? 0) + 1); });
  const excursions = groupRows(facts.map(({ r, f }) => ({ key: r.packageId ?? r.experienceId ?? r.id, name: r.packageTitle ?? r.experienceTitle ?? 'Sin excursión', amount: f.gross, people: r.status === 'cancelled' ? 0 : r.people, margin: f.margin })));
  // Zero-sale products are meaningful only without filters that require a matching transaction.
  if (!filters.nationality && !filters.age && !filters.vendorId && !filters.hotelId && !filters.providerId && !filters.method && !filters.status && !filters.channel) {
    const sold = new Set(selected.map((r) => r.packageId ?? r.experienceId));
    data.packages.filter((p) => p.visible !== false && !sold.has(p.id) && (!filters.packageId || p.id === filters.packageId)).forEach((p) => excursions.push({ Nombre: String(p.titulo ?? p.id), Reservas: 0, Pasajeros: 0, Importe: 0, Margen: 0, Incompletas: 0 }));
  }
  const vendorRows = groupRows(facts.filter(({ r }) => !!r.referredBy).map(({ r, f }) => ({ key: r.referredBy!.vendorId, name: r.referredBy!.vendorName, amount: f.gross, people: r.people, margin: f.margin })));
  const hotelRows = groupRows(facts.filter(({ r }) => !!r.operations?.sellerHotelId).map(({ r, f }) => ({ key: r.operations!.sellerHotelId, name: r.operations!.sellerHotelName, amount: f.gross, people: r.people, margin: f.margin })));
  const buyers = groupRows(facts.map(({ r, f }) => ({ key: r.customerEmail?.trim().toLowerCase() || r.id, name: r.customerName ?? 'Sin informar', amount: f.gross, people: r.people })));
  const channels = groupRows(facts.map(({ r, f }) => ({ key: r.operations?.channel ?? 'Sin informar', name: r.operations?.channel ?? 'Sin informar', amount: f.gross, people: r.people, margin: f.margin })));
  const methods = new Map<string, number>();
  payments.forEach((p) => methods.set(p.method, (methods.get(p.method) ?? 0) + signedPayment(p)));
  const providerEligible = new Set(filterReservations(data, { ...filters, from: '', to: '', dateBy: 'sale', method: '' }, true).map((r) => r.id));
  const providerPayments = data.ledger.filter((e) => e.currency === filters.currency && (e.kind === 'provider_payment' || e.kind === 'reversal' && data.ledger.some((x) => x.id === e.reversalOf && x.kind === 'provider_payment')) && inPeriod(dateKey(e.occurredAt), filters) && (!filters.providerId || e.counterpartyId === filters.providerId) && (!filters.method || e.method === filters.method) && (!e.reservationId || providerEligible.has(e.reservationId)));
  const providers = new Map<string, { Proveedor: string; Pagado: number; Operaciones: number }>();
  providerPayments.forEach((e) => {
    const row = providers.get(e.counterpartyId) ?? { Proveedor: data.counterparties.find((p) => p.id === e.counterpartyId)?.name ?? 'Proveedor sin nombre', Pagado: 0, Operaciones: 0 };
    row.Pagado += e.amount * (e.kind === 'reversal' ? -1 : 1); row.Operaciones++; providers.set(e.counterpartyId, row);
  });
  const evolution = new Map<string, { Mes: string; Reservas: number; Ventas: number }>();
  facts.forEach(({ r, f }) => { const month = (filters.dateBy === 'departure' ? r.date : dateKey(r.createdAt)).slice(0, 7); const row = evolution.get(month) ?? { Mes: month, Reservas: 0, Ventas: 0 }; row.Reservas++; row.Ventas += f.gross; evolution.set(month, row); });
  const sections: ReportSection[] = [
    { title: 'Nacionalidades', rows: [...nationality].map(([Nacionalidad, Pasajeros]) => ({ Nacionalidad, Pasajeros })).sort((a, b) => b.Pasajeros - a.Pasajeros) },
    { title: 'Edades a la fecha de excursión', rows: [...ages].map(([Edad, Pasajeros]) => ({ Edad, Pasajeros })) },
    { title: 'Excursiones más vendidas', rows: [...excursions].sort((a, b) => Number(b.Reservas) - Number(a.Reservas)) },
    { title: 'Excursiones menos vendidas', rows: [...excursions].sort((a, b) => Number(a.Reservas) - Number(b.Reservas)) },
    { title: 'Rentabilidad operativa', rows: [...excursions].sort((a, b) => (b.Margen === null ? -Infinity : Number(b.Margen)) - (a.Margen === null ? -Infinity : Number(a.Margen))) },
    { title: 'Ventas por vendedor', rows: vendorRows }, { title: 'Hoteles y revendedores', rows: hotelRows },
    { title: 'Principales compradores', rows: buyers },
    { title: 'Canales de venta', rows: channels },
    { title: 'Medios de pago (cobros netos)', rows: [...methods].map(([Método, Cobrado]) => ({ Método, Cobrado })) },
    { title: 'Pagos a proveedores (fecha de pago)', rows: [...providers.values()].sort((a, b) => b.Pagado - a.Pagado) },
    { title: 'Evolución mensual de ventas', rows: [...evolution.values()].sort((a, b) => a.Mes.localeCompare(b.Mes)) },
    { title: 'Detalle de reservas', rows: facts.map(({ r, f }) => ({ 'Código de reserva': r.reservationCode || 'Sin código', Excursión: r.packageTitle ?? r.experienceTitle ?? '', Fecha: r.date, Estado: r.status, Pasajeros: r.people, Venta: f.gross, Cobrado: f.netPaid, 'Costo proveedores': f.providerCost, 'Gastos asignados': f.allocatedExpenses, 'Comisión efectivo hotel': f.hotelCashCommission, 'Comisión depósito': f.hotelDepositCommission, 'Comisión TC': f.hotelCardCommission, 'Comisión hotel': f.hotelCommission, 'Comisión vendedor': f.vendorComplete ? f.vendorCommission : null, Margen: f.margin, 'Datos completos para calcular el margen': f.margin === null ? 'No' : 'Sí' })) },
  ];
  const summary = {
    reservations: selected.length, passengers: matchingPeople.length,
    sales: facts.reduce((s, { f }) => s + f.gross, 0), collected: payments.reduce((s, p) => s + signedPayment(p), 0),
    margin: facts.some(({ f }) => f.margin === null) ? null : facts.reduce((s, { f }) => s + (f.margin ?? 0), 0),
    incompleteCosts: facts.filter(({ f }) => f.margin === null).length,
    missingNationality: matchingPeople.filter((p) => p.nationality === 'Sin informar').length,
    missingAge: matchingPeople.filter((p) => p.age === null).length,
  };
  const previous = previousPeriod(filters);
  const previousFacts = previous ? filterReservations(data, previous).map((r) => reservationFinancials(r, data.payments, data.ledger)) : [];
  const previousSales = previousFacts.reduce((s, f) => s + f.gross, 0);
  return { filters, summary, sections, currencyIssues: currencyIssues(data), previous: previous ? { from: previous.from, to: previous.to, sales: previousSales, changePercent: previousSales ? (summary.sales - previousSales) / previousSales * 100 : null } : null, generatedAt: new Date().toISOString() };
}
function previousPeriod(f: ReportFilters): ReportFilters | null {
  if (!f.from || !f.to) return null;
  const start = Date.parse(`${f.from}T00:00:00Z`); const end = Date.parse(`${f.to}T00:00:00Z`);
  const duration = end - start + 86400000;
  return { ...f, from: new Date(start - duration).toISOString().slice(0, 10), to: new Date(start - 86400000).toISOString().slice(0, 10) };
}
export type ReportResult = ReturnType<typeof buildReport>;
