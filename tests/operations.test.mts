import test from 'node:test';
import assert from 'node:assert/strict';
import { ageAt, collectorForPayment, dateKey, reservationFinancials, ruleAmount, signedPayment, type BusinessReservation } from '../lib/operations/calculations.ts';
import { buildReport, type ReportData, type ReportFilters } from '../lib/operations/reports.ts';
import { buildFinancialDashboard } from '../lib/operations/finance.ts';
import { excelWorkbook } from '../lib/operations/excel.ts';
import { commissionRuleSchema, packageOperationsSchema, reservationOperationsSchema } from '../lib/operations/schemas.ts';
import { EMPTY_RESERVATION_OPERATIONS, type LedgerEntry, type PaymentRecord } from '../lib/operations/types.ts';
import ExcelJS from 'exceljs';
import { paymentMethodLabel } from '../lib/operations/labels.ts';
import { currencyCode, currencyWarning, moneyLabel, moneyTotalsLabel } from '../lib/operations/currency.ts';

const r = (): BusinessReservation => ({ id: 'r1', packageId: 'p1', packageTitle: 'Glaciares', date: '2026-11-05', createdAt: '2026-11-01', people: 2, amountTotal: 100000, baseSubtotalAmount: 100000, currency: 'ars', status: 'reserved', customerName: 'Ana Pérez', customerEmail: 'ana@example.test', customerCountry: 'Argentina', customerBirthDate: '1990-11-06', passengerDetails: [{ firstName: 'Juan', lastName: 'Pérez', nationality: 'Chile', birthDate: '2010-01-01' }], operations: { ...EMPTY_RESERVATION_OPERATIONS, sellerHotelId: 'h1', commissionMethod: 'cash', sellerHotelName: 'Hotel 1', pickupHotelName: '', version: 1, commissions: { cash: { type: 'percent', value: 10, currency: 'ARS' }, bank: { type: 'percent', value: 20, currency: 'ARS' } }, providers: [{ providerId: 's1', name: 'Guía', rule: { type: 'per_person', value: 100, currency: 'ARS' } }], costsComplete: true } });
const p = (amount: number, method = 'cash', extra: Partial<PaymentRecord> = {}): PaymentRecord => ({ id: crypto.randomUUID(), reservationId: 'r1', amount, currency: 'ars', method, status: 'paid', createdAt: '2026-11-02', ...extra });
const e = (kind: LedgerEntry['kind'], amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({ id: crypto.randomUUID(), kind, reservationId: 'r1', counterpartyId: kind === 'provider_payment' ? 's1' : 'h1', amount, currency: 'ARS', method: 'transfer', note: 'Prueba', occurredAt: '2026-11-03T12:00:00-03:00', recordedBy: 'admin@example.test', receiptUrl: '', reversalOf: '', ...extra });
const filters = (): ReportFilters => ({ from: '2026-11-01', to: '2026-11-30', dateBy: 'sale', currency: 'ARS', packageId: '', nationality: '', age: '', vendorId: '', hotelId: '', providerId: '', method: '', status: '', channel: '' });
const data = (): ReportData => ({ reservations: [r()], payments: [p(100000)], ledger: [], counterparties: [], packages: [{ id: 'p1', titulo: 'Glaciares' }, { id: 'p2', titulo: 'Sin ventas', visible: true }] });

test('referral display tolerates missing commission currency and amount without showing invented money', () => {
  for (const currency of [undefined, null, '', 123]) assert.equal(moneyLabel(5000, currency), 'Por completar');
  for (const amount of [undefined, null, NaN, Infinity, '5000']) assert.equal(moneyLabel(amount, 'ARS'), 'Por completar');
  assert.equal(moneyLabel(0, 'ars'), '0 ARS');
  assert.equal(moneyLabel(5000, ' ars '), '50 ARS');
});
test('referral totals remain incomplete for missing data and never combine different currencies', () => {
  assert.equal(moneyTotalsLabel([{ amount: 5000, currency: undefined }]), 'Por completar');
  assert.equal(moneyTotalsLabel([{ amount: 5000, currency: 'ARS' }, { amount: undefined, currency: 'ARS' }]), 'Por completar');
  assert.equal(moneyTotalsLabel([{ amount: 5000, currency: 'ars' }, { amount: 1000, currency: 'ARS' }, { amount: 2000, currency: 'USD' }]), '60 ARS · 20 USD');
  assert.equal(moneyTotalsLabel([]), 'Sin registros');
});

test('legacy referral without commission currency does not crash reports or claim a complete margin', () => {
  const d = data();
  d.reservations[0].referredBy = { vendorId: 'v1', vendorName: 'Vendedor', commissionAmount: 5000, commissionCurrency: 'ARS' };
  Reflect.deleteProperty(d.reservations[0].referredBy, 'commissionCurrency');
  const result = reservationFinancials(d.reservations[0], d.payments);
  assert.equal(result.vendorComplete, false);
  assert.equal(result.margin, null);
  const report = buildReport(d, filters());
  assert.equal(report.summary.sales, 100000);
  assert.equal(report.summary.collected, 100000);
  assert.equal(report.summary.margin, null);
  assert.equal(report.summary.incompleteCosts, 1);
  assert.equal(report.sections.find((s) => s.title === 'Detalle de reservas')!.rows[0]['Comisión vendedor'], null);
  assert.doesNotThrow(() => buildFinancialDashboard(d, 'ARS'));
});
test('missing, null and malformed currencies never default to ARS or match each other', () => {
  for (const value of [undefined, null, '', '  ', 123, {}, 'invalid']) assert.equal(currencyCode(value), '');
  assert.equal(currencyCode(' ars '), 'ARS');
  const d = data();
  Reflect.deleteProperty(d.reservations[0], 'currency');
  Reflect.deleteProperty(d.payments[0], 'currency');
  const result = reservationFinancials(d.reservations[0], d.payments);
  assert.equal(result.netPaid, 0);
  assert.equal(result.margin, null);
  assert.equal(result.moneyComplete, false);
  const report = buildReport(d, filters());
  assert.equal(report.summary.reservations, 0);
  assert.equal(report.summary.sales, 0);
  assert.deepEqual(report.currencyIssues, { reservations: 1, payments: 1, ledger: 0 });
  assert.match(currencyWarning(report.currencyIssues), /totales pueden estar incompletos/);
  const finance = buildFinancialDashboard(d, 'ARS');
  assert.equal(finance.cash.length, 0);
  assert.equal(finance.obligations.length, 0);
  assert.deepEqual(finance.currencyIssues, report.currencyIssues);
});
test('unidentified payment or ledger currency keeps affected calculations incomplete', () => {
  for (const kind of ['payment', 'ledger']) {
    const d = data();
    if (kind === 'payment') Reflect.deleteProperty(d.payments[0], 'currency');
    else { d.ledger.push(e('provider_payment', 1000)); Reflect.deleteProperty(d.ledger[0], 'currency'); }
    d.reservations[0].operations!.serviceExecuted = true;
    const result = reservationFinancials(d.reservations[0], d.payments, d.ledger);
    assert.equal(result.margin, null);
    assert.equal(result.moneyComplete, false);
    assert.equal(result.commissionProvisional, false);
    const finance = buildFinancialDashboard(d, 'ARS');
    assert.equal(finance.obligations.find((o) => o.type === 'hotel')!.provisional, false);
    assert.equal(finance.obligations.find((o) => o.type === 'provider')!.provisional, true);
    assert.equal(buildReport(d, filters()).summary.incompleteCosts, 1);
  }
});
test('unidentified passenger payments do not block hotel commission, but unknown discounts do', () => {
  const d = data();
  Reflect.deleteProperty(d.payments[0], 'currency');
  assert.equal(reservationFinancials(d.reservations[0], d.payments).hotelPaymentProvisional, false);
  const adjustment = p(1000, 'cash', { movementType: 'discount', status: 'recorded' });
  Reflect.deleteProperty(adjustment, 'currency');
  d.payments.push(adjustment);
  assert.equal(reservationFinancials(d.reservations[0], d.payments).hotelPaymentProvisional, true);
});
test('incomplete legacy commission rules remain unknown instead of throwing', () => {
  const d = data();
  Reflect.deleteProperty(d.reservations[0].operations!.commissions!, 'cash');
  assert.equal(reservationFinancials(d.reservations[0], d.payments).margin, null);
  d.reservations[0].referredBy = { vendorId: 'v1', vendorName: 'Vendedor', commissionAmount: 5000, commissionCurrency: 'ARS' };
  Reflect.deleteProperty(d.reservations[0].referredBy, 'commissionAmount');
  assert.equal(reservationFinancials(d.reservations[0], d.payments).vendorComplete, false);
});

test('visible reservation codes never fall back to internal IDs', () => {
  const d = data();
  assert.equal(buildFinancialDashboard(d, 'ARS').obligations[0].reservationCode, 'Sin código');
  assert.equal(buildReport(d, filters()).sections.find((s) => s.title === 'Detalle de reservas')!.rows[0]['Código de reserva'], 'Sin código');
  d.reservations[0].reservationCode = 'BAFT-123';
  const obligation = buildFinancialDashboard(d, 'ARS').obligations[0];
  assert.equal(obligation.reservationCode, 'BAFT-123');
  assert.equal(obligation.reservationId, 'r1');
});
test('payment labels are understandable without changing stored methods', () => {
  assert.equal(paymentMethodLabel('transfer'), 'Transferencia');
  assert.equal(paymentMethodLabel('admin'), 'Medio por identificar');
  assert.equal(paymentMethodLabel('unknown'), 'Otro medio');
});
test('payment collector is derived from the hotel seller and real movement method', () => {
  assert.equal(collectorForPayment('', 'cash'), 'baft');
  assert.equal(collectorForPayment('h1', 'cash'), 'hotel');
  for (const method of ['transfer', 'card', 'mercadopago']) assert.equal(collectorForPayment('h1', method), 'baft');
});
test('receivable exports retain numeric currency units', async () => {
  const buffer = await excelWorkbook([{ title: 'Pendientes', rows: [{ 'A cobrar': 12345 }] }], {});
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  assert.equal(book.worksheets[1].getCell('A2').value, 123.45);
});
test('reservation export retains separate hotel commission headers', () => {
  const row = buildReport(data(), filters()).sections.find((section) => section.title === 'Detalle de reservas')!.rows[0];
  assert.equal(row['Comisión efectivo hotel'], 10000);
  assert.equal(row['Comisión depósito'], 20000);
  assert.equal(row['Comisión TC'], 20000);
});
test('administrative Excel dates use day/month/year and 24-hour time without changing IDs', async () => {
  const buffer = await excelWorkbook([{ title: 'Reservas', rows: [{ Fecha: '2026-11-06', Reserva: '2026-11-06', Mes: '2026-11' }] }], { Desde: '2026-11-01', 'Generado el': '2026-11-06T18:45:00Z' });
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  assert.equal(book.worksheets[1].getCell('A2').value, '06/11/2026');
  assert.equal(book.worksheets[1].getCell('B2').value, '2026-11-06');
  assert.equal(book.worksheets[1].getCell('C2').value, '11/2026');
  assert.equal(book.worksheets[0].getCell('B2').value, '01/11/2026');
  assert.equal(book.worksheets[0].getCell('B3').value, '06/11/2026 15:45');
});

test('age is measured at departure, validates dates and never invents unknown ages', () => {
  assert.equal(ageAt('1990-11-06', '2026-11-05'), 35);
  assert.equal(ageAt('1990-11-06', '2026-11-06'), 36);
  assert.equal(ageAt('2026-02-31', '2026-11-05'), null);
  assert.equal(ageAt('', '2026-11-05'), null);
  assert.equal(ageAt('2030-01-01', '2026-11-05'), null);
  assert.equal(ageAt('1990-01-01', 'sin-fecha'), null);
  assert.equal(dateKey('2026-11-06T01:00:00Z'), '2026-11-05');
});
test('commission uses the reservation method and is independent of collection progress', () => {
  const f = reservationFinancials(r(), [p(60000), p(40000, 'transfer')]);
  assert.equal(f.hotelCommission, 10000);
  assert.equal(f.hotelCashCommission, 10000);
  assert.equal(f.hotelDepositCommission, 20000);
  assert.equal(f.commissionProvisional, false);
  assert.equal(f.providerCost, 20000);
  assert.equal(f.margin, 70000);
  assert.equal(reservationFinancials(r(), []).hotelCommission, 10000);
  const cancelled = r(); cancelled.status = 'cancelled';
  assert.equal(reservationFinancials(cancelled, []).hotelCommission, 0);
});
test('fixed commission rules calculate the selected method once', () => {
  const reservation = r();
  reservation.operations!.commissionMethod = 'card';
  reservation.operations!.commissions = { cash: { type: 'per_person', value: 50, currency: 'ARS' }, deposit: { type: 'per_booking', value: 100, currency: 'ARS' }, creditCard: { type: 'per_booking', value: 200, currency: 'ARS' } };
  assert.equal(reservationFinancials(reservation, [p(50000), p(50000, 'card')]).hotelCommission, 20000);
  assert.equal(ruleAmount({ type: 'per_person', value: 0, currency: 'ARS' }, 100000, 2, 'ARS'), 0);
  assert.equal(ruleAmount({ type: 'per_booking', value: 10, currency: 'USD' }, 100000, 2, 'ARS'), null);
});
test('installments do not duplicate commissions; provisional/missing data never claims a margin', () => {
  const paid = reservationFinancials(r(), [p(40000), p(60000)]);
  assert.equal(paid.hotelCommission, 10000);
  assert.equal(paid.commissionProvisional, false);
  assert.equal(reservationFinancials(r(), [p(40000)]).margin, null);
  assert.equal(reservationFinancials(r(), [p(100000, 'admin')]).margin, null);
  const reservation = r(); reservation.operations!.costsComplete = false;
  assert.equal(reservationFinancials(reservation, [p(100000)]).margin, null);
});
test('extras are excluded from commissions, discounts and refunds reduce the base', () => {
  const reservation = r(); reservation.extrasTotalAmount = 20000; reservation.baseSubtotalAmount = 80000;
  assert.equal(reservationFinancials(reservation, [p(100000)]).hotelCommission, 8000);
  const f = reservationFinancials(reservation, [p(100000), p(10000, 'cash', { movementType: 'discount', status: 'recorded' }), p(10000, 'cash', { movementType: 'refund', status: 'refunded' })]);
  assert.equal(f.gross, 80000); assert.equal(f.hotelCommission, 6000); assert.equal(f.netPaid, 90000);
  assert.equal(signedPayment(p(10000, 'cash', { movementType: 'extra', status: 'recorded' })), 0);
});
test('money retained by hotels is a receivable, never BAFT cash', () => {
  const d = data(); d.payments = [p(100000, 'cash', { collectedBy: 'baft' })];
  const f = buildFinancialDashboard(d, 'ARS');
  assert.equal(f.cash.length, 0); assert.equal(f.totals.receivable, 90000); assert.equal(f.totals.payable, 0);
});
test('offsets settle both sides without fictitious cash; reversals restore debts', () => {
  const d = data(); d.payments = [p(100000, 'cash', { collectedBy: 'hotel' })];
  d.ledger = [e('offset', 10000)];
  assert.equal(buildFinancialDashboard(d, 'ARS').cash.length, 0);
  assert.equal(reservationFinancials(r(), d.payments, d.ledger).hotelReceivable, 90000);
  assert.equal(reservationFinancials(r(), d.payments, d.ledger).hotelPayable, 0);
  const paid = e('hotel_payment', 10000);
  assert.equal(reservationFinancials(r(), [], [paid, e('reversal', 10000, { reversalOf: paid.id })]).hotelPayable, 10000);
});
test('cross-reservation offsets consume only the explicitly allocated side', () => {
  const pays = [p(100000, 'cash', { collectedBy: 'hotel' })];
  assert.equal(reservationFinancials(r(), pays, [e('offset', 10000, { offsetSide: 'payable' })]).hotelReceivable, 100000);
  assert.equal(reservationFinancials(r(), pays, [e('offset', 10000, { offsetSide: 'receivable' })]).hotelPayable, 0);
  assert.equal(reservationFinancials(r(), pays, [e('offset', 10000, { offsetSide: 'receivable' })]).hotelReceivable, 80000);
});
test('reports count actual nationalities per passenger and include zero-sale excursions', () => {
  const report = buildReport(data(), filters());
  assert.equal(report.summary.passengers, 2);
  assert.deepEqual(report.sections[0].rows, [{ Nacionalidad: 'Argentina', Pasajeros: 1 }, { Nacionalidad: 'Chile', Pasajeros: 1 }]);
  assert.equal(report.sections.find((s) => s.title === 'Excursiones menos vendidas')!.rows[0].Nombre, 'Sin ventas');
  const filtered = buildReport(data(), { ...filters(), nationality: 'Chile', age: '13–17' });
  assert.equal(filtered.summary.passengers, 1); assert.equal(filtered.summary.sales, 100000);
  assert.equal(buildReport(data(), { ...filters(), nationality: 'Chile', age: '30–44' }).summary.reservations, 0);
});
test('currency, state, inclusive dates and payment-date filtering are respected', () => {
  const d = data();
  d.reservations.push({ ...r(), id: 'usd', currency: 'USD' }, { ...r(), id: 'cancelled', status: 'cancelled' });
  assert.equal(buildReport(d, filters()).summary.reservations, 1);
  assert.equal(buildReport(d, { ...filters(), from: '2026-11-01', to: '2026-11-01' }).summary.reservations, 1);
  assert.equal(buildReport(d, { ...filters(), dateBy: 'payment', from: '2026-11-02', to: '2026-11-02' }).summary.collected, 100000);
  assert.equal(buildReport(d, { ...filters(), dateBy: 'payment', from: '2026-11-03', to: '2026-11-03' }).summary.collected, 0);
});
test('reports aggregate all records beyond the old 200-row dashboard limit', () => {
  const d = data(); d.reservations = Array.from({ length: 501 }, (_, i) => ({ ...r(), id: `r${i}` })); d.payments = [];
  assert.equal(buildReport(d, filters()).summary.sales, 50100000);
  assert.equal(buildReport(d, filters()).summary.reservations, 501);
});
test('commission schemas reject invalid percentages and duplicate counterparties', () => {
  assert.equal(commissionRuleSchema.safeParse({ type: 'percent', value: 101, currency: 'ARS' }).success, false);
  assert.equal(packageOperationsSchema.safeParse({ hotels: [{ hotelId: 'h1', cash: null, bank: null }, { hotelId: 'h1', cash: null, bank: null }], providers: [], costsComplete: false }).success, false);
});
test('hotel seller operations require an explicit commission method and package rates retain legacy bank values', () => {
  const hotelReservation = { ...EMPTY_RESERVATION_OPERATIONS, sellerHotelId: 'h1' };
  assert.equal(reservationOperationsSchema.safeParse(hotelReservation).success, false);
  assert.equal(reservationOperationsSchema.safeParse({ ...hotelReservation, commissionMethod: 'transfer' }).success, true);
  const legacy = packageOperationsSchema.parse({ hotels: [{ hotelId: 'h1', cash: null, bank: { type: 'percent', value: 12, currency: 'ARS' } }], providers: [], costsComplete: false });
  assert.deepEqual(legacy.hotels[0], { hotelId: 'h1', cash: null, deposit: { type: 'percent', value: 12, currency: 'ARS' }, creditCard: { type: 'percent', value: 12, currency: 'ARS' } });
});
test('Excel is a genuine workbook, preserves text as text and numeric money', async () => {
  const buffer = await excelWorkbook([{ title: 'Ventas', rows: [{ Nombre: '=HYPERLINK("https://invalid.test")', Importe: 12345, Margen: null }] }], { currency: 'ARS', from: '2026-11-01' });
  assert.equal(Buffer.from(buffer).subarray(0, 2).toString(), 'PK');
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer as never);
  assert.equal(book.worksheets.length, 2);
  assert.equal(book.worksheets[1].getCell('A2').type, ExcelJS.ValueType.String);
  assert.equal(book.worksheets[1].getCell('B2').value, 123.45);
});
test('a past departure does not imply execution; completing the reservation enables supplier payment', () => {
  const d = data(); d.reservations[0].date = '2020-01-01';
  assert.equal(buildFinancialDashboard(d, 'ARS').obligations.find((o) => o.type === 'provider')!.provisional, true);
  d.reservations[0].status = 'completed';
  d.reservations[0].operations!.serviceExecuted = false;
  assert.equal(buildFinancialDashboard(d, 'ARS').obligations.find((o) => o.type === 'provider')!.provisional, false);
});
test('cancelling a performed service never erases its supplier obligation', () => {
  const d = data(); d.reservations[0].status = 'cancelled'; d.reservations[0].operations!.serviceExecuted = true;
  assert.equal(reservationFinancials(d.reservations[0], d.payments).providerCost, 20000);
  assert.equal(buildFinancialDashboard(d, 'ARS').obligations.find((o) => o.type === 'provider')!.payable, 20000);
});
test('allocated expenses reduce margin once; paying a supplier does not double its cost', () => {
  const f = reservationFinancials(r(), [p(100000)], [e('expense', 5000), e('provider_payment', 20000)]);
  assert.equal(f.margin, 65000);
  assert.equal(f.allocatedExpenses, 5000);
});
test('sales channel and payment method filters combine with excursion and dates', () => {
  assert.equal(buildReport(data(), { ...filters(), channel: 'front', method: 'cash', packageId: 'p1' }).summary.reservations, 1);
  assert.equal(buildReport(data(), { ...filters(), channel: 'web' }).summary.reservations, 0);
  assert.equal(buildReport(data(), { ...filters(), method: 'card' }).summary.reservations, 0);
});
test('provider ranking uses actual payment date, even if the sale is older or subsequently cancelled', () => {
  const d = data(); d.reservations[0].createdAt = '2025-01-01'; d.reservations[0].status = 'cancelled';
  d.ledger = [e('provider_payment', 20000)];
  const report = buildReport(d, filters());
  assert.equal(report.sections.find((s) => s.title === 'Pagos a proveedores (fecha de pago)')!.rows[0].Pagado, 20000);
});
test('new sales channels are accepted and reports filter without changing historical channels', () => {
  for (const channel of ['front', 'web', 'whatsapp', 'friend', 'released', 'backoffice', 'hotel', 'other']) {
    assert.equal(reservationOperationsSchema.safeParse({ ...EMPTY_RESERVATION_OPERATIONS, channel }).success, true);
    const d = data(); d.reservations[0].operations!.channel = channel as typeof EMPTY_RESERVATION_OPERATIONS.channel;
    assert.equal(buildReport(d, { ...filters(), channel }).summary.reservations, 1);
    assert.equal(buildReport(d, { ...filters(), channel: 'not-matching' }).summary.reservations, 0);
    assert.equal(buildReport(d, filters()).summary.sales, 100000);
  }
});
