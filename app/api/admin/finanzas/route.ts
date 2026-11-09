import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { guardAdmin } from '@/lib/vendor-admin';
import { readOperationsData } from '@/lib/operations/server';
import { currencySchema } from '@/lib/operations/schemas';
import { financeEntrySchema } from '@/lib/operations/payment-schemas';
import { buildBaftravelLiquidation, buildFinancialDashboard, effectiveLedger, filterHotelBalanceObligations, hotelBalanceTotals } from '@/lib/operations/finance';
import { ageAt, dateKey, reservationFinancials, type BusinessReservation } from '@/lib/operations/calculations';
import type { LedgerEntry, PaymentRecord } from '@/lib/operations/types';
import { financeTemplateWorkbook, type FinanceExcelRow, type FinanceExcelTemplate } from '@/lib/operations/excel';
import { currencyCode } from '@/lib/operations/currency';
import { salesChannelLabel } from '@/lib/admin/sales-channels';
import { paymentObligationVisible, parsePaymentView } from '@/lib/admin/payments';
import { adminDateTimeLabel } from '@/lib/admin/dates';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  const guard = await guardAdmin(request); if (guard instanceof NextResponse) return guard;
  const url = new URL(request.url); const currency = currencySchema.safeParse(url.searchParams.get('currency') ?? 'ARS');
  if (!currency.success) return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 });
  try {
    const data = await readOperationsData(guard.db); const dashboard = buildFinancialDashboard(data, currency.data);
    const baftravelLiquidation = buildBaftravelLiquidation(data, currency.data);
    if (url.searchParams.get('format') === 'xlsx') {
      const view = parsePaymentView(url.searchParams.get('seccion'));
      const party = url.searchParams.get('party') || '';
      const departureFrom = url.searchParams.get('desde') || '';
      const departureTo = url.searchParams.get('hasta') || '';
      const excursion = url.searchParams.get('excursion') || '';
      const state = url.searchParams.get('estado') || 'all';
      const mode = url.searchParams.get('mode') === 'history' ? 'history' : 'pending';
      const from = departureFrom;
      const to = departureTo;
      const rangeDate = (date: string) => (!from && !to) || date !== 'sin-fecha' && (!from || date >= from) && (!to || date <= to);
      const displayDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
        : date || 'Sin fecha';
      const displayDateTime = (date: unknown) => {
        const key = dateKey(date);
        return key ? adminDateTimeLabel(date) : 'Sin fecha';
      };
      const major = (amount: number | null | undefined): number | string => amount === null || amount === undefined ? 'Por revisar' : amount / 100;
      const reservationById = new Map(data.reservations.map((reservation) => [reservation.id, reservation]));
      const financeByReservation = new Map(data.reservations.map((reservation) => [reservation.id, reservationFinancials(reservation, data.payments, data.ledger)]));
      const activeLedger = effectiveLedger(data.ledger).filter((entry) => currencyCode(entry.currency) === currency.data);
      const isReversed = (entryId: string) => data.ledger.some((entry) => entry.reversalOf === entryId);
      const matchingObligations = dashboard.obligations.filter((row) =>
        (!party || row.counterpartyId === party) && (!excursion || row.excursion === excursion) && rangeDate(row.date),
      );
      const passenger = (reservation: BusinessReservation) => `${reservation.customerName?.trim() || 'Sin informar'} x ${reservation.people}`;
      const passengerCounts = (reservation: BusinessReservation) => {
        const people = [
          reservation.customerBirthDate,
          ...(reservation.passengerDetails ?? []).map((person) => person.birthDate),
        ].slice(0, reservation.people);
        const minors = people.filter((birthDate) => {
          const age = ageAt(birthDate, reservation.date);
          return age !== null && age < 18;
        }).length;
        return { adults: Math.max(0, reservation.people - minors), minors };
      };
      const lastPaymentDate = (kinds: string[], reservationId: string, counterpartyId: string) => {
        const offsetSide = kinds.includes('hotel_payment') ? 'payable' : kinds.includes('hotel_receipt') ? 'receivable' : null;
        const entries = activeLedger.filter((entry) => kinds.includes(entry.kind) && entry.reservationId === reservationId && entry.counterpartyId === counterpartyId &&
          (entry.kind !== 'offset' || !offsetSide || !entry.offsetSide || entry.offsetSide === offsetSide))
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        return entries[0] ? displayDateTime(entries[0].occurredAt) : '';
      };
      let template: FinanceExcelTemplate = view;
      let rows: FinanceExcelRow[] = [];
      let balanceTotals: { payable: number; receivable: number; balance: number } | undefined;

      if (view === 'proveedores') {
        template = 'proveedores';
        if (mode === 'history') {
          const entries = data.ledger.filter((entry) => entry.kind === 'provider_payment' && currencyCode(entry.currency) === currency.data && (!party || entry.counterpartyId === party));
          rows = entries.flatMap((entry) => {
            const reservation = reservationById.get(entry.reservationId);
            if (!reservation) return [];
            return [[
              data.counterparties.find((item) => item.id === entry.counterpartyId)?.name || 'Proveedor sin nombre',
              displayDate(reservation.date), reservation.packageTitle ?? reservation.experienceTitle ?? 'Sin excursión', passenger(reservation),
              entry.amount / 100, isReversed(entry.id) ? 'Anulado' : 'Sí', displayDateTime(entry.occurredAt),
            ]];
          });
        } else {
          const obligations = matchingObligations.filter((row) => row.type === 'provider' && paymentObligationVisible('proveedores', state, row));
          rows = obligations.flatMap((row) => {
            const reservation = reservationById.get(row.reservationId);
            if (!reservation) return [];
            const finances = financeByReservation.get(row.reservationId);
            const provider = finances?.providers.find((item) => item.providerId === row.counterpartyId);
            return [[
              row.name || 'Proveedor sin nombre', displayDate(row.date), row.excursion || 'Sin excursión', passenger(reservation),
              major(provider?.amount), row.provisional ? 'Por revisar' : row.payable === 0 ? 'Sí' : 'No',
              lastPaymentDate(['provider_payment'], row.reservationId, row.counterpartyId),
            ]];
          });
        }
      } else if (view === 'hoteles' || view === 'cobros-hoteles') {
        template = view;
        if (mode === 'history') {
          const kind = view === 'hoteles' ? 'hotel_payment' : 'hotel_receipt';
          const entries = data.ledger.filter((entry) => entry.kind === kind && currencyCode(entry.currency) === currency.data && (!party || entry.counterpartyId === party));
          rows = entries.flatMap((entry) => {
            const reservation = reservationById.get(entry.reservationId);
            if (!reservation) return [];
            const finances = financeByReservation.get(entry.reservationId);
            const counts = passengerCounts(reservation);
            if (view === 'hoteles') return [[
              reservation.operations?.sellerHotelName || 'Hotel sin nombre', passenger(reservation), counts.adults, counts.minors,
              reservation.packageTitle ?? reservation.experienceTitle ?? 'Sin excursión', major(finances?.gross), major(finances?.hotelDepositCommission),
              major(finances?.hotelCardCommission), isReversed(entry.id) ? 'Anulado' : 'Sí', displayDateTime(entry.occurredAt),
            ]];
            const cashCommission = finances?.hotelCashCommission;
            const expectedCash = cashCommission === null || cashCommission === undefined ? null : Math.max(0, (finances?.collectedByHotel ?? 0) - cashCommission);
            return [[
              reservation.operations?.sellerHotelName || 'Hotel sin nombre', passenger(reservation), counts.adults, counts.minors,
              reservation.packageTitle ?? reservation.experienceTitle ?? 'Sin excursión', major(finances?.gross), major(finances?.collectedByHotel),
              major(cashCommission), major(expectedCash), isReversed(entry.id) ? 'Anulado' : 'Sí', displayDateTime(entry.occurredAt),
            ]];
          });
        } else {
          const obligations = matchingObligations.filter((row) => row.type === 'hotel' && paymentObligationVisible(view, state, row));
          rows = obligations.flatMap((row) => {
            const reservation = reservationById.get(row.reservationId);
            if (!reservation) return [];
            const finances = financeByReservation.get(row.reservationId);
            const counts = passengerCounts(reservation);
            const paid = view === 'hoteles'
              ? row.provisional ? 'Por revisar' : row.payable === 0 ? 'Sí' : 'No'
              : row.receiptStatus === 'review' ? 'Por revisar' : row.receiptStatus === 'settled' ? 'Sí' : 'No';
            const paymentDate = lastPaymentDate(view === 'hoteles' ? ['hotel_payment', 'offset'] : ['hotel_receipt', 'offset'], row.reservationId, row.counterpartyId);
            if (view === 'hoteles') return [[
              row.name || 'Hotel sin nombre', passenger(reservation), counts.adults, counts.minors, row.excursion || 'Sin excursión',
              major(finances?.gross), major(finances?.hotelDepositCommission), major(finances?.hotelCardCommission), paid, paymentDate,
            ]];
            const cashCommission = finances?.hotelCashCommission;
            const expectedCash = cashCommission === null || cashCommission === undefined ? null : Math.max(0, (finances?.collectedByHotel ?? 0) - cashCommission);
            return [[
              row.name || 'Hotel sin nombre', passenger(reservation), counts.adults, counts.minors, row.excursion || 'Sin excursión',
              major(finances?.gross), major(finances?.collectedByHotel), major(cashCommission), major(expectedCash), paid, paymentDate,
            ]];
          });
        }
      } else if (view === 'balance') {
        template = 'balance';
        const balanceRows = filterHotelBalanceObligations(dashboard.obligations, {
          hotelId: party || undefined, excursion: excursion || undefined, from: from || undefined, to: to || undefined,
          state: (['pending', 'settled', 'all'].includes(state) ? state : 'all') as 'pending' | 'settled' | 'all',
        });
        balanceTotals = hotelBalanceTotals(balanceRows);
        rows = balanceRows.flatMap((row) => {
          const reservation = reservationById.get(row.reservationId);
          if (!reservation) return [];
          const counts = passengerCounts(reservation);
          const review = row.provisional || row.receiptStatus === 'review';
          return [[
            row.name || 'Hotel sin nombre', passenger(reservation), counts.adults, counts.minors, displayDate(row.date), row.excursion || 'Sin excursión',
            row.provisional ? 'Por revisar' : major(row.payable), row.receiptStatus === 'review' ? 'Por revisar' : major(row.receivable),
            review ? 'Por revisar' : major(row.payable - row.receivable),
          ]];
        });
      } else {
        template = 'liquidaciones';
        const liquidationReservations = baftravelLiquidation.reservations.filter((reservation) =>
          (!party || reservation.hotelId === party) && (!excursion || reservation.excursion === excursion) && rangeDate(reservation.date),
        );
        rows = liquidationReservations.flatMap((reservation) => {
          return reservation.providers.map((provider, index) => [
            displayDate(reservation.date), `${reservation.customerName?.trim() || reservation.pax[0] || 'Sin informar'} x ${reservation.people}`, reservation.email, reservation.phone,
            reservation.excursion, provider.name, index === 0 ? major(reservation.total) : null,
            salesChannelLabel(reservation.channel), index === 0 ? major(reservation.commission) : null,
          ]);
        });
      }

      const period = from || to
        ? `Desde ${from ? displayDate(from) : 'Sin límite'} al ${to ? displayDate(to) : 'Sin límite'}`
        : 'Todos los períodos';
      const buffer = await financeTemplateWorkbook(template, rows, { period, currency: currency.data, balanceTotals });
      const fileNames: Record<FinanceExcelTemplate, string> = {
        proveedores: 'BAFT-Pagos-a-proveedores', hoteles: 'BAFT-Pagos-a-hoteles', 'cobros-hoteles': 'BAFT-Pagos-de-hoteles-a-Baftravel',
        balance: 'BAFT-Balance-Hoteles', liquidaciones: 'BAFT-Liquidaciones-Baftravel',
      };
      const fileName = `${fileNames[template]}-${currency.data}-${Date.now()}.xlsx`;
      return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${fileName}"`, 'Cache-Control': 'private, no-store' } });
    }
    const historyKinds = new Set<LedgerEntry['kind']>(['hotel_payment', 'hotel_receipt', 'provider_payment', 'offset']);
    const historyIds = new Set(data.ledger.filter((e) => currencyCode(e.currency) === currency.data && historyKinds.has(e.kind)).map((e) => e.id));
    const ledger = data.ledger.filter((e) => currencyCode(e.currency) === currency.data && (historyKinds.has(e.kind) || e.kind === 'reversal' && historyIds.has(e.reversalOf)));
    const baftravelLiquidationForUi = { reservations: baftravelLiquidation.reservations.map(({ email: _email, phone: _phone, ...reservation }) => reservation) };
    return NextResponse.json({ obligations: dashboard.obligations, balances: dashboard.balances, currencyIssues: dashboard.currencyIssues, totals: dashboard.totals, baftravelLiquidation: baftravelLiquidationForUi, currency: currency.data, reservations: data.reservations.filter((r) => currencyCode(r.currency) === currency.data).map((r) => ({ id: r.id, name: `${r.reservationCode || 'Sin código'} — ${r.customerName ?? ''} — ${r.packageTitle ?? r.experienceTitle ?? ''}`, hotelId: r.operations?.sellerHotelId ?? '' })), counterparties: data.counterparties.map((p) => ({ id: p.id, name: p.name, kind: p.kind })), ledger }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) { console.error('[finanzas]', e); return NextResponse.json({ error: 'No se pudieron calcular las finanzas; no se muestran totales parciales' }, { status: 500 }); }
}
export async function POST(request: Request) {
  const guard = await guardAdmin(request); if (guard instanceof NextResponse) return guard;
  const parsed = financeEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Revisá el importe, fecha, concepto y comprobante' }, { status: 400 });
  const { requestId, ...input } = parsed.data;
  try {
    if (Date.parse(input.occurredAt) > Date.now() + 60000) throw new Error('No se pueden registrar movimientos futuros');
    const user = await guard.auth.verifyIdToken((request.headers.get('authorization') ?? '').slice(7));
    const entryRef = guard.db.collection('operationsLedger').doc(requestId);
    await guard.db.runTransaction(async (tx) => {
      const existing = await tx.get(entryRef);
      if (existing.exists) {
        if (Object.entries(input).some(([key, value]) => (existing.data()?.[key] ?? '') !== value)) throw new Error('La solicitud ya se registró con otros datos. Actualizá el historial antes de repetirla');
        return;
      }
      const reservationRef = input.reservationId ? guard.db.collection('reservas').doc(input.reservationId) : null;
      const reservation = reservationRef ? await tx.get(reservationRef) : null;
      const entries = input.reservationId ? await tx.get(guard.db.collection('operationsLedger').where('reservationId', '==', input.reservationId)) : null;
      const payments = reservationRef ? await tx.get(reservationRef.collection('payments')) : null;
      const party = input.counterpartyId ? await tx.get(guard.db.collection('counterparties').doc(input.counterpartyId)) : null;
      const original = input.reversalOf ? await tx.get(guard.db.collection('operationsLedger').doc(input.reversalOf)) : null;
      const reversed = input.reversalOf ? await tx.get(guard.db.collection('operationsLedger').where('reversalOf', '==', input.reversalOf)) : null;
      const pairedRef = input.kind === 'offset' && input.pairedReservationId && input.pairedReservationId !== input.reservationId ? guard.db.collection('reservas').doc(input.pairedReservationId) : null;
      const paired = pairedRef ? await tx.get(pairedRef) : null;
      const pairedPayments = pairedRef ? await tx.get(pairedRef.collection('payments')) : null;
      const pairedEntries = pairedRef ? await tx.get(guard.db.collection('operationsLedger').where('reservationId', '==', input.pairedReservationId)) : null;
      if (input.reservationId && !reservation?.exists) throw new Error('La reserva no existe');
      if (input.counterpartyId && !party?.exists) throw new Error('No encontramos el hotel o proveedor seleccionado');
      if (input.kind === 'hotel_receipt' && input.method !== 'cash') throw new Error('La entrega del hotel a Baftravel se registra en efectivo');
      if (input.kind === 'reversal') {
        if (!original?.exists || original.data()?.kind === 'reversal' || reversed?.size) throw new Error('Movimiento inexistente o ya revertido');
        const o = original.data()!;
        if (o.kind === 'offset') throw new Error('Las compensaciones requieren revisión contable; no se revierten como dinero');
        if (!['hotel_payment', 'hotel_receipt', 'provider_payment'].includes(o.kind)) throw new Error('Solo se pueden anular pagos de las tareas disponibles');
        if (o.amount !== input.amount || o.currency !== input.currency || o.counterpartyId !== input.counterpartyId || o.reservationId !== input.reservationId || o.method !== input.method) throw new Error('La reversión debe coincidir con el movimiento original');
      } else if (input.reversalOf) throw new Error('Referencia de reversión inválida');
      if (['hotel_payment', 'hotel_receipt', 'provider_payment', 'offset'].includes(input.kind)) {
        if (!reservation?.exists || !party?.exists) throw new Error('Seleccioná una reserva y un hotel o proveedor válidos');
        const r = { ...reservation.data(), id: reservation.id } as BusinessReservation;
        if (currencyCode(r.currency) !== input.currency) throw new Error('La moneda debe coincidir con la reserva');
        const ledger = entries!.docs.map((d) => ({ ...d.data(), id: d.id })) as LedgerEntry[];
        const f = reservationFinancials(r, payments!.docs.map((d) => ({ ...d.data(), id: d.id, reservationId: r.id })) as PaymentRecord[], ledger);
        if (input.kind === 'provider_payment') {
          if (!f.moneyComplete) throw new Error('Revisá la moneda de los cobros y movimientos de esta reserva antes de pagar al proveedor');
          if (party.data()?.kind !== 'provider') throw new Error('Seleccioná un proveedor');
          const p = f.providers.find((p) => p.providerId === input.counterpartyId);
          if (!p || p.amount === null || !f.serviceExecuted) throw new Error('La reserva debe estar completada y tener el costo definido');
          const paid = ledger.filter((e) => e.kind === 'provider_payment' && e.counterpartyId === input.counterpartyId && !ledger.some((x) => x.reversalOf === e.id)).reduce((s, e) => s + e.amount, 0);
          if (input.amount > p.amount - paid) throw new Error('El importe supera la deuda con el proveedor');
        } else {
          if (r.operations?.sellerHotelId !== input.counterpartyId) throw new Error('El hotel no corresponde a esta reserva');
          if (input.kind === 'hotel_payment' && f.hotelPaymentProvisional) throw new Error('Falta definir el medio de comisión de esta reserva');
          if (input.kind === 'hotel_receipt' && f.hotelReceiptReview) throw new Error('Faltan datos para calcular la entrega del hotel');
          if (input.kind === 'offset' && (f.hotelPaymentProvisional || f.hotelReceiptReview)) throw new Error('Faltan datos para calcular la liquidación del hotel');
          let receivable = f.hotelReceivable;
          if (pairedRef) {
            if (!paired?.exists) throw new Error('La reserva a compensar no existe');
            const p = { ...paired.data(), id: paired.id } as BusinessReservation;
            if (p.operations?.sellerHotelId !== input.counterpartyId || currencyCode(p.currency) !== input.currency) throw new Error('Solo se pueden compensar deudas del mismo hotel y moneda');
             const pairedFinance = reservationFinancials(p, pairedPayments!.docs.map((d) => ({ ...d.data(), id: d.id, reservationId: p.id })) as PaymentRecord[], pairedEntries!.docs.map((d) => ({ ...d.data(), id: d.id })) as LedgerEntry[]);
             if (pairedFinance.hotelPaymentProvisional || pairedFinance.hotelReceiptReview) throw new Error('La otra reserva tiene datos financieros incompletos');
             receivable = pairedFinance.hotelReceivable;
          }
          const limit = input.kind === 'offset' ? Math.min(f.hotelPayable, receivable) : input.kind === 'hotel_payment' ? f.hotelPayable : f.hotelReceivable;
          if (input.amount > limit) throw new Error('El importe supera el saldo pendiente');
        }
      }
      if (input.kind === 'offset' && input.method !== 'credit_balance') throw new Error('Las compensaciones usan saldo a favor');
      if (input.kind !== 'offset' && input.method === 'credit_balance') throw new Error('Un saldo a favor no es un movimiento de dinero');
      tx.create(entryRef, { ...input, ...(pairedRef ? { offsetSide: 'payable' } : {}), recordedBy: user.email ?? user.uid, createdAt: FieldValue.serverTimestamp() });
      if (pairedRef) {
        tx.create(guard.db.collection('operationsLedger').doc(`${requestId}_receive`), { ...input, reservationId: input.pairedReservationId, pairedReservationId: input.reservationId, offsetSide: 'receivable', recordedBy: user.email ?? user.uid, createdAt: FieldValue.serverTimestamp() });
        tx.update(pairedRef, { financeVersion: FieldValue.increment(1) });
      }
      if (reservationRef) tx.update(reservationRef, { financeVersion: FieldValue.increment(1) });
    });
    return NextResponse.json({ id: requestId });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo registrar el movimiento' }, { status: 400 }); }
}
