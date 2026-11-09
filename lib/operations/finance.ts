import { collectorForPayment, dateKey, reservationFinancials, signedPayment } from './calculations.ts';
import type { ReportData, ReportRow } from './reports';
import type { LedgerEntry } from './types';
import { currencyCode, currencyIssues } from './currency.ts';
import { hotelReceiptStatus, type HotelReceiptStatus } from '../admin/payments.ts';

export function effectiveLedger(ledger: LedgerEntry[]) {
  return ledger.filter((e) => e.kind !== 'reversal' && !ledger.some((x) => x.reversalOf === e.id));
}
export function buildFinancialDashboard(data: ReportData, currency: string) {
  const reservations = data.reservations.filter((r) => !!currencyCode(r.currency) && currencyCode(r.currency) === currency);
  const obligations = reservations.flatMap((r) => {
    const f = reservationFinancials(r, data.payments, data.ledger);
    const rows: Array<{ id: string; reservationId: string; reservationCode: string; counterpartyId: string; name: string; type: 'hotel' | 'provider'; date: string; excursion: string; customer: string; people: number; payable: number; receivable: number; provisional: boolean; receiptStatus?: HotelReceiptStatus }> = [];
    if (r.operations?.sellerHotelId) rows.push({ id: `${r.id}:hotel`, reservationId: r.id, reservationCode: r.reservationCode || 'Sin código', counterpartyId: r.operations.sellerHotelId, name: r.operations.sellerHotelName, type: 'hotel', date: r.date, excursion: r.packageTitle ?? r.experienceTitle ?? '', customer: r.customerName ?? '', people: r.people, payable: f.hotelPayable, receivable: f.hotelReceivable, provisional: f.hotelPaymentProvisional, receiptStatus: hotelReceiptStatus(f) });
    if (r.status !== 'cancelled' || f.serviceExecuted) f.providers.forEach((p) => {
      const paid = effectiveLedger(data.ledger).filter((e) => e.kind === 'provider_payment' && e.reservationId === r.id && e.counterpartyId === p.providerId && currencyCode(e.currency) === currency).reduce((s, e) => s + e.amount, 0);
      rows.push({ id: `${r.id}:${p.providerId}`, reservationId: r.id, reservationCode: r.reservationCode || 'Sin código', counterpartyId: p.providerId, name: p.name, type: 'provider', date: r.date, excursion: r.packageTitle ?? r.experienceTitle ?? '', customer: r.customerName ?? '', people: r.people, payable: Math.max(0, (p.amount ?? 0) - paid), receivable: 0, provisional: !f.moneyComplete || p.amount === null || !f.serviceExecuted });
    });
    return rows;
  });
  const balances = new Map<string, ReportRow>();
  obligations.filter((o) => o.type === 'hotel').forEach((o) => {
    const row = balances.get(o.counterpartyId) ?? { HotelId: o.counterpartyId, Hotel: o.name, 'BAFT debe': 0, 'Hotel debe': 0, Saldo: 0 };
    row['BAFT debe'] = Number(row['BAFT debe']) + o.payable; row['Hotel debe'] = Number(row['Hotel debe']) + o.receivable; row.Saldo = Number(row['Hotel debe']) - Number(row['BAFT debe']); balances.set(o.counterpartyId, row);
  });
  const reservationsById = new Map(data.reservations.map((r) => [r.id, r]));
  const cash = [
    ...data.payments.filter((p) => !!currencyCode(p.currency) && currencyCode(p.currency) === currency && collectorForPayment(reservationsById.get(p.reservationId)?.operations?.sellerHotelId, p.method) !== 'hotel' && !['credit_balance', 'saldo_a_favor'].includes(p.method) && signedPayment(p) !== 0).map((p) => ({ id: p.id, date: dateKey(p.occurredAt ?? p.createdAt), method: p.method, amount: signedPayment(p), note: signedPayment(p) < 0 ? 'Devolución de reserva' : 'Cobro de reserva', reservationId: p.reservationId, counterpartyId: reservationsById.get(p.reservationId)?.operations?.sellerHotelId ?? '', receiptUrl: '' })),
    ...data.ledger.filter((e) => !!currencyCode(e.currency) && currencyCode(e.currency) === currency && e.kind !== 'offset').map((e) => {
      const original = e.kind === 'reversal' ? data.ledger.find((x) => x.id === e.reversalOf) : e;
      const sign = original && ['hotel_receipt', 'income'].includes(original.kind) ? 1 : -1;
      return { id: e.id, date: dateKey(e.occurredAt), method: e.method, amount: e.amount * sign * (e.kind === 'reversal' ? -1 : 1), note: e.note, reservationId: e.reservationId, counterpartyId: e.counterpartyId, receiptUrl: e.receiptUrl };
    }),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return { obligations, balances: [...balances.values()], cash, currencyIssues: currencyIssues(data), totals: { payable: obligations.filter((o) => o.type === 'hotel').reduce((s, o) => s + o.payable, 0), receivable: obligations.filter((o) => o.type === 'hotel').reduce((s, o) => s + o.receivable, 0), providers: obligations.filter((o) => o.type === 'provider').reduce((s, o) => s + o.payable, 0) } };
}

export type HotelBalanceObligation = ReturnType<typeof buildFinancialDashboard>['obligations'][number];
export type HotelBalanceFilters = { hotelId?: string; excursion?: string; from?: string; to?: string; state?: 'pending' | 'settled' | 'all' };

export function filterHotelBalanceObligations(obligations: HotelBalanceObligation[], filters: HotelBalanceFilters = {}) {
  return obligations.filter((row) => {
    if (row.type !== 'hotel') return false;
    if (filters.hotelId && row.counterpartyId !== filters.hotelId) return false;
    if (filters.excursion && row.excursion !== filters.excursion) return false;
    if (filters.from && (!row.date || row.date === 'sin-fecha' || row.date < filters.from)) return false;
    if (filters.to && (!row.date || row.date === 'sin-fecha' || row.date > filters.to)) return false;
    const needsReview = row.provisional || row.receiptStatus === 'review';
    if (filters.state === 'settled') return row.payable === 0 && row.receivable === 0 && !needsReview;
    if (filters.state === 'pending' || !filters.state) return row.payable > 0 || row.receivable > 0 || needsReview;
    return true;
  });
}

export function hotelBalanceTotals(obligations: HotelBalanceObligation[]) {
  const hotels = obligations.filter((row) => row.type === 'hotel');
  const payable = hotels.reduce((sum, row) => sum + (row.provisional ? 0 : row.payable), 0);
  const receivable = hotels.reduce((sum, row) => sum + (row.receiptStatus === 'review' ? 0 : row.receivable), 0);
  return { payable, receivable, balance: payable - receivable };
}

export type BaftravelLiquidationData = {
  reservations: Array<{
    reservationId: string;
    reservationCode: string;
    hotelId: string;
    date: string;
    customerName: string;
    email: string;
    phone: string;
    pax: string[];
    people: number;
    excursion: string;
    channel: string;
    total: number;
    commission: number | null;
    commissionNeedsReview: boolean;
    providers: Array<{ id: string; name: string; amount: number | null }>;
  }>;
};

export function summarizeBaftravelLiquidation(reservations: Array<Omit<BaftravelLiquidationData['reservations'][number], 'email' | 'phone'>>) {
  const channels = new Map<string, { channel: string; count: number; total: number; commission: number; commissionNeedsReview: number }>();
  const totals = reservations.reduce((summary, reservation) => {
    summary.total += reservation.total;
    if (reservation.commission === null) summary.commissionNeedsReview++;
    else summary.commission += reservation.commission;
    const channel = reservation.channel || 'other';
    const current = channels.get(channel) ?? { channel, count: 0, total: 0, commission: 0, commissionNeedsReview: 0 };
    current.count++;
    current.total += reservation.total;
    if (reservation.commission === null) current.commissionNeedsReview++;
    else current.commission += reservation.commission;
    channels.set(channel, current);
    return summary;
  }, { count: reservations.length, total: 0, commission: 0, commissionNeedsReview: 0 });

  return { ...totals, channels: [...channels.values()] };
}

export function buildBaftravelLiquidation(data: ReportData, currency: string): BaftravelLiquidationData {
  const reservations = data.reservations
    .filter((reservation) => {
      const code = currencyCode(reservation.currency);
      return code === currency && reservation.status !== 'cancelled' && reservation.status !== 'pending';
    })
    .map((reservation) => {
      const finance = reservationFinancials(reservation, data.payments, data.ledger);
      const providers = finance.providers.map((provider) => ({
        id: provider.providerId,
        name: provider.name || 'Proveedor sin nombre',
        amount: provider.amount,
      }));
      const commissionNeedsReview = !finance.moneyComplete || !finance.costComplete;
      const passengerNames = [
        reservation.customerName?.trim() ?? '',
        ...(reservation.passengerDetails ?? []).map((passenger) => `${passenger.firstName} ${passenger.lastName}`.trim()),
      ].filter(Boolean);

      return {
        reservationId: reservation.id,
        reservationCode: reservation.reservationCode || 'Sin código',
        hotelId: reservation.operations?.sellerHotelId ?? '',
        date: reservation.date,
        customerName: reservation.customerName ?? '',
        email: reservation.customerEmail ?? '',
        phone: reservation.customerPhone ?? '',
        pax: passengerNames,
        people: reservation.people,
        excursion: reservation.packageTitle ?? reservation.experienceTitle ?? 'Sin excursión',
        channel: reservation.operations?.channel ?? 'other',
        total: finance.gross,
        commission: commissionNeedsReview ? null : finance.gross - finance.providerCost,
        commissionNeedsReview,
        providers: providers.length ? providers : [{ id: '', name: 'Sin proveedor', amount: null }],
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.reservationCode.localeCompare(b.reservationCode));

  return { reservations };
}
