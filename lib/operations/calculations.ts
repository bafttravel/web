import type { CommissionPaymentMethod, CommissionRule, HotelCommissions, LedgerEntry, PaymentRecord, ReservationOperations } from './types';
import { currencyCode } from './currency.ts';

export function dateKey(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function') return dateKey(value.toDate());
    if ('seconds' in value) return dateKey(new Date(Number(value.seconds) * 1000));
    if ('_seconds' in value) return dateKey(new Date(Number(value._seconds) * 1000));
  }
  if (value instanceof Date) return value.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : dateKey(d);
}
export function ageAt(birth: string | undefined, date: string): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const b = new Date(`${birth}T12:00:00Z`);
  const departure = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(departure.getTime()) || departure.toISOString().slice(0, 10) !== date) return null;
  if (Number.isNaN(b.getTime()) || b.toISOString().slice(0, 10) !== birth) return null;
  let age = Number(date.slice(0, 4)) - Number(birth.slice(0, 4));
  if (date.slice(5) < birth.slice(5)) age--;
  return age >= 0 && age <= 120 ? age : null;
}
export function ageBand(age: number | null): string {
  if (age === null) return 'Sin informar';
  return age < 13 ? '0–12' : age < 18 ? '13–17' : age < 30 ? '18–29' : age < 45 ? '30–44' : age < 60 ? '45–59' : '60+';
}
export function ruleAmount(rule: CommissionRule | null | undefined, base: number, people: number, currency: string): number | null {
  const code = currencyCode(currency);
  if (!code || !rule || !['percent', 'per_person', 'per_booking'].includes(rule.type) || !Number.isFinite(rule.value)) return null;
  if (rule.type !== 'percent' && currencyCode(rule.currency) !== code) return null;
  return Math.round(rule.type === 'percent' ? base * rule.value / 100 : rule.value * 100 * (rule.type === 'per_person' ? people : 1));
}
export function isCashPayment(p: PaymentRecord): boolean {
  const statusOk = p.movementType === 'refund' ? ['paid', 'approved', 'completed', 'refunded', 'recorded', ''].includes(p.status) : ['paid', 'approved', 'completed', 'succeeded', 'accredited', 'manual_confirmed'].includes(p.status);
  return statusOk && (!p.movementType || p.movementType === 'payment' || p.movementType === 'refund');
}
export function signedPayment(p: PaymentRecord): number {
  return isCashPayment(p) ? Math.abs(p.amount) * (p.movementType === 'refund' ? -1 : 1) : 0;
}
export function commissionPaymentMethod(method: string): CommissionPaymentMethod | null {
  const value = String(method ?? '').trim().toLowerCase();
  if (['cash', 'efectivo', 'pesos', 'ars'].includes(value)) return 'cash';
  if (['transfer', 'transferencia', 'bank', 'deposit', 'depósito', 'deposito'].includes(value)) return 'transfer';
  if (['card', 'tarjeta', 'tarjeta de crédito', 'tarjeta de credito', 'credit_card', 'debit_card', 'mercadopago', 'mercado_pago', 'mercado pago', 'wetravel'].includes(value)) return 'card';
  return null;
}
export function collectorForPayment(sellerHotelId: string | undefined, method: string): 'baft' | 'hotel' {
  return sellerHotelId && commissionPaymentMethod(method) === 'cash' ? 'hotel' : 'baft';
}
function commissionRuleForMethod(rules: HotelCommissions, method: CommissionPaymentMethod): CommissionRule | undefined {
  if (method === 'cash') return rules.cash;
  if (method === 'transfer') return rules.deposit ?? rules.bank;
  return rules.creditCard ?? rules.bank ?? rules.deposit;
}
export type BusinessReservation = {
  id: string; reservationCode?: string; packageId?: string; experienceId?: string; packageTitle?: string; experienceTitle?: string;
  date: string; createdAt?: unknown; people: number; amountTotal: number; currency: string; status: string;
  baseSubtotalAmount?: number | null; extrasTotalAmount?: number | null;
  customerName?: string; customerEmail?: string; customerPhone?: string; customerCountry?: string; customerBirthDate?: string;
  passengerDetails?: Array<{ firstName: string; lastName: string; birthDate?: string; nationality?: string; diet?: string }>;
  referredBy?: { vendorId: string; vendorName: string; commissionAmount: number; commissionCurrency: string };
  operations?: ReservationOperations;
};
export function reservationFinancials(r: BusinessReservation, payments: PaymentRecord[], ledger: LedgerEntry[] = []) {
  const currency = currencyCode(r.currency);
  const activePayment = (p: PaymentRecord) => String(p.status ?? '').toLowerCase() !== 'voided' && !p.correctedBy;
  const matched = payments.filter((p) => p.reservationId === r.id && activePayment(p) && !!currency && currencyCode(p.currency) === currency);
  const unknownPayments = payments.some((p) => p.reservationId === r.id && activePayment(p) && !currencyCode(p.currency));
  const unknownCommissionAdjustments = payments.some((p) => p.reservationId === r.id && activePayment(p) && !currencyCode(p.currency) && ['discount', 'refund', 'adjustment'].includes(String(p.movementType ?? '')));
  const unknownEntries = ledger.some((e) => e.reservationId === r.id && !currencyCode(e.currency));
  const netPaid = Math.max(0, matched.reduce((s, p) => s + signedPayment(p), 0));
  const refunds = matched.reduce((s, p) => s + (signedPayment(p) < 0 ? -signedPayment(p) : 0), 0);
  const discounts = matched.filter((p) => p.movementType === 'discount').reduce((s, p) => s + p.amount, 0);
  const adjustments = matched.filter((p) => p.movementType === 'adjustment').reduce((s, p) => s + p.amount, 0);
  const gross = Math.max(0, r.amountTotal + adjustments - discounts - refunds);
  const base = Math.max(0, Math.min(gross, (r.baseSubtotalAmount ?? Math.max(0, r.amountTotal - (r.extrasTotalAmount ?? 0))) - discounts - refunds));
  const paidCash = Math.max(0, matched.filter((p) => commissionPaymentMethod(p.method) === 'cash').reduce((s, p) => s + signedPayment(p), 0));
  const paidDeposit = Math.max(0, matched.filter((p) => commissionPaymentMethod(p.method) === 'transfer').reduce((s, p) => s + signedPayment(p), 0));
  const paidCard = Math.max(0, matched.filter((p) => commissionPaymentMethod(p.method) === 'card').reduce((s, p) => s + signedPayment(p), 0));
  const classified = paidCash + paidDeposit + paidCard;
  const cancelled = r.status === 'cancelled';
  const serviceExecuted = Boolean(r.operations?.serviceExecuted || r.status === 'completed');
  let hotelCommission = 0;
  let commissionComplete = !!currency && !r.operations?.sellerHotelId;
  let cashCommission = 0;
  let depositCommission: number | null = null;
  let cardCommission: number | null = null;
  let reportedCashCommission: number | null = null;
  let cashCommissionComplete = !!currency && !r.operations?.sellerHotelId;
  if (r.operations?.commissions) {
    const cash = ruleAmount(commissionRuleForMethod(r.operations.commissions, 'cash'), base, r.people, currency);
    const deposit = ruleAmount(commissionRuleForMethod(r.operations.commissions, 'transfer'), base, r.people, currency);
    const card = ruleAmount(commissionRuleForMethod(r.operations.commissions, 'card'), base, r.people, currency);
    cashCommission = cash ?? 0;
    reportedCashCommission = unknownCommissionAdjustments ? null : cash;
    depositCommission = unknownCommissionAdjustments ? null : deposit;
    cardCommission = unknownCommissionAdjustments ? null : card;
    cashCommissionComplete = cash !== null && !unknownCommissionAdjustments;
    const selectedMethod = r.operations.commissionMethod || '';
    const selectedRule = selectedMethod ? ruleAmount(commissionRuleForMethod(r.operations.commissions, selectedMethod), base, r.people, currency) : null;
    commissionComplete = !!currency && !unknownCommissionAdjustments && (!!selectedMethod ? selectedRule !== null : classified > 0 && Math.abs(classified - netPaid) < 1 && cash !== null && deposit !== null && card !== null);
    if (selectedMethod && selectedRule !== null && !unknownCommissionAdjustments) hotelCommission = selectedRule;
    else if (!selectedMethod && !unknownCommissionAdjustments && classified > 0 && Math.abs(classified - netPaid) < 1 && classified > 0) {
      hotelCommission = Math.round(((cash ?? 0) * paidCash + (deposit ?? 0) * paidDeposit + (card ?? 0) * paidCard) / classified);
    }
  }
  if (cancelled) {
    hotelCommission = 0;
    cashCommission = 0;
    reportedCashCommission = 0;
    depositCommission = 0;
    cardCommission = 0;
  }
  const providers = (r.operations?.providers ?? []).map((p) => ({ ...p, amount: ruleAmount(p.rule, base, r.people, currency) }));
  const costComplete = !!r.operations?.costsComplete && providers.every((p) => p.amount !== null);
  const providerCost = cancelled && !serviceExecuted ? 0 : providers.reduce((s, p) => s + (p.amount ?? 0), 0);
  const vendorComplete = !r.referredBy || (!!currency && currencyCode(r.referredBy.commissionCurrency) === currency && Number.isSafeInteger(r.referredBy.commissionAmount) && r.referredBy.commissionAmount >= 0);
  const vendorCommission = cancelled ? 0 : vendorComplete ? (r.referredBy?.commissionAmount ?? 0) : 0;
  const collectedByHotel = Math.max(0, matched.filter((p) => collectorForPayment(r.operations?.sellerHotelId, p.method) === 'hotel').reduce((s, p) => s + signedPayment(p), 0));
  const entries = ledger.filter((e) => e.reservationId === r.id && !!currency && currencyCode(e.currency) === currency);
  const activeEntries = entries.filter((e) => e.kind !== 'reversal' && !entries.some((x) => x.reversalOf === e.id));
  const allocatedExpenses = activeEntries.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
  const hotelPaid = activeEntries.filter((e) => e.kind === 'hotel_payment' || e.kind === 'offset' && e.offsetSide !== 'receivable').reduce((s, e) => s + e.amount, 0);
  const hotelReceived = activeEntries.filter((e) => e.kind === 'hotel_receipt' || e.kind === 'offset' && e.offsetSide !== 'payable').reduce((s, e) => s + e.amount, 0);
  const hotelCommissionRetained = Math.min(collectedByHotel, cashCommission, Math.max(0, hotelCommission - hotelPaid));
  const unknownHotelPayments = payments.some((p) => p.reservationId === r.id && activePayment(p) && (!p.movementType || p.movementType === 'payment' || p.movementType === 'refund') && collectorForPayment(r.operations?.sellerHotelId, p.method) === 'hotel' && !currencyCode(p.currency));
  const unknownHotelPaymentsLedger = ledger.some((e) => e.reservationId === r.id && !currencyCode(e.currency) && (e.kind === 'hotel_payment' || e.kind === 'offset' && e.offsetSide !== 'receivable'));
  const unknownHotelReceiptsLedger = ledger.some((e) => e.reservationId === r.id && !currencyCode(e.currency) && (e.kind === 'hotel_receipt' || e.kind === 'offset' && e.offsetSide !== 'payable'));
  const hotelPaymentProvisional = !commissionComplete || unknownHotelPaymentsLedger;
  const hotelReceiptReview = !commissionComplete || collectedByHotel > 0 && !cashCommissionComplete || unknownHotelPayments || unknownHotelPaymentsLedger || unknownHotelReceiptsLedger;
  return {
    gross: cancelled ? 0 : gross, base, netPaid, refunds, hotelCommission, vendorCommission, providerCost, providers, allocatedExpenses,
    margin: !!currency && !unknownPayments && !unknownEntries && !cancelled && costComplete && commissionComplete && vendorComplete && (!r.operations?.sellerHotelId || netPaid >= gross) ? gross - hotelCommission - vendorCommission - providerCost - allocatedExpenses : null,
    costComplete, commissionComplete, vendorComplete, moneyComplete: !!currency && !unknownPayments && !unknownEntries,
    hotelPayable: Math.max(0, hotelCommission - hotelPaid - hotelCommissionRetained),
    hotelReceivable: Math.max(0, collectedByHotel - hotelCommissionRetained - hotelReceived),
    collectedByHotel, hotelCommissionRetained, cashCommission,
    hotelCashCommission: reportedCashCommission, hotelDepositCommission: depositCommission, hotelCardCommission: cardCommission,
    hotelPaymentProvisional, hotelReceiptReview, serviceExecuted,
    commissionProvisional: hotelPaymentProvisional,
  };
}
