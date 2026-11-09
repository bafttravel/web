import type { LedgerEntry } from '../operations/types';

export const paymentSections = [
  { id: 'proveedores', label: 'Pagos a proveedores', description: 'Servicios pendientes de pago y pagos realizados.', kind: 'provider_payment', action: 'Registrar pago a proveedor' },
  { id: 'hoteles', label: 'Pagos a hoteles', description: 'Comisiones que Baftravel debe pagar a los hoteles.', kind: 'hotel_payment', action: 'Registrar pago a hotel' },
  { id: 'cobros-hoteles', label: 'Pagos de hoteles a Baftravel', description: 'Dinero de reservas que los hoteles deben entregar a Baftravel.', kind: 'hotel_receipt', action: 'Registrar recepción del hotel' },
  { id: 'balance', label: 'Balance Hoteles', description: 'Pendientes de pago y cobro entre Baftravel y cada hotel.', kind: null, action: null },
  { id: 'liquidaciones', label: 'Liquidaciones Baftravel', description: 'Revisá las reservas de cada hotel para pagar, recibir o compensar saldos.', kind: null, action: null },
] as const;

export type PaymentView = typeof paymentSections[number]['id'];
export type PaymentEntryKind = Extract<LedgerEntry['kind'], 'hotel_payment' | 'hotel_receipt' | 'provider_payment' | 'offset' | 'reversal'>;
export type HotelReceiptStatus = 'receivable' | 'settled' | 'not_collected' | 'review';

export function parsePaymentView(value: unknown): PaymentView {
  return paymentSections.some((section) => section.id === value) ? value as PaymentView : 'proveedores';
}

export function paymentKindForView(view: PaymentView) {
  return paymentSections.find((section) => section.id === view)?.kind ?? null;
}

export function paymentPartyKind(view: PaymentView): 'hotel' | 'provider' | null {
  if (view === 'proveedores') return 'provider';
  return ['hoteles', 'cobros-hoteles', 'balance', 'liquidaciones'].includes(view) ? 'hotel' : null;
}

export function paymentLimit(kind: PaymentEntryKind, obligation: { payable: number; receivable: number }): number {
  return kind === 'hotel_receipt' ? obligation.receivable : kind === 'offset' ? Math.min(obligation.payable, obligation.receivable) : obligation.payable;
}

export function hotelReceiptStatus(finance: { hotelReceiptReview: boolean; hotelReceivable: number; collectedByHotel: number }): HotelReceiptStatus {
  if (finance.hotelReceiptReview) return 'review';
  if (finance.hotelReceivable > 0) return 'receivable';
  return finance.collectedByHotel > 0 ? 'settled' : 'not_collected';
}

export function hotelReceiptExplanation(status: HotelReceiptStatus): string {
  return {
    receivable: 'Efectivo pendiente de entrega.',
    settled: 'El hotel no tiene saldo pendiente de entrega por esta reserva.',
    not_collected: 'Sin efectivo recibido en el hotel.',
    review: 'Faltan datos para calcular el saldo.',
  }[status];
}

export function paymentObligationVisible(view: PaymentView, state: string, obligation: { payable: number; receivable: number; provisional: boolean; receiptStatus?: HotelReceiptStatus }): boolean {
  if (state === 'all') return true;
  if (view === 'cobros-hoteles') {
    if (state === 'review') return obligation.receiptStatus === 'review';
    if (state === 'not_collected') return obligation.receiptStatus === 'not_collected';
    if (state === 'settled') return obligation.receiptStatus === 'settled';
    return obligation.receivable > 0 && obligation.receiptStatus !== 'review';
  }
  const pending = view === 'liquidaciones' ? obligation.payable + obligation.receivable : obligation.payable;
  return state === 'pending' ? pending > 0 || obligation.provisional : pending === 0 && !obligation.provisional;
}
