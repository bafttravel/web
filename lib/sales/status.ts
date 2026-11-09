import type { Reservation, ReservationPaymentMethod } from '@/components/landing-reserva/types';
import { deriveReservationPaymentStatus, normalizeReservationPaymentMethod } from '@/lib/sales/orchestrator';

export type VentaEmailStatus = 'not_sent' | 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type VentaVoucherStatus = 'not_generated' | 'generated' | 'queued' | 'sent' | 'failed' | 'cancelled';
export type VentaCommercialStatus = 'pending_payment' | 'confirmed' | 'manual_review' | 'cancelled';
export type VentaOperationalStatus = 'awaiting_confirmation' | 'confirmed' | 'cancelled';
export type VentaPublicTone = 'success' | 'pending' | 'warning' | 'error';

export type ReservationEmailDelivery = {
  customerConfirmation?: {
    status: VentaEmailStatus;
    lastAttemptAt?: object | null;
    sentAt?: object | null;
    error?: string | null;
    provider?: string | null;
    providerMessageId?: string | null;
    jobId?: string | null;
  };
  customerVoucher: {
    status: VentaEmailStatus;
    lastAttemptAt?: object | null;
    sentAt?: object | null;
    error?: string | null;
    provider?: string | null;
    providerMessageId?: string | null;
    jobId?: string | null;
  };
  adminNotification?: {
    status: VentaEmailStatus;
    lastAttemptAt?: object | null;
    sentAt?: object | null;
    error?: string | null;
    provider?: string | null;
    providerMessageId?: string | null;
    jobId?: string | null;
  } | null;
};

type ReservationEmailDeliveryOverrides = {
  customerConfirmation?: Partial<NonNullable<ReservationEmailDelivery['customerConfirmation']>>;
  customerVoucher?: Partial<ReservationEmailDelivery['customerVoucher']>;
  adminNotification?: Partial<NonNullable<ReservationEmailDelivery['adminNotification']>> | null;
};

export function buildDefaultEmailDelivery(): ReservationEmailDelivery {
  return {
    customerConfirmation: {
      status: 'not_sent',
      provider: 'resend',
      providerMessageId: null,
      jobId: null,
      lastAttemptAt: null,
      sentAt: null,
      error: null,
    },
    customerVoucher: {
      status: 'not_sent',
      provider: 'resend',
      providerMessageId: null,
      jobId: null,
      lastAttemptAt: null,
      sentAt: null,
      error: null,
    },
    adminNotification: {
      status: 'not_sent',
      provider: 'resend',
      providerMessageId: null,
      jobId: null,
      lastAttemptAt: null,
      sentAt: null,
      error: null,
    },
  };
}

export function buildQueuedEmailDelivery(input?: ReservationEmailDeliveryOverrides | null): ReservationEmailDelivery {
  const base = buildDefaultEmailDelivery();
  return {
    customerConfirmation: {
      ...base.customerConfirmation,
      status: 'queued',
      ...(input?.customerConfirmation ?? {}),
    },
    customerVoucher: {
      ...base.customerVoucher,
      status: 'queued',
      ...(input?.customerVoucher ?? {}),
    },
    adminNotification: {
      ...base.adminNotification,
      status: 'queued',
      ...(input?.adminNotification ?? {}),
    },
  };
}

export function deriveVoucherStatus(reservation: Reservation): VentaVoucherStatus {
  const customerEmailStatus = reservation.emailDelivery?.customerVoucher?.status;
  if (customerEmailStatus === 'cancelled') return 'cancelled';
  if (customerEmailStatus === 'failed') return 'failed';
  if (reservation.voucherSent) return 'sent';
  if (customerEmailStatus === 'queued' || customerEmailStatus === 'sending') return 'queued';
  if (reservation.paidAt) return 'generated';
  return 'not_generated';
}

export function deriveCustomerConfirmationEmailStatus(reservation: Reservation): VentaEmailStatus {
  if (reservation.emailDelivery?.customerConfirmation?.status) {
    return reservation.emailDelivery.customerConfirmation.status;
  }
  if (reservation.emailDelivery?.customerVoucher?.status) {
    return reservation.emailDelivery.customerVoucher.status;
  }
  if (reservation.paidAt) return 'queued';
  return 'not_sent';
}

export function deriveCustomerVoucherEmailStatus(reservation: Reservation): VentaEmailStatus {
  if (reservation.emailDelivery?.customerVoucher?.status) {
    return reservation.emailDelivery.customerVoucher.status;
  }
  if (reservation.voucherSent) return 'sent';
  if (reservation.paidAt) return 'queued';
  return 'not_sent';
}

export function deriveCustomerEmailStatus(reservation: Reservation): VentaEmailStatus {
  return deriveCustomerConfirmationEmailStatus(reservation);
}

export function deriveAdminEmailStatus(reservation: Reservation): VentaEmailStatus {
  if (reservation.emailDelivery?.adminNotification?.status) {
    return reservation.emailDelivery.adminNotification.status;
  }
  if (reservation.paidAt) return 'queued';
  return 'not_sent';
}

export function ventaStatusLabel(status: Reservation['status']): string {
  if (status === 'completed') return 'Confirmada';
  if (status === 'reserved') return 'Reservada';
  if (status === 'pending') return 'Pendiente';
  return 'Cancelada';
}

