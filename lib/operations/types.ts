export type MoneyCurrency = 'ARS' | 'USD' | 'BRL' | 'EUR';
/** Amounts are integer minor units everywhere except editable rate values. */
export type CommissionRule = {
  type: 'percent' | 'per_person' | 'per_booking';
  value: number;
  currency: MoneyCurrency;
};
export type CommissionPaymentMethod = 'cash' | 'transfer' | 'card';
export type HotelCommissions = {
  cash?: CommissionRule;
  deposit?: CommissionRule;
  creditCard?: CommissionRule;
  /** Legacy combined bank rule; used only when a newer rule is missing. */
  bank?: CommissionRule;
};
export type Counterparty = {
  id: string;
  kind: 'hotel' | 'provider';
  name: string;
  taxId: string;
  active: boolean;
  email: string;
  phone: string;
  contact: string;
  address: string;
  notes: string;
  commissions: HotelCommissions;
};
export type PackageOperations = {
  hotels: Array<{ hotelId: string; cash: CommissionRule | null; deposit?: CommissionRule | null; creditCard?: CommissionRule | null; bank?: CommissionRule | null }>;
  providers: Array<{ providerId: string; rule: CommissionRule }>;
  costsComplete: boolean;
};
export type ReservationOperationsInput = {
  serviceExecuted: boolean;
  channel: import('../admin/sales-channels').SalesChannel;
  sellerHotelId: string;
  commissionMethod: CommissionPaymentMethod | '';
  pickupType: 'hotel' | 'other';
  pickupHotelId: string;
  pickupAddress: string;
  pickupTime: string;
  notes: string;
  diet: string;
  automaticEmails: boolean;
};
export type ReservationOperations = ReservationOperationsInput & {
  /** Legacy storage only. Never collect, display or export this retired field. */
  room?: string;
  sellerHotelName: string;
  pickupHotelName: string;
  commissions: HotelCommissions | null;
  providers: Array<{ providerId: string; name: string; rule: CommissionRule }>;
  costsComplete: boolean;
  version: 1;
};
export type PaymentRecord = {
  id: string;
  reservationId: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  movementType?: string;
  collectedBy?: 'baft' | 'hotel';
  correctedBy?: string;
  correctsPaymentId?: string;
  includedInTotal?: boolean;
  occurredAt?: unknown;
  createdAt?: unknown;
};
export type LedgerEntry = {
  offsetSide?: 'payable' | 'receivable';
  pairedReservationId?: string;
  id: string;
  kind: 'hotel_payment' | 'hotel_receipt' | 'provider_payment' | 'expense' | 'income' | 'offset' | 'reversal';
  counterpartyId: string;
  reservationId: string;
  amount: number;
  currency: MoneyCurrency;
  method: string;
  note: string;
  occurredAt: string;
  recordedBy: string;
  receiptUrl: string;
  reversalOf: string;
};
export const EMPTY_RULE: CommissionRule = { type: 'percent', value: 0, currency: 'ARS' };
export const EMPTY_PACKAGE_OPERATIONS: PackageOperations = { hotels: [], providers: [], costsComplete: false };
export const EMPTY_RESERVATION_OPERATIONS: ReservationOperationsInput = {
  serviceExecuted: false,
  channel: 'front',
  sellerHotelId: '', commissionMethod: '', pickupType: 'other', pickupHotelId: '', pickupAddress: '', pickupTime: '',
  notes: '', diet: '', automaticEmails: true,
};
