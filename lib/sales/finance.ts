import type { Reservation } from '@/components/landing-reserva/types';
import type { ReservaPaymentEvent } from '@/lib/reservas';

export type VentaFinanceMovementType = 'payment' | 'extra' | 'discount' | 'refund' | 'adjustment';

export type VentaFinanceStatus = 'settled' | 'partial' | 'pending' | 'overpaid';

export type VentaFinance = {
  currency: string;
  baseTotal: number;
  adjustments: number;
  billedTotal: number;
  totalPaid: number;
  pendingAmount: number;
  balance: number;
  status: VentaFinanceStatus;
  /** True cuando no hay movimientos pero la reserva prueba pago (webhook MP legacy). */
  paidViaReservaFallback: boolean;
  hasGatewayProof: boolean;
  gatewayStatus: string;
  gatewayPaymentId: string;
};

const PAID_STATUSES = new Set(['paid', 'approved', 'accredited', 'completed', 'manual_confirmed']);
const PENDING_STATUSES = new Set(['pending', 'in_process', 'in_mediation', 'authorized', 'pending_waiting_payment', 'unknown']);
const REFUND_OK_STATUSES = new Set(['refunded', 'paid', 'approved', 'completed', '']);

export function normalizeFinanceMovementType(payment: Pick<ReservaPaymentEvent, 'movementType' | 'method' | 'status'>): VentaFinanceMovementType {
  const raw = String((payment as { movementType?: unknown }).movementType ?? '').trim().toLowerCase();
  if (raw === 'extra' || raw === 'discount' || raw === 'refund' || raw === 'adjustment') return raw;
  return 'payment';
}

function lowerStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function isPaidStatus(status: string): boolean {
  return PAID_STATUSES.has(status);
}

function isPendingStatus(status: string): boolean {
  return PENDING_STATUSES.has(status);
}

/**
 * Fuente única de verdad financiera para el detalle de venta.
 *
 * - Suma movimientos manuales + automáticos respetando su estado real.
 * - Un pago de Mercado Pago en `pending`/`in_process` NO suma a cobrado (va a pendiente).
 * - Si no hay movimientos pero la reserva está pagada (paidAt / completed / MP approved),
 *   se considera cobrada vía fallback para no mostrar "saldo pendiente" falso (bug legacy MP).
 */
export function computeVentaFinance(
  reserva: Pick<Reservation, 'amountTotal' | 'currency' | 'status' | 'paymentMethod'> &
    Record<string, unknown>,
  payments: Array<Pick<ReservaPaymentEvent, 'amount' | 'movementType' | 'status' | 'method' | 'currency'> & Record<string, unknown>>,
): VentaFinance {
  const currency =
    String(
      (payments.find((p) => typeof (p as { currency?: unknown }).currency === 'string' && String((p as { currency?: unknown }).currency).trim()) as { currency?: unknown } | undefined)?.currency ??
        (reserva as { currency?: unknown }).currency ??
        'ars',
    ).trim() || 'ars';

  const baseTotal = Math.max(0, Number((reserva as { amountTotal?: unknown }).amountTotal ?? 0) || 0);

  let adjustments = 0;
  let totalPaid = 0;
  let pendingAmount = 0;

  for (const payment of payments) {
    const amount = Math.max(0, Number((payment as { amount?: unknown }).amount ?? 0) || 0);
    if (amount <= 0) continue;
    const movementType = normalizeFinanceMovementType(payment as ReservaPaymentEvent);
    const status = lowerStatus((payment as { status?: unknown }).status);
    const method = lowerStatus((payment as { method?: unknown }).method);
    if (status === 'voided' || (payment as { correctedBy?: unknown }).correctedBy) continue;

    if (movementType === 'payment') {
      if (isPaidStatus(status)) {
        totalPaid += amount;
      } else if (isPendingStatus(status)) {
        // MP pendiente: no suma a cobrado.
        if (method === 'mercadopago' || status === 'pending' || status === 'in_process' || status === 'authorized' || status === 'unknown') {
          pendingAmount += amount;
        } else {
          // Movimiento manual sin estado claro: por defecto cuenta como cobrado.
          totalPaid += amount;
        }
      } else if (status === 'refunded') {
        // Pago revertido: no suma.
        continue;
      } else if (!status || status === 'registrado' || status === 'recorded' || status === 'registered') {
        // Compatibilidad: documentos viejos sin estado explícito.
        if (method === 'mercadopago') pendingAmount += amount;
        else totalPaid += amount;
      } else {
        // rejected / cancelled / failed / etc: no suma a cobrado ni a pendiente.
        continue;
      }
    } else if (movementType === 'refund') {
      if (REFUND_OK_STATUSES.has(status) || status === 'recorded') totalPaid -= amount;
    } else if (movementType === 'extra' || movementType === 'adjustment') {
      if (!(payment as { includedInTotal?: boolean }).includedInTotal) adjustments += amount;
    } else if (movementType === 'discount') {
      adjustments -= amount;
    }
  }

  const billedTotal = Math.max(0, baseTotal + adjustments);

  const mpStatus = lowerStatus((reserva as { mercadoPagoStatus?: unknown }).mercadoPagoStatus);
  const mpPaymentId = String((reserva as { mercadoPagoPaymentId?: unknown }).mercadoPagoPaymentId ?? '').trim();
  const paidAt = (reserva as { paidAt?: unknown }).paidAt;
  const reservaStatus = String((reserva as { status?: unknown }).status ?? '').toLowerCase();

  const hasGatewayProof =
    Boolean(mpPaymentId) && (mpStatus === 'approved' || mpStatus === 'accredited' || reservaStatus === 'completed' || Boolean(paidAt));
  const hasReservaPaidSignal = reservaStatus === 'completed' || Boolean(paidAt) || mpStatus === 'approved' || mpStatus === 'accredited';

  let paidViaReservaFallback = false;
  const explicitPaymentTracking = (reserva as { paymentTrackingVersion?: unknown }).paymentTrackingVersion === 1;
  if (!explicitPaymentTracking && payments.length === 0 && billedTotal > 0 && totalPaid === 0 && pendingAmount === 0 && hasReservaPaidSignal) {
    totalPaid = billedTotal;
    paidViaReservaFallback = true;
  }
  // Caso borde: hay docs pero ninguno contado (ej. solo "unknown") y la reserva prueba pago.
  if (!explicitPaymentTracking && !paidViaReservaFallback && billedTotal > 0 && totalPaid === 0 && pendingAmount === 0 && payments.length > 0 && hasGatewayProof) {
    totalPaid = billedTotal;
    paidViaReservaFallback = true;
  }

  const balance = billedTotal - totalPaid;

  let status: VentaFinanceStatus = 'pending';
  if (balance === 0 && totalPaid > 0) status = 'settled';
  else if (balance < 0) status = 'overpaid';
  else if (balance > 0 && totalPaid > 0) status = 'partial';

  return {
    currency,
    baseTotal,
    adjustments,
    billedTotal,
    totalPaid,
    pendingAmount,
    balance,
    status,
    paidViaReservaFallback,
    hasGatewayProof,
    gatewayStatus: mpStatus,
    gatewayPaymentId: mpPaymentId,
  };
}

export function financeStatusLabel(finance: Pick<VentaFinance, 'status' | 'balance'>): string {
  if (finance.status === 'settled') return 'Pagada';
  if (finance.status === 'overpaid') return 'Saldo a favor';
  if (finance.status === 'partial') return 'Pago parcial';
  return 'Saldo pendiente';
}