export function paymentMethodLabel(method: unknown): string {
  const normalized = normalizeReservationPaymentMethod(method);
  if (normalized === 'mercadopago') return 'Mercado Pago';
  if (normalized === 'admin') return 'Manual';
  return 'Mercado Pago';
}

export function paymentStatusLabel(status: unknown): string {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'paid' || normalized === 'approved') return 'Pago aprobado';
  if (normalized === 'pending' || normalized === 'in_process') return 'Pago pendiente';
  if (normalized === 'manual_confirmed' || normalized === 'reserved') return 'Confirmada manualmente';
  if (normalized === 'manual_pending') return 'Pendiente manual';
  if (normalized === 'cancelled') return 'Cancelado';
  if (normalized === 'rejected' || normalized === 'failed') return 'Pago rechazado';
  if (normalized === 'refunded') return 'Reintegrado';
  return normalized ? normalized.replace(/_/g, ' ') : 'Sin datos';
}

export function deriveCommercialStatus(reservation: Reservation): VentaCommercialStatus {
  const paymentStatus = deriveReservationPaymentStatus(reservation);
  if (reservation.status === 'cancelled') return 'cancelled';
  if (reservation.status === 'completed' || paymentStatus === 'paid' || paymentStatus === 'approved') return 'confirmed';
  if (reservation.status === 'reserved') return 'manual_review';
  return 'pending_payment';
}

export function deriveOperationalStatus(reservation: Reservation): VentaOperationalStatus {
  if (reservation.status === 'cancelled') return 'cancelled';
  if (reservation.status === 'completed' || reservation.status === 'reserved') return 'confirmed';
  return 'awaiting_confirmation';
}

export function commercialStatusLabel(status: VentaCommercialStatus): string {
  if (status === 'confirmed') return 'Venta confirmada';
  if (status === 'manual_review') return 'Venta reservada';
  if (status === 'cancelled') return 'Venta cancelada';
  return 'Pago pendiente';
}

export function operationalStatusLabel(status: VentaOperationalStatus): string {
  if (status === 'confirmed') return 'Operativa confirmada';
  if (status === 'cancelled') return 'Operativa cancelada';
  return 'Pendiente operativa';
}

export function formatReservationPublicState(reservation: Reservation): {
  tone: VentaPublicTone;
  title: string;
  description: string;
} {
  const commercial = deriveCommercialStatus(reservation);
  const operational = deriveOperationalStatus(reservation);
  const voucher = deriveVoucherStatus(reservation);
  const email = deriveCustomerEmailStatus(reservation);

  if (commercial === 'confirmed' && operational === 'confirmed') {
    if (voucher === 'sent' && email === 'sent') {
      return {
        tone: 'success',
        title: 'Compra confirmada',
        description: 'El pago fue aprobado, la venta está confirmada y el voucher ya fue enviado.',
      };
    }
    if (email === 'sent' && voucher !== 'sent') {
      return {
        tone: 'success',
        title: 'Compra confirmada',
        description: 'La compra está confirmada. Te enviaremos el voucher/recordatorio 48 hs antes de la salida.',
      };
    }
    return {
      tone: 'success',
      title: 'Compra confirmada',
      description: 'El pago fue aprobado. Estamos enviando la confirmación y programando el voucher/recordatorio.',
    };
  }

  if (commercial === 'manual_review') {
    return {
      tone: 'warning',
      title: 'Venta reservada',
      description: 'La venta fue cargada o confirmada manualmente. Si falta algo operativo, el equipo lo completará.',
    };
  }

  if (commercial === 'cancelled' || operational === 'cancelled') {
    return {
      tone: 'error',
      title: 'Venta cancelada',
      description: 'La operación fue cancelada o el pago no quedó confirmado.',
    };
  }

  return {
    tone: 'pending',
    title: 'Pago pendiente',
    description: 'La operación sigue en proceso. Cuando el pago se confirme, la venta se actualizará automáticamente.',
  };
}

export function buildVentaStatuses(reservation: Reservation) {
  const paymentMethod = normalizeReservationPaymentMethod(
    reservation.pricingSnapshot?.paymentMethod ?? reservation.paymentMethod
  ) as ReservationPaymentMethod;
  const paymentStatus = deriveReservationPaymentStatus(reservation);
  const commercialStatus = deriveCommercialStatus(reservation);
  const operationalStatus = deriveOperationalStatus(reservation);
  const voucherStatus = deriveVoucherStatus(reservation);
  const customerConfirmationEmailStatus = deriveCustomerConfirmationEmailStatus(reservation);
  const customerVoucherEmailStatus = deriveCustomerVoucherEmailStatus(reservation);
  const customerEmailStatus = customerConfirmationEmailStatus;
  const adminEmailStatus = deriveAdminEmailStatus(reservation);
  const publicState = formatReservationPublicState(reservation);

  return {
    paymentMethod,
    paymentMethodLabel: paymentMethodLabel(paymentMethod),
    paymentStatus,
    paymentStatusLabel: paymentStatusLabel(paymentStatus),
    commercialStatus,
    commercialStatusLabel: commercialStatusLabel(commercialStatus),
    operationalStatus,
    operationalStatusLabel: operationalStatusLabel(operationalStatus),
    voucherStatus,
    customerConfirmationEmailStatus,
    customerVoucherEmailStatus,
    customerEmailStatus,
    adminEmailStatus,
    publicState,
  };
}
