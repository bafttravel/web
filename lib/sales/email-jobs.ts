import type { Timestamp } from 'firebase/firestore';

export type VentaEmailJobType =
  | 'vendedor_aviso'
  | 'cliente_confirmacion_compra'
  | 'cliente_voucher_48hs'
  | 'cliente_confirmacion'
  | 'admin_aviso';
export type VentaEmailJobStatus = 'pending' | 'sending' | 'sent' | 'failed';

export function emailDeliveryPathForJobType(type: VentaEmailJobType): string {
  if (type === 'vendedor_aviso') return 'emailDelivery.vendorNotification';
  if (type === 'admin_aviso') return 'emailDelivery.adminNotification';
  if (type === 'cliente_confirmacion_compra') return 'emailDelivery.customerConfirmation';
  if (type === 'cliente_voucher_48hs') return 'emailDelivery.customerVoucher';
  return 'emailDelivery.customerVoucher';
}

export function buildEmailJobDocument(input: {
  type: VentaEmailJobType;
  to: string;
  from: string | null;
  replyTo?: string | null;
  subject: string;
  html: string;
  text?: string | null;
  reservationId: string;
  now: Timestamp;
  nextAttemptAt?: Timestamp;
  extra?: Record<string, unknown>;
}) {
  return {
    type: input.type,
    status: 'pending' as VentaEmailJobStatus,
    to: input.to,
    from: input.from,
    replyTo: input.replyTo ?? null,
    subject: input.subject,
    html: input.html,
    text: input.text ?? null,
    attempts: 0,
    lastError: null,
    reservationId: input.reservationId,
    nextAttemptAt: input.nextAttemptAt ?? input.now,
    createdAt: input.now,
    updatedAt: input.now,
    ...(input.extra ?? {}),
  };
}

export function buildEmailDeliveryState(input: {
  status: 'queued' | 'sent' | 'failed';
  now: Timestamp;
  jobId: string;
  provider?: string | null;
  providerMessageId?: string | null;
  error?: string | null;
}) {
  return {
    status: input.status,
    lastAttemptAt: input.now,
    sentAt: input.status === 'sent' ? input.now : null,
    error: input.error ?? null,
    provider: input.provider ?? 'resend',
    providerMessageId: input.providerMessageId ?? null,
    jobId: input.jobId,
  };
}
