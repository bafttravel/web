import { NextResponse } from 'next/server';
import { getPayment, isPaymentApproved, isPaymentRejected, mapPaymentStatusToReservationStatus } from '@/lib/mercadopago';
import { getFromEmail, isResendConfigured, resend } from '@/lib/resend';
import { getPaqueteById } from '@/lib/paquetes';
import { CONTACT_INFO, SITE_NAME } from '@/lib/constants';
import {
  buildClienteCompraConfirmadaHtml,
  buildClienteCompraConfirmadaText,
  buildClienteVoucher48hsHtml,
  buildClienteVoucher48hsText,
  buildAdminNuevaReservaHtml,
  buildAdminNuevaReservaText,
} from '@/lib/emails/reserva-confirmada';
import { db } from '@/lib/firebase';
import { resolveReferralFromCode, computeCommission, nextPayoutStatusForReservationStatus } from '@/lib/referrals';
import { getSeatDepartureId, seatIdsFromLabels } from '@/lib/seats/server';
import type { SeatLayoutTemplate } from '@/types';
import {
  normalizeDigits,
  normalizeEmail,
  reserveNextReservationCode,
} from '@/lib/reservas/code';
import { buildDefaultEmailDelivery, buildQueuedEmailDelivery } from '@/lib/sales/status';
import { buildReservationPricingSnapshot } from '@/lib/sales/orchestrator';
import { resolveDepartureConfig } from '@/lib/packages/resolve-departure';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  arrayUnion,
  limit as firestoreLimit,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

export const runtime = 'nodejs';

// Tipos de notificaciones de Mercado Pago
type MPNotification = {
  id: number;
  live_mode: boolean;
  type: 'payment' | 'merchant_order' | 'subscription' | 'invoice' | 'point_integration_wh';
  date_created: string;
  user_id: number;
  api_version: string;
  action: 'payment.created' | 'payment.updated' | 'payment.cancelled' | string;
  data: {
    id: string;
  };
};

function buildNotificationFromRequest(params: {
  body: unknown;
  searchParams: URLSearchParams;
}): MPNotification | null {
  const body = (params.body && typeof params.body === 'object' ? params.body : {}) as Record<string, any>;
  const searchParams = params.searchParams;

  const type =
    String(
      body.type ??
        body.topic ??
        searchParams.get('type') ??
        searchParams.get('topic') ??
        ''
    ).trim() || null;

  const paymentId =
    String(
      body?.data?.id ??
        body['data.id'] ??
        searchParams.get('data.id') ??
        searchParams.get('id') ??
        ''
    ).trim() || null;

  if (!type || !paymentId) return null;

  return {
    id: Number(body.id ?? searchParams.get('id') ?? Date.now()),
    live_mode: Boolean(body.live_mode ?? true),
    type: type as MPNotification['type'],
    date_created: String(body.date_created ?? new Date().toISOString()),
    user_id: Number(body.user_id ?? 0),
    api_version: String(body.api_version ?? 'v1'),
    action: String(body.action ?? `${type}.updated`),
    data: {
      id: paymentId,
    },
  };
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? 0 : ms;
  }
  const anyValue = value as any;
  if (typeof anyValue?.toMillis === 'function') return anyValue.toMillis();
  if (typeof anyValue?.seconds === 'number') return anyValue.seconds * 1000;
  return 0;
}

function formatAmount(amountTotal: number, currency: string): string {
  const value = amountTotal / 100;
  if (currency === 'brl') return `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  if (currency === 'usd') return `USD ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$ ${value.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

/**
 * Desglose de precios para emails y snapshots: subtotal base + cada extra
 * (adicionales, gastos administrativos) con su monto efectivo según scope.
 */
function buildPriceBreakdown(input: {
  rawExtras: any;
  baseSubtotalAmount: unknown;
  people: number;
  currency: string;
  peopleLabel: string;
}): {
  baseSubtotalLabel?: string;
  extrasItems?: Array<{ label: string; amountFormatted: string }>;
  selectedExtras: any[] | null;
  extrasTotalAmount?: number | null;
} {
  const rawExtras = Array.isArray(input.rawExtras) ? input.rawExtras : [];
  const people = Math.max(1, Math.floor(input.people) || 1);
  let extrasCents = 0;
  const extrasItems: Array<{ label: string; amountFormatted: string }> = [];
  for (const extra of rawExtras) {
    const label = String(extra?.label ?? '').trim();
    const amount = Math.max(0, Number(extra?.amount ?? 0) || 0);
    const scope = String(extra?.scope ?? 'per_person');
    if (!label || amount <= 0) continue;
    const effective = scope === 'per_booking' ? amount : amount * people;
    extrasCents += effective;
    extrasItems.push({ label, amountFormatted: formatAmount(effective, input.currency) });
  }

  const baseSubtotalAmount =
    typeof input.baseSubtotalAmount === 'number' && input.baseSubtotalAmount > 0 ? Number(input.baseSubtotalAmount) : null;
  const hasBreakdown = Boolean(baseSubtotalAmount) || extrasItems.length > 0;

  return {
    ...(baseSubtotalAmount
      ? { baseSubtotalLabel: `${formatAmount(baseSubtotalAmount, input.currency)} (${input.peopleLabel || `${people} pasajeros`})` }
      : {}),
    ...(extrasItems.length > 0 ? { extrasItems } : {}),
    selectedExtras: rawExtras.length > 0 ? rawExtras : null,
    ...(hasBreakdown ? { extrasTotalAmount: extrasCents } : {}),
  };
}

function formatDate(date: string): string {
  if (!date || date === 'sin-fecha') return 'A coordinar';
  try {
    return new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return date;
  }
}

function computeVoucherNextAttemptAt(params: {
  date: string;
  now: Timestamp;
}): Timestamp {
  const date = String(params.date ?? '').trim();
  if (!date || date === 'sin-fecha') return params.now;
  const hhmm = '09:00';
  const ts = new Date(`${date}T${hhmm}:00-03:00`).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return params.now;
  const dueMs = ts - 48 * 60 * 60 * 1000;
  const nowMs = params.now.toMillis();
  if (dueMs <= nowMs + 30 * 1000) return params.now;
  return Timestamp.fromMillis(dueMs);
}

/**
 * Envía un email con Resend si está configurado. Devuelve el id del proveedor
 * o null cuando no se pudo enviar (para que el job quede pendiente y el cron
 * lo reintente). Nunca lanza: fallar el envío no debe romper el webhook.
 */
async function trySendEmailNow(input: {
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  replyTo?: string | null;
  from: string;
}): Promise<string | null> {
  if (!isResendConfigured() || !resend) return null;
  try {
    const { data, error } = await resend.emails.send({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? undefined,
      replyTo: input.replyTo ?? undefined,
    });
    if (error) {
      console.error('[mercadopago-webhook] Resend rechazó el email:', error);
      return null;
    }
    return data?.id ?? 'sent';
  } catch (error) {
    console.error('[mercadopago-webhook] No se pudo enviar el email ahora:', error);
    return null;
  }
}

async function recordMPNotification(params: {
  notificationId: string;
  type: string;
  action: string;
  paymentId?: string;
  externalReference?: string;
  status: 'received' | 'processed' | 'ignored' | 'failed';
  reason?: string | null;
  reservationId?: string | null;
  error?: string | null;
}) {
  try {
    await setDoc(
      doc(db, 'mercadoPagoNotifications', params.notificationId),
      {
        ...params,
        processedAt: Timestamp.now(),
      },
      { merge: true }
    );
  } catch {
    // no-op: no crítico
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const body = await request.json().catch(() => null);
    const notification = buildNotificationFromRequest({ body, searchParams: url.searchParams });

    // Validar que sea una notificación válida
    if (!notification || !notification.type || !notification.data?.id) {
      return NextResponse.json({ error: 'Notificación inválida' }, { status: 400 });
    }

    const notificationId = `mp_${notification.id}_${notification.date_created || Date.now()}`;

    // Solo procesamos notificaciones de tipo payment
    if (notification.type !== 'payment') {
      await recordMPNotification({
        notificationId,
        type: notification.type,
        action: notification.action,
        status: 'ignored',
        reason: 'not_payment_type',
      });
      return NextResponse.json({ received: true });
    }

    // Obtener información del pago desde Mercado Pago
    const paymentId = notification.data.id;
    let paymentInfo: any;
    
    try {
      paymentInfo = await getPayment(String(paymentId));
    } catch (error) {
      console.error('[mercadopago-webhook] Error obteniendo pago:', error);
      await recordMPNotification({
        notificationId,
        type: notification.type,
        action: notification.action,
        paymentId: String(paymentId),
        status: 'failed',
        reason: 'fetch_payment_error',
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ error: 'Error obteniendo pago' }, { status: 500 });
    }

    if (!paymentInfo || !paymentInfo.external_reference) {
      await recordMPNotification({
        notificationId,
        type: notification.type,
        action: notification.action,
        paymentId: String(paymentId),
        status: 'ignored',
        reason: 'no_external_reference',
      });
      return NextResponse.json({ received: true });
    }

    const externalReference = paymentInfo.external_reference || '';
    const paymentStatus = paymentInfo.status;
    const isApproved = isPaymentApproved(paymentStatus);

    let orderIdFromRef = '';
    const externalRefStr = String(externalReference || '');
    if (externalRefStr.startsWith('order-')) {
      orderIdFromRef = externalRefStr.slice('order-'.length);
    }

    let orderData: any = null;
    if (orderIdFromRef) {
      const orderSnap = await getDoc(doc(db, 'orders', orderIdFromRef));
      if (orderSnap.exists()) {
        orderData = { id: orderSnap.id, ...(orderSnap.data() as any) };
      }
    }

    let intentData: any = null;
    let intentId = '';
    if (orderData?.checkoutIntentId) {
      const iSnap = await getDoc(doc(db, 'checkoutIntents', String(orderData.checkoutIntentId)));
      if (iSnap.exists()) {
        intentId = iSnap.id;
        intentData = iSnap.data();
      }
    }
    
    try {
      if (!intentData) {
        const col = collection(db, 'checkoutIntents');
        const q = query(col, where('externalReference', '==', externalReference), firestoreLimit(1));
        const snap = await getDocs(q);
        const d0 = snap.docs[0];
        if (d0) {
          intentId = d0.id;
          intentData = d0.data();
        }
      }
    } catch {
      // no-op
    }

    if (!intentData) {
      await recordMPNotification({
        notificationId,
        type: notification.type,
        action: notification.action,
        paymentId: String(paymentId),
        externalReference,
        status: 'ignored',
        reason: 'intent_not_found',
      });
      return NextResponse.json({ received: true });
    }

    const cartId = orderData?.cartId ?? intentData.cartId;
    const cartItems = Array.isArray(orderData?.items) ? orderData.items : (Array.isArray(intentData.items) ? intentData.items : null);
    const orderId = orderData?.id ? String(orderData.id) : '';
    if (cartId && cartItems && cartItems.length) {
      const reservationStatus = mapPaymentStatusToReservationStatus(paymentStatus);
      const isPixPending = paymentStatus === 'pending' || paymentStatus === 'in_process';
      const isRejected = isPaymentRejected(paymentStatus);

      const payer = paymentInfo.payer;
      const customerEmail = payer?.email || intentData.customerEmail || '';
      const customerName = payer?.first_name
        ? `${payer.first_name} ${payer.last_name || ''}`.trim()
        : intentData.customerName || '';
      const customerPhone = payer?.phone?.number || intentData.customerPhone || '';
      const customerDocument = payer?.identification?.number || intentData.customerDocument || '';
      const customerBirthDate =
        (orderData?.customer?.birthDate ? String(orderData.customer.birthDate) : '') ||
        (intentData.customerBirthDate ? String(intentData.customerBirthDate) : '') ||
        null;
      const customerAge = typeof intentData.customerAge === 'number' ? intentData.customerAge : null;
      const customerHotel = intentData.customerHotel ? String(intentData.customerHotel) : null;
      const customerCountry =
        (orderData?.customer?.country ? String(orderData.customer.country) : '') ||
        (intentData.customerCountry ? String(intentData.customerCountry) : '') ||
        null;
      const passengerDetails = Array.isArray(orderData?.passengerDetails)
        ? orderData.passengerDetails
        : (Array.isArray(intentData.passengerDetails) ? intentData.passengerDetails : null);
      const intentComments = intentData.customerComments || null;

      const from = getFromEmail(true);
      const replyTo = process.env.SUPPORT_EMAIL || getFromEmail(false);
      const now = Timestamp.now();

      const cartRef = doc(db, 'carts', String(cartId));
      const orderRef = orderId ? doc(db, 'orders', orderId) : null;

      const pkgs = new Map<string, Awaited<ReturnType<typeof getPaqueteById>> | null>();
      for (const it of cartItems) {
        const pid = String(it.packageId || '');
        if (!pid || pkgs.has(pid)) continue;
        pkgs.set(pid, await getPaqueteById(pid));
      }

      // Reservar códigos secuenciales ANTES de la transacción: un código
      // único por cada item del carrito que aún no tenga reserva. Así la tx
      // solo lee primero y escribe después (Firestore lo exige) y ningún item
      // del mismo pago comparte código.
      let reservedCodes: string[] = [];
      if (isApproved) {
        try {
          for (let i = 0; i < cartItems.length; i += 1) {
            reservedCodes.push(await reserveNextReservationCode());
          }
        } catch (error) {
          console.error('[mercadopago-webhook] No se pudieron reservar códigos:', error);
          return NextResponse.json({ error: 'No se pudo generar el código de reserva' }, { status: 500 });
        }
      }

      // Guard: evitar enviar emails duplicados si el pago ya fue procesado
      // (Mercado Pago puede reenviar la misma notificación por timeout).
      if (cartId) {
        const cartDupSnap = await getDoc(cartRef);
        if (cartDupSnap.exists()) {
          const cartProcessed = Array.isArray(cartDupSnap.data()?.processedPaymentIds)
            ? cartDupSnap.data().processedPaymentIds.map(String)
            : [];
          if (cartProcessed.includes(String(paymentId))) {
            await recordMPNotification({
              notificationId,
              type: notification.type,
              action: notification.action,
              paymentId: String(paymentId),
              externalReference,
              status: 'ignored',
              reason: 'payment_already_processed',
              reservationId: orderId || null,
            });
            return NextResponse.json({ received: true });
          }
        }
      }

      // Envío inmediato de emails (no depende del cron): se preparan los
      // cuerpos por item usando su propio código y se envían con Resend.
      // Si el envío funciona, el job se guarda como "sent"; si no, queda
      // "pending" para que el cron lo reintente.
      const sendResults: { confirm: Record<string, string>; voucher: Record<string, string>; admin: Record<string, string> } = {
        confirm: {},
        voucher: {},
        admin: {},
      };
      if (isApproved) {
        for (let idx = 0; idx < cartItems.length; idx += 1) {
          const it = cartItems[idx] as any;
          const reservationId = orderId
            ? `ord_${orderId}_${String(it.cartItemId || it.id || `idx_${idx}`)}`
            : `mp_${paymentId}_${String(it.cartItemId || it.id || `idx_${idx}`)}`;
          const code = reservedCodes[idx] ?? '';
          const pkg = pkgs.get(String(it.packageId || '')) ?? null;
          const finalTitle = String(it.packageTitle || it.experienceTitle || '') || pkg?.titulo || SITE_NAME;
          const itemDate = String(it.date || 'sin-fecha');
          const itemPeople = Number(it.people ?? 0) || 0;
          const itemCurrency = String(it.currency || intentData.currency || 'ars');
          const itemAmount = Number(it.subtotalAmount ?? it.amountTotal ?? 0) || 0;
          const itemPeopleLabel = itemPeople === 1 ? '1 persona' : `${itemPeople} personas`;
          const breakdown = buildPriceBreakdown({
            rawExtras: (it as any).selectedExtras ?? intentData.selectedExtras,
            baseSubtotalAmount: (it as any).baseSubtotalAmount ?? intentData.baseSubtotalAmount,
            people: itemPeople,
            currency: itemCurrency,
            peopleLabel: itemPeopleLabel,
          });
          const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
          const itemLookupUrl = siteUrl && code ? `${siteUrl}/consultar-reserva?code=${encodeURIComponent(code)}` : undefined;
          const itemEmailData = {
            customerName,
            experienceTitle: finalTitle,
            dateFormatted: formatDate(itemDate),
            peopleLabel: itemPeopleLabel,
            seatsLabel: Array.isArray((it as any).selectedSeats) && (it as any).selectedSeats.length
              ? (it as any).selectedSeats.map((s: any) => String(s)).join(', ')
              : undefined,
            amountFormatted: formatAmount(itemAmount || 0, itemCurrency),
            ...breakdown,
            reservationCode: code,
            lookupUrl: itemLookupUrl,
            sessionId: reservationId,
            customerEmail,
            customerPhone: customerPhone || undefined,
            customerCountry: customerCountry || undefined,
            customerComments: intentComments || undefined,
          };
          // Los jobs se crean dentro de la transacción y los procesa el cron.
          // No enviar desde antes de la transacción: webhook duplicado + flujo
          // de retorno pueden ejecutarse en paralelo y mandar dos emails.
        }
      }

      try {
        await runTransaction(db, async (tx) => {
          const pendingWrites: Array<() => void> = [];
          const queueUpdate = (ref: any, data: any) => {
            pendingWrites.push(() => tx.update(ref, data));
          };
          const queueSet = (ref: any, data: any, options?: any) => {
            pendingWrites.push(() => (options ? tx.set(ref, data, options) : tx.set(ref, data)));
          };
          const flushWrites = () => {
            for (const write of pendingWrites) write();
          };
          let orderSnap: any = null;
          let order: any = null;
          if (orderRef) {
            orderSnap = await tx.get(orderRef);
            if (!orderSnap.exists()) return;
            order = orderSnap.data();
            const processed = Array.isArray(order.processedPaymentIds) ? order.processedPaymentIds.map(String) : [];
            if (processed.includes(String(paymentId))) {
              return;
            }
            const alreadyPaid = String(order.status ?? '') === 'paid';
            const prevPaymentId = order?.payment?.paymentId ? String(order.payment.paymentId) : '';
            if (alreadyPaid && prevPaymentId && prevPaymentId !== String(paymentId)) {
              return;
            }
          }

          const cartSnap = await tx.get(cartRef);
          if (cartSnap.exists()) {
            const cartData: any = cartSnap.data();
            const alreadyPaid = String(cartData.status ?? '') === 'paid';
            const prevPaymentId = cartData.mercadoPagoPaymentId ? String(cartData.mercadoPagoPaymentId) : '';
            if (alreadyPaid && prevPaymentId && prevPaymentId !== String(paymentId)) {
              return;
            }
            const nextStatus = isApproved ? 'paid' : (isRejected ? 'cancelled' : 'checkout_started');
            queueUpdate(cartRef, {
              status: nextStatus,
              mercadoPagoPaymentId: String(paymentId),
              mercadoPagoStatus: paymentStatus,
              updatedAt: now,
            });
            if (orderRef && orderId && !cartData.orderId) {
              queueUpdate(cartRef, { orderId, updatedAt: now });
            }
          }

          if (orderRef) {
            const pendingRaw = process.env.PENDING_HOLD_MINUTES;
            const pendingParsed = pendingRaw ? parseInt(pendingRaw, 10) : NaN;
            const pendingMinutes = Number.isFinite(pendingParsed) && pendingParsed >= 5 && pendingParsed <= 1440 ? pendingParsed : 60;
            const pendingExpiresAt = Timestamp.fromMillis(now.toMillis() + pendingMinutes * 60 * 1000);
            const nextOrderStatus = isApproved ? 'paid' : (isRejected ? 'cancelled' : (isPixPending ? 'pending' : 'checkout_started'));
            queueUpdate(orderRef, {
              status: nextOrderStatus,
              expiresAt: isPixPending ? pendingExpiresAt : (order?.expiresAt ?? now),
              failureReason: isApproved ? null : (order?.failureReason ?? null),
              failureReasonDetail: isApproved ? null : (order?.failureReasonDetail ?? null),
              processedPaymentIds: arrayUnion(String(paymentId)),
              payment: {
                provider: 'mercadopago',
                externalReference: externalRefStr,
                preferenceId: order?.payment?.preferenceId ?? intentData.mercadoPagoPreferenceId ?? null,
                initPoint: order?.payment?.initPoint ?? intentData.mercadoPagoInitPoint ?? null,
                paymentId: String(paymentId),
                status: isApproved ? 'approved' : (isRejected ? 'rejected' : (isPixPending ? 'pending' : 'unknown')),
                statusDetail: paymentInfo.status_detail ?? null,
                updatedAt: now,
              },
              paidAt: isApproved ? now : (order?.paidAt ?? null),
              updatedAt: now,
            });
          }

          if (orderRef && isApproved) {
            let holdsOk = true;
            let holdValidationFailure: string | null = null;
            for (let idx = 0; idx < cartItems.length; idx += 1) {
              const it = cartItems[idx] as any;
              const holdId = it.holdId ? String(it.holdId) : '';
              const cartItemId = String(it.cartItemId || it.id || `idx_${idx}`);
              const packageId = String(it.packageId || it.experienceId || '');
              const date = String(it.date || '');
              const people = Number(it.people ?? 0);
              if (!holdId || !packageId || !date || !people || people < 1) {
                holdsOk = false;
                holdValidationFailure = 'missing_hold_context';
                break;
              }
              const holdRef = doc(db, 'reservationHolds', holdId);
              const holdSnap = await tx.get(holdRef);
              if (!holdSnap.exists()) {
                holdsOk = false;
                holdValidationFailure = 'hold_not_found';
                break;
              }
              const hold: any = holdSnap.data();
              const holdStatus = String(hold.status ?? '');
              if (holdStatus !== 'active' && holdStatus !== 'released' && holdStatus !== 'consumed') {
                holdsOk = false;
                holdValidationFailure = `hold_status_${holdStatus || 'unknown'}`;
                break;
              }
              const expiresMs = toMillis(hold.expiresAt);
              if (holdStatus === 'active' && expiresMs > 0 && expiresMs <= now.toMillis()) {
                holdValidationFailure = 'hold_expired_recovery';
              }
              const cartItemRef = doc(db, 'carts', String(cartId), 'items', cartItemId);
              const cartItemSnap = await tx.get(cartItemRef);
              if (!cartItemSnap.exists()) {
                holdsOk = false;
                holdValidationFailure = 'cart_item_not_found';
                break;
              }
              const cartItem: any = cartItemSnap.data();
              const cartItemHoldStatus = String(cartItem.holdStatus ?? '');
              if (
                cartItemHoldStatus !== 'active' &&
                cartItemHoldStatus !== 'released' &&
                cartItemHoldStatus !== 'consumed'
              ) {
                holdsOk = false;
                holdValidationFailure = `cart_item_hold_status_${cartItemHoldStatus || 'unknown'}`;
                break;
              }
              const itemExpiresMs = toMillis(cartItem.expiresAt);
              if (cartItemHoldStatus === 'active' && itemExpiresMs > 0 && itemExpiresMs <= now.toMillis()) {
                holdValidationFailure = 'cart_item_expired_recovery';
              }

              const seatLabels = Array.isArray(cartItem.selectedSeats) && cartItem.selectedSeats.length
                ? cartItem.selectedSeats.map((s: any) => String(s))
                : Array.isArray(hold.selectedSeats) && hold.selectedSeats.length
                  ? hold.selectedSeats.map((s: any) => String(s))
                  : [];
              if (seatLabels.length > 0) {
                const seatResRef = doc(db, 'seatReservations', getSeatDepartureId(packageId, date));
                const seatResSnap = await tx.get(seatResRef);
                if (!seatResSnap.exists()) {
                  holdsOk = false;
                  holdValidationFailure = 'seat_reservation_missing';
                  break;
                }
                const seatResData: any = seatResSnap.data();
                const seatLayoutId =
                  (typeof cartItem?.seatLayoutId === 'string' ? cartItem.seatLayoutId.trim() : '') ||
                  (typeof hold?.seatLayoutId === 'string' ? hold.seatLayoutId.trim() : '') ||
                  String(seatResData?.seatLayoutId ?? '');
                if (!seatLayoutId) {
                  holdsOk = false;
                  holdValidationFailure = 'seat_layout_missing';
                  break;
                }
                const templateSnap = await tx.get(doc(db, 'seatLayouts', seatLayoutId));
                if (!templateSnap.exists()) {
                  holdsOk = false;
                  holdValidationFailure = 'seat_layout_template_missing';
                  break;
                }
                const template = { id: templateSnap.id, ...(templateSnap.data() as any) } as SeatLayoutTemplate;
                const seatIds = seatIdsFromLabels(template, seatLabels);
                if (seatIds.length !== seatLabels.length) {
                  holdsOk = false;
                  holdValidationFailure = 'seat_labels_unresolved';
                  break;
                }
                const seatsMap: Record<string, any> = seatResData?.seats ?? {};
                for (const seatId of seatIds) {
                  const seat = seatsMap[seatId];
                  if (!seat) {
                    holdsOk = false;
                    holdValidationFailure = 'seat_not_found';
                    break;
                  }
                  const seatStatus = String(seat.status ?? '');
                  const seatHoldId = String(seat.holdId ?? '');
                  const seatOrderId = String(seat.orderId ?? '');
                  const canRecoverSeat =
                    seatStatus === 'available' ||
                    ((seatStatus === 'held' || seatStatus === 'reserved') && seatHoldId === holdId) ||
                    (seatStatus === 'paid' && seatOrderId === String(orderId));
                  if (!canRecoverSeat) {
                    holdsOk = false;
                    holdValidationFailure =
                      seatStatus === 'paid' && seatOrderId && seatOrderId !== String(orderId)
                        ? 'seat_paid_by_other_order'
                        : seatStatus === 'held' || seatStatus === 'reserved'
                          ? 'seat_hold_mismatch'
                          : `seat_status_${seatStatus || 'unknown'}`;
                    break;
                  }
                }
                if (!holdsOk) break;
              }
            }

            if (!holdsOk) {
              if (orderRef) {
                queueUpdate(orderRef, {
                  status: 'needs_review',
                  failureReason: 'holds_or_seats_invalid',
                  failureReasonDetail: holdValidationFailure ?? 'unknown',
                  updatedAt: now,
                });
              }
              flushWrites();
              return;
            }
          }

          for (let idx = 0; idx < cartItems.length; idx += 1) {
            const it = cartItems[idx] as any;
            const packageId = String(it.packageId || it.experienceId || '');
            const packageSlug = String(it.packageSlug || it.experienceSlug || '');
            const packageTitle = String(it.packageTitle || it.experienceTitle || '');
            const date = String(it.date || 'sin-fecha');
            const people = Number(it.people ?? 0);
            const currency = String(it.currency || intentData.currency || 'ars');
            const amountTotalItem = Number(it.subtotalAmount ?? it.amountTotal ?? 0);
            const unitAmount = Number(it.unitAmount ?? 0);
            const pricingMode = (it as any).pricingMode ? String((it as any).pricingMode) : null;
            const pricingBaseUnitAmount = typeof (it as any).pricingBaseUnitAmount === 'number' ? Number((it as any).pricingBaseUnitAmount) : null;
            const unitAmountAdults = typeof (it as any).unitAmountAdults === 'number' ? Number((it as any).unitAmountAdults) : null;
            const unitAmountMinors = typeof (it as any).unitAmountMinors === 'number' ? Number((it as any).unitAmountMinors) : null;
            const depositPercentAdults = typeof (it as any).depositPercentAdults === 'number' ? Number((it as any).depositPercentAdults) : null;
            const depositPercentMinors = typeof (it as any).depositPercentMinors === 'number' ? Number((it as any).depositPercentMinors) : null;
            const holdId = it.holdId ? String(it.holdId) : null;
            const cartItemId = String(it.cartItemId || it.id || `idx_${idx}`);
            const referralCode = String(it.referralCode || intentData.referral?.code || '');

            if (!packageId || !people || people < 1) continue;

            const pkg = pkgs.get(packageId) ?? null;
            const finalPackageTitle = packageTitle || pkg?.titulo || '';

            const peopleLabel = people === 1 ? '1 persona' : `${people} personas`;
            const amountFormatted = formatAmount(amountTotalItem || (paymentInfo.transaction_amount ? Math.round(paymentInfo.transaction_amount * 100) : 0), currency);
            const dateFormatted = formatDate(date);
            const itemPriceBreakdown = buildPriceBreakdown({
              rawExtras: (it as any).selectedExtras ?? intentData.selectedExtras,
              baseSubtotalAmount: (it as any).baseSubtotalAmount ?? intentData.baseSubtotalAmount,
              people,
              currency,
              peopleLabel,
            });

            const reservationId = orderId ? `ord_${orderId}_${cartItemId}` : `mp_${paymentId}_${cartItemId}`;
            const reservaRef = doc(db, 'reservas', reservationId);
            const emailClienteConfirmRef = doc(
              db,
              'emailJobs',
              orderId ? `ord_${orderId}_${cartItemId}_cliente_confirm` : `mp_${reservationId}_cliente_confirm`
            );
            const emailClienteVoucherRef = doc(
              db,
              'emailJobs',
              orderId ? `ord_${orderId}_${cartItemId}_cliente_voucher` : `mp_${reservationId}_cliente_voucher`
            );
            const emailAdminRef = doc(db, 'emailJobs', orderId ? `ord_${orderId}_${cartItemId}_admin` : `mp_${reservationId}_admin`);
            const paymentRef = doc(collection(db, 'reservas', reservationId, 'payments'), String(paymentId));

            const reservaSnap = await tx.get(reservaRef);
            const emailClienteConfirmSnap = await tx.get(emailClienteConfirmRef);
            const emailClienteVoucherSnap = await tx.get(emailClienteVoucherRef);
            const emailAdminSnap = await tx.get(emailAdminRef);
            const paymentSnap = await tx.get(paymentRef);

            if (!reservaSnap.exists()) {
              // El código se asigna fuera de esta transacción (cada
              // carrito con N items necesita N códigos; reservarlos uno por
              // uno dentro de la tx rompe la regla reads-antes-de-writes).
              let referredBy: any = undefined;
              if (referralCode) {
                const resolved = await resolveReferralFromCode(referralCode);
                if (resolved) {
                  const commissionOverride =
                    pkg?.bookingConfig?.referralCommission
                      ? {
                          type: pkg.bookingConfig.referralCommission.type,
                          value: pkg.bookingConfig.referralCommission.value,
                          currency: pkg.bookingConfig.referralCommission.currency,
                        }
                      : undefined;
                  const comm = computeCommission({
                    amountTotal: amountTotalItem || (paymentInfo.transaction_amount ? Math.round(paymentInfo.transaction_amount * 100) : 0),
                    people,
                    vendor: resolved.vendor,
                    commissionOverride,
                  });
                  const payoutStatus = nextPayoutStatusForReservationStatus(reservationStatus === 'completed' ? 'completed' : 'pending');
                  referredBy = {
                    vendorId: resolved.vendor.id,
                    vendorName: resolved.vendor.name,
                    code: resolved.code,
                    channel: 'link',
                    commissionType: comm.type,
                    commissionValue: comm.value,
                    commissionCurrency: comm.currency,
                    commissionAmount: comm.commissionAmount,
                    payoutStatus,
                  };
                }
              }

              const reservationCode = reservedCodes[idx] ?? `TMP-${reservationId.slice(-8).toUpperCase()}`;
              const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
              const lookupUrl = siteUrl
                ? `${siteUrl}/consultar-reserva?code=${encodeURIComponent(reservationCode)}`
                : undefined;

              const emailData = {
                customerName: customerName || '',
                experienceTitle: finalPackageTitle || SITE_NAME,
                dateFormatted,
                peopleLabel,
                seatsLabel: Array.isArray((it as any).selectedSeats) && (it as any).selectedSeats.length
                  ? (it as any).selectedSeats.map((s: any) => String(s)).join(', ')
                  : undefined,
                amountFormatted,
                ...itemPriceBreakdown,
                reservationCode,
                lookupUrl,
                sessionId: reservationId,
                customerEmail: customerEmail || '',
                customerPhone: customerPhone || undefined,
                customerCountry: customerCountry || undefined,
                customerComments: intentComments || undefined,
              };
              const htmlConfirm = buildClienteCompraConfirmadaHtml(emailData);
              const textConfirm = buildClienteCompraConfirmadaText(emailData);
              const htmlVoucher = buildClienteVoucher48hsHtml(emailData);
              const textVoucher = buildClienteVoucher48hsText(emailData);
              const htmlAdmin = buildAdminNuevaReservaHtml(emailData);
              const textAdmin = buildAdminNuevaReservaText(emailData);
              const nextAttemptAtVoucher = computeVoucherNextAttemptAt({ date, now });
              const shouldQueueVoucher = Boolean(date && date !== 'sin-fecha');

              queueSet(reservaRef, {
                ...(orderId ? { orderId } : {}),
                cartId: String(cartId),
                cartItemId,
                packageId,
                packageSlug,
                packageTitle: finalPackageTitle,
                experienceId: packageId,
                experienceSlug: packageSlug,
                experienceTitle: finalPackageTitle,
                date,
                people,
                peopleAdults: typeof (it as any).peopleAdults === 'number' ? Number((it as any).peopleAdults) : null,
                peopleMinors: typeof (it as any).peopleMinors === 'number' ? Number((it as any).peopleMinors) : null,
                seatLayoutId:
                  (typeof (it as any).seatLayoutId === 'string' ? String((it as any).seatLayoutId).trim() : '') ||
                  (pkg ? resolveDepartureConfig(pkg, date).seatLayoutId : null),
                selectedSeats: Array.isArray((it as any).selectedSeats) ? (it as any).selectedSeats : null,
                pricingMode: pricingMode === 'percent' || pricingMode === 'fixed' ? pricingMode : null,
                pricingBaseUnitAmount: pricingBaseUnitAmount !== null ? pricingBaseUnitAmount : null,
                unitAmountAdults: unitAmountAdults !== null ? unitAmountAdults : null,
                unitAmountMinors: unitAmountMinors !== null ? unitAmountMinors : null,
                depositPercentAdults: depositPercentAdults !== null ? depositPercentAdults : null,
                depositPercentMinors: depositPercentMinors !== null ? depositPercentMinors : null,
                selectedExtras: itemPriceBreakdown.selectedExtras,
                baseSubtotalAmount:
                  typeof (it as any).baseSubtotalAmount === 'number'
                    ? Number((it as any).baseSubtotalAmount)
                    : typeof intentData.baseSubtotalAmount === 'number'
                      ? Number(intentData.baseSubtotalAmount)
                      : null,
                extrasTotalAmount: itemPriceBreakdown.extrasTotalAmount ?? null,
                amountTotal: amountTotalItem || Math.round(paymentInfo.transaction_amount * 100),
                currency: currency || paymentInfo.currency_id || 'ars',
                paymentMethod: 'mercadopago',
                mercadoPagoPaymentId: String(paymentId),
                mercadoPagoPreferenceId: intentData.mercadoPagoPreferenceId || null,
                mercadoPagoStatus: paymentStatus,
                mercadoPagoStatusDetail: paymentInfo.status_detail || null,
                externalReference,
                checkoutIntentId: intentId || null,
                customerEmail: customerEmail || '',
                customerEmailLower: normalizeEmail(customerEmail),
                customerName: customerName || '',
                customerNameLower: (customerName || '').trim().toLowerCase() || null,
                customerPhone: customerPhone || null,
                customerPhoneNormalized: normalizeDigits(customerPhone),
                customerCountry: customerCountry || payer?.address?.country || null,
                customerDocument: customerDocument || null,
                customerDocumentNormalized: normalizeDigits(customerDocument),
                customerBirthDate,
                customerAge,
                customerHotel,
                customerComments: intentComments || null,
                passengerDetails,
                reservationCode,
                status: isPixPending ? 'pending' : reservationStatus,
                createdByAdmin: false,
                attachments: [],
                pricingSnapshot: buildReservationPricingSnapshot({
                  unitAmount:
                    amountTotalItem > 0 && people > 0
                      ? Math.round(amountTotalItem / people)
                      : unitAmount > 0
                        ? unitAmount
                        : null,
                  people,
                  amountTotal: amountTotalItem || (paymentInfo.transaction_amount ? Math.round(paymentInfo.transaction_amount * 100) : 0),
                  baseSubtotalAmount:
                    typeof (it as any).baseSubtotalAmount === 'number'
                      ? Number((it as any).baseSubtotalAmount)
                      : typeof intentData.baseSubtotalAmount === 'number'
                        ? Number(intentData.baseSubtotalAmount)
                        : null,
                  extrasTotalAmount: itemPriceBreakdown.extrasTotalAmount ?? null,
                  currency: currency || paymentInfo.currency_id || 'ars',
                  paymentMethod: 'mercadopago',
                }),
                capacitySnapshot: {
                  date,
                  maxPeoplePerBooking: pkg ? resolveDepartureConfig(pkg, date).maxPeople : null,
                  hasSpecificDates: Boolean(pkg?.salidas?.length),
                  enabled: pkg ? resolveDepartureConfig(pkg, date).enabled : false,
                },
                packageSnapshot: { id: packageId, slug: packageSlug, title: finalPackageTitle },
                experienceSnapshot: { id: packageId, slug: packageSlug, title: finalPackageTitle },
                statusHistory: [
                  {
                    status: isPixPending ? 'pending' : reservationStatus,
                    actor: 'system',
                    note: isPixPending
                      ? `Pago iniciado en Mercado Pago (estado: ${paymentStatus})`
                      : `Pago confirmado por Mercado Pago (ID: ${paymentId})`,
                    createdAt: now,
                  },
                ],
                paidAt: isApproved ? now : null,
                voucherSent: false,
                voucherSentAt: null,
                voucherScheduledAt: isApproved && shouldQueueVoucher ? nextAttemptAtVoucher : null,
                emailDelivery: isApproved
                  ? buildQueuedEmailDelivery({
                      customerConfirmation: { jobId: emailClienteConfirmRef.id },
                      customerVoucher: shouldQueueVoucher
                        ? { jobId: emailClienteVoucherRef.id }
                        : { status: 'not_sent', jobId: null },
                      adminNotification: { jobId: emailAdminRef.id },
                    })
                  : buildDefaultEmailDelivery(),
                createdAt: now,
                updatedAt: now,
                ...(referredBy ? { referredBy } : {}),
              });
              if (orderRef && orderId) {
                queueUpdate(orderRef, { reservationIds: arrayUnion(reservationId), updatedAt: now });
              }

              if (!emailClienteConfirmSnap.exists() && customerEmail && isApproved) {
                const subjectConfirm = `Compra confirmada: ${finalPackageTitle || SITE_NAME}`;
                // Jobs "sent" cuando el envío inmediato funcionó: el cliente
                // recibe el email aunque el cron no esté configurado.
                const confirmSendId = sendResults.confirm[reservationId] ?? null;
                queueSet(emailClienteConfirmRef, {
                  type: 'cliente_confirmacion_compra',
                  status: confirmSendId ? 'sent' : 'pending',
                  to: customerEmail,
                  from,
                  replyTo,
                  subject: subjectConfirm,
                  html: htmlConfirm,
                  text: textConfirm,
                  attempts: confirmSendId ? 1 : 0,
                  lastError: null,
                  providerMessageId: confirmSendId,
                  sentAt: confirmSendId ? now : null,
                  mercadoPagoPaymentId: String(paymentId),
                  reservationId,
                  nextAttemptAt: now,
                  createdAt: now,
                  updatedAt: now,
                });
              }

              if (!emailClienteVoucherSnap.exists() && customerEmail && isApproved && shouldQueueVoucher) {
                const voucherSendId = sendResults.voucher[reservationId] ?? null;
                queueSet(emailClienteVoucherRef, {
                  type: 'cliente_voucher_48hs',
                  status: voucherSendId ? 'sent' : 'pending',
                  to: customerEmail,
                  from,
                  replyTo,
                  subject: `Recordatorio de salida (48 hs): ${finalPackageTitle || SITE_NAME}`,
                  html: htmlVoucher,
                  text: textVoucher,
                  attempts: voucherSendId ? 1 : 0,
                  lastError: null,
                  providerMessageId: voucherSendId,
                  sentAt: voucherSendId ? now : null,
                  mercadoPagoPaymentId: String(paymentId),
                  reservationId,
                  nextAttemptAt: nextAttemptAtVoucher,
                  createdAt: now,
                  updatedAt: now,
                });
              }

              if (!emailAdminSnap.exists() && CONTACT_INFO.email && isApproved) {
                const adminSendId = sendResults.admin[reservationId] ?? null;
                queueSet(emailAdminRef, {
                  type: 'admin_aviso',
                  status: adminSendId ? 'sent' : 'pending',
                  to: CONTACT_INFO.email,
                  from,
                  replyTo,
                  subject: `Nueva reserva: ${finalPackageTitle || 'Paquete'} — ${customerName || customerEmail}`,
                  html: htmlAdmin,
                  text: textAdmin,
                  attempts: adminSendId ? 1 : 0,
                  lastError: null,
                  providerMessageId: adminSendId,
                  sentAt: adminSendId ? now : null,
                  mercadoPagoPaymentId: String(paymentId),
                  reservationId,
                  nextAttemptAt: now,
                  createdAt: now,
                  updatedAt: now,
                });
              }

              if (!paymentSnap.exists()) {
                queueSet(paymentRef, {
                  method: 'mercadopago',
                  status: String(paymentStatus ?? 'unknown'),
                  amount: amountTotalItem || Math.round(paymentInfo.transaction_amount * 100),
                  currency: String(currency || paymentInfo.currency_id || 'ars').toLowerCase(),
                  message: isApproved
                    ? `Pago aprobado (ID: ${paymentId})`
                    : `Pago recibido (estado: ${paymentStatus || 'unknown'})`,
                  mercadoPagoPaymentId: String(paymentId),
                  createdAt: now,
                  updatedAt: now,
                });
              } else {
                queueSet(
                  paymentRef,
                  {
                    method: 'mercadopago',
                    status: String(paymentStatus ?? 'unknown'),
                    amount: amountTotalItem || Math.round(paymentInfo.transaction_amount * 100),
                    currency: String(currency || paymentInfo.currency_id || 'ars').toLowerCase(),
                    message: isApproved
                      ? `Pago aprobado (ID: ${paymentId})`
                      : `Pago recibido (estado: ${paymentStatus || 'unknown'})`,
                    mercadoPagoPaymentId: String(paymentId),
                    updatedAt: now,
                  },
                  { merge: true }
                );
              }
            } else {
              const updates: any = {
                status: reservationStatus,
                mercadoPagoStatus: paymentStatus,
                mercadoPagoStatusDetail: paymentInfo.status_detail || null,
                updatedAt: now,
              };
              if (isApproved) updates.paidAt = now;
              queueUpdate(reservaRef, {
                ...updates,
                statusHistory: arrayUnion({
                  status: reservationStatus,
                  actor: 'system',
                  note: `Actualización de Mercado Pago: ${paymentStatus}`,
                  createdAt: now,
                }),
              });
              queueSet(
                paymentRef,
                {
                  method: 'mercadopago',
                  status: String(paymentStatus ?? 'unknown'),
                  amount: amountTotalItem || Math.round(paymentInfo.transaction_amount * 100),
                  currency: String(currency || paymentInfo.currency_id || 'ars').toLowerCase(),
                  message: isApproved
                    ? `Pago aprobado (ID: ${paymentId})`
                    : `Actualización de pago (estado: ${paymentStatus || 'unknown'})`,
                  mercadoPagoPaymentId: String(paymentId),
                  updatedAt: now,
                  ...(paymentSnap.exists() ? {} : { createdAt: now }),
                },
                { merge: true }
              );
            }

            if (holdId && date) {
              const holdRef = doc(db, 'reservationHolds', holdId);
              const cartItemRef = doc(db, 'carts', String(cartId), 'items', cartItemId);
              if (isApproved) {
                const holdSnap = await tx.get(holdRef);
                const cartItemSnap = await tx.get(cartItemRef);
                const holdData: any = holdSnap.exists() ? holdSnap.data() : null;
                const cartItemData: any = cartItemSnap.exists() ? cartItemSnap.data() : null;
                if (holdSnap.exists()) queueUpdate(holdRef, { status: 'consumed', consumedAt: now, updatedAt: now });
                if (cartItemSnap.exists()) queueUpdate(cartItemRef, { holdStatus: 'consumed', updatedAt: now });
                const seatLabels = Array.isArray(cartItemData?.selectedSeats) && cartItemData.selectedSeats.length
                  ? cartItemData.selectedSeats.map((s: any) => String(s))
                  : Array.isArray(holdData?.selectedSeats) && holdData.selectedSeats.length
                    ? holdData.selectedSeats.map((s: any) => String(s))
                    : [];
                if (seatLabels.length > 0) {
                  const seatResRef = doc(db, 'seatReservations', getSeatDepartureId(packageId, date));
                  const seatResSnap = await tx.get(seatResRef);
                  if (seatResSnap.exists()) {
                    const seatResData: any = seatResSnap.data();
                    const seatLayoutId =
                      (typeof cartItemData?.seatLayoutId === 'string' ? cartItemData.seatLayoutId.trim() : '') ||
                      (typeof holdData?.seatLayoutId === 'string' ? holdData.seatLayoutId.trim() : '') ||
                      String(seatResData?.seatLayoutId ?? '');
                    if (seatLayoutId) {
                      const templateSnap = await tx.get(doc(db, 'seatLayouts', seatLayoutId));
                      if (templateSnap.exists()) {
                        const template = { id: templateSnap.id, ...(templateSnap.data() as any) } as SeatLayoutTemplate;
                        const seatIds = seatIdsFromLabels(template, seatLabels);
                        const seatsMap: Record<string, any> = { ...(seatResData?.seats ?? {}) };
                        for (const seatId of seatIds) {
                          const seat = seatsMap[seatId];
                          if (!seat) continue;
                          const seatStatus = String(seat.status ?? 'available');
                          const seatHoldId = String(seat.holdId ?? '');
                          const seatOrderId = String(seat.orderId ?? '');
                          const canConsumeSeat =
                            seatStatus === 'available' ||
                            ((seatStatus === 'held' || seatStatus === 'reserved') && seatHoldId === holdId) ||
                            (seatStatus === 'paid' && seatOrderId === String(orderId));
                          if (!canConsumeSeat) continue;
                          seatsMap[seatId] = {
                            status: 'paid',
                            holdId: null,
                            cartId: null,
                            cartItemId: null,
                            orderId,
                            reservationId,
                            expiresAt: null,
                            blockedBy: null,
                            updatedAt: now,
                          };
                        }
                        queueSet(seatResRef, { seats: seatsMap, updatedAt: now }, { merge: true });
                      }
                    }
                  }
                }
              } else if (isRejected) {
                const holdSnap = await tx.get(holdRef);
                const cartItemSnap = await tx.get(cartItemRef);
                if (holdSnap.exists()) queueUpdate(holdRef, { status: 'released', releasedAt: now, updatedAt: now });
                if (cartItemSnap.exists()) queueUpdate(cartItemRef, { holdStatus: 'released', updatedAt: now });
                const holdData: any = holdSnap.exists() ? holdSnap.data() : null;
                const cartItemData: any = cartItemSnap.exists() ? cartItemSnap.data() : null;
                const seatLabels = Array.isArray(cartItemData?.selectedSeats) && cartItemData.selectedSeats.length
                  ? cartItemData.selectedSeats.map((s: any) => String(s))
                  : Array.isArray(holdData?.selectedSeats) && holdData.selectedSeats.length
                    ? holdData.selectedSeats.map((s: any) => String(s))
                    : [];
                if (seatLabels.length > 0) {
                  const seatResRef = doc(db, 'seatReservations', getSeatDepartureId(packageId, date));
                  const seatResSnap = await tx.get(seatResRef);
                  if (seatResSnap.exists()) {
                    const seatResData: any = seatResSnap.data();
                    const seatLayoutId =
                      (typeof cartItemData?.seatLayoutId === 'string' ? cartItemData.seatLayoutId.trim() : '') ||
                      (typeof holdData?.seatLayoutId === 'string' ? holdData.seatLayoutId.trim() : '') ||
                      String(seatResData?.seatLayoutId ?? '');
                    if (seatLayoutId) {
                      const templateSnap = await tx.get(doc(db, 'seatLayouts', seatLayoutId));
                      if (templateSnap.exists()) {
                        const template = { id: templateSnap.id, ...(templateSnap.data() as any) } as SeatLayoutTemplate;
                        const seatIds = seatIdsFromLabels(template, seatLabels);
                        const seatsMap: Record<string, any> = { ...(seatResData?.seats ?? {}) };
                        for (const seatId of seatIds) {
                          const seat = seatsMap[seatId];
                          if (!seat) continue;
                          if (String(seat.status ?? '') !== 'held' && String(seat.status ?? '') !== 'reserved') continue;
                          if (String(seat.holdId ?? '') !== holdId) continue;
                          seatsMap[seatId] = { status: 'available', holdId: null, cartId: null, cartItemId: null, expiresAt: null, blockedBy: null, updatedAt: now };
                        }
                        queueSet(seatResRef, { seats: seatsMap, updatedAt: now }, { merge: true });
                      }
                    }
                  }
                }
              } else if (isPixPending) {
                const pendingRaw = process.env.PENDING_HOLD_MINUTES;
                const pendingParsed = pendingRaw ? parseInt(pendingRaw, 10) : NaN;
                const pendingMinutes = Number.isFinite(pendingParsed) && pendingParsed >= 5 && pendingParsed <= 1440 ? pendingParsed : 60;
                const pendingExpiresAt = Timestamp.fromMillis(now.toMillis() + pendingMinutes * 60 * 1000);

                const holdSnap = await tx.get(holdRef);
                const cartItemSnap = await tx.get(cartItemRef);
                if (holdSnap.exists()) queueUpdate(holdRef, { expiresAt: pendingExpiresAt, updatedAt: now });
                if (cartItemSnap.exists()) queueUpdate(cartItemRef, { expiresAt: pendingExpiresAt, updatedAt: now });

                const holdData: any = holdSnap.exists() ? holdSnap.data() : null;
                const cartItemData: any = cartItemSnap.exists() ? cartItemSnap.data() : null;
                const seatLabels = Array.isArray(cartItemData?.selectedSeats) && cartItemData.selectedSeats.length
                  ? cartItemData.selectedSeats.map((s: any) => String(s))
                  : Array.isArray(holdData?.selectedSeats) && holdData.selectedSeats.length
                    ? holdData.selectedSeats.map((s: any) => String(s))
                    : [];
                if (seatLabels.length > 0) {
                  const seatResRef = doc(db, 'seatReservations', getSeatDepartureId(packageId, date));
                  const seatResSnap = await tx.get(seatResRef);
                  if (seatResSnap.exists()) {
                    const seatResData: any = seatResSnap.data();
                    const seatLayoutId =
                      (typeof cartItemData?.seatLayoutId === 'string' ? cartItemData.seatLayoutId.trim() : '') ||
                      (typeof holdData?.seatLayoutId === 'string' ? holdData.seatLayoutId.trim() : '') ||
                      String(seatResData?.seatLayoutId ?? '');
                    if (seatLayoutId) {
                      const templateSnap = await tx.get(doc(db, 'seatLayouts', seatLayoutId));
                      if (templateSnap.exists()) {
                        const template = { id: templateSnap.id, ...(templateSnap.data() as any) } as SeatLayoutTemplate;
                        const seatIds = seatIdsFromLabels(template, seatLabels);
                        const seatsMap: Record<string, any> = { ...(seatResData?.seats ?? {}) };
                        for (const seatId of seatIds) {
                          const seat = seatsMap[seatId];
                          if (!seat) continue;
                          if (String(seat.holdId ?? '') !== holdId) continue;
                          const status = String(seat.status ?? 'available');
                          if (status !== 'held' && status !== 'reserved') continue;
                          seatsMap[seatId] = {
                            status: 'reserved',
                            holdId,
                            cartId: String(cartId),
                            cartItemId,
                            orderId,
                            reservationId,
                            expiresAt: pendingExpiresAt,
                            blockedBy: null,
                            updatedAt: now,
                          };
                        }
                        queueSet(seatResRef, { seats: seatsMap, updatedAt: now }, { merge: true });
                      }
                    }
                  }
                }
              }
            }
          }
          flushWrites();
        });

        if (intentId) {
          await updateDoc(doc(db, 'checkoutIntents', intentId), {
            status: isApproved ? 'completed' : (isPixPending ? 'pending' : 'failed'),
            mercadoPagoPaymentId: String(paymentId),
            mercadoPagoStatus: paymentStatus,
            updatedAt: Timestamp.now(),
          }).catch(() => {});
        }

        await recordMPNotification({
          notificationId,
          type: notification.type,
          action: notification.action,
          paymentId: String(paymentId),
          externalReference,
          status: 'processed',
        });

        if (isApproved && orderId) {
          const savedOrder = await getDoc(doc(db, 'orders', orderId));
          const ids = savedOrder.data()?.reservationIds ?? [];
          const { prepareReservationOperations } = await import('@/lib/operations/lifecycle');
          for (const id of ids) await prepareReservationOperations(String(id)).catch((error) => console.error('[operaciones]', error));
        }
        return NextResponse.json({ received: true, processed: true });
      } catch (error) {
        const errorDetail = error instanceof Error ? error.message : String(error);
        console.error('[mercadopago-webhook] Error procesando carrito:', error);
        await recordMPNotification({
          notificationId,
          type: notification.type,
          action: notification.action,
          paymentId: String(paymentId),
          externalReference,
          status: 'failed',
          error: errorDetail,
        });
        return NextResponse.json({ error: 'Error procesando carrito', detail: errorDetail }, { status: 500 });
      }
    }

    // Extraer datos del intent (soportar tanto package* como experience* para compatibilidad)
    const packageId = intentData.packageId || intentData.experienceId;
    const packageSlug = intentData.packageSlug || intentData.experienceSlug;
    const packageTitle = intentData.packageTitle || intentData.experienceTitle || intentData.intentTitle;
    const {
      date,
      people,
      amountTotal,
      currency,
      customerEmail: intentEmail,
      customerName: intentName,
      customerPhone: intentPhone,
      customerCountry: intentCountry,
      customerDocument: intentDocument,
      customerBirthDate: intentBirthDate,
      customerComments: intentComments,
      passengerDetails: intentPassengerDetails,
      referral,
    } = intentData;

    // Obtener datos actualizados del paquete
    const pkg = packageId ? await getPaqueteById(packageId) : null;
    const finalPackageTitle = packageTitle ?? pkg?.titulo ?? '';

    // Determinar estado de la reserva
    const reservationStatus = mapPaymentStatusToReservationStatus(paymentStatus);
    const isPixPending = paymentStatus === 'pending' || paymentStatus === 'in_process';

    // Datos del pagador (del pago de MP)
    const payer = paymentInfo.payer;
    const customerEmail = payer?.email || intentEmail || '';
    const customerName = payer?.first_name 
      ? `${payer.first_name} ${payer.last_name || ''}`.trim() 
      : intentName || '';
    const customerPhone = payer?.phone?.number || intentPhone || '';
    const customerDocument = payer?.identification?.number || intentDocument || '';
    const customerBirthDate = intentBirthDate ? String(intentBirthDate) : null;
    const customerAge = typeof intentData.customerAge === 'number' ? intentData.customerAge : null;
    const customerHotel = intentData.customerHotel ? String(intentData.customerHotel) : null;
    const customerCountry = (intentCountry ? String(intentCountry) : '') || payer?.address?.country || null;
    const passengerDetails = Array.isArray(intentPassengerDetails) ? intentPassengerDetails : null;

    // Preparar datos para emails
    const amountFormatted = formatAmount(amountTotal || paymentInfo.transaction_amount * 100, currency || 'ars');
    const dateFormatted = formatDate(date);
    const peopleLabel = people === 1 ? '1 persona' : `${people} personas`;
    const priceBreakdown = buildPriceBreakdown({
      rawExtras: (intentData as any).selectedExtras,
      baseSubtotalAmount: (intentData as any).baseSubtotalAmount,
      people,
      currency: currency || 'ars',
      peopleLabel,
    });

    const reservationId = `mp_${paymentId}`;
    // Código secuencial reservado en su propia transacción (igual que el
    // resto de los flujos), en lugar del derivado del paymentId.
    let reservationCode: string;
    try {
      reservationCode = await reserveNextReservationCode();
    } catch (error) {
      console.error('[mercadopago-webhook] No se pudo generar el código:', error);
      return NextResponse.json({ error: 'No se pudo generar el código de reserva' }, { status: 500 });
    }
    const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
    const lookupUrl = siteUrl
      ? `${siteUrl}/consultar-reserva?code=${encodeURIComponent(reservationCode)}`
      : undefined;

    const emailData = {
      customerName: customerName || '',
      experienceTitle: finalPackageTitle || SITE_NAME,
      dateFormatted,
      peopleLabel,
      amountFormatted,
      ...priceBreakdown,
      reservationCode,
      lookupUrl,
      sessionId: String(paymentId),
      customerEmail: customerEmail || '',
      customerPhone: customerPhone || undefined,
      customerCountry: customerCountry || undefined,
      customerComments: intentComments || undefined,
    };

    const htmlConfirm = buildClienteCompraConfirmadaHtml(emailData);
    const textConfirm = buildClienteCompraConfirmadaText(emailData);
    const htmlVoucher = buildClienteVoucher48hsHtml(emailData);
    const textVoucher = buildClienteVoucher48hsText(emailData);
    const htmlAdmin = buildAdminNuevaReservaHtml(emailData);
    const textAdmin = buildAdminNuevaReservaText(emailData);
    const from = getFromEmail(true);
    const replyTo = process.env.SUPPORT_EMAIL || getFromEmail(false);
    const nextAttemptAtVoucherDirect = computeVoucherNextAttemptAt({ date, now: Timestamp.now() });
    const shouldQueueVoucherDirect = Boolean(date && date !== 'sin-fecha');
    const directSend: { confirm?: string; voucher?: string; admin?: string } = {};

    // Crear o actualizar reserva en Firestore
    try {
      const now = Timestamp.now();
      const reservaRef = doc(db, 'reservas', reservationId);
      const emailClienteConfirmRef = doc(db, 'emailJobs', `mp_${reservationId}_cliente_confirm`);
      const emailClienteVoucherRef = doc(db, 'emailJobs', `mp_${reservationId}_cliente_voucher`);
      const emailAdminRef = doc(db, 'emailJobs', `mp_${reservationId}_admin`);

      const txResult = await runTransaction(db, async (tx) => {
        // ============================================
        // FASE 1: TODAS LAS LECTURAS
        // ============================================
        const reservaSnap = await tx.get(reservaRef);
        const emailClienteConfirmSnap = await tx.get(emailClienteConfirmRef);
        const emailClienteVoucherSnap = await tx.get(emailClienteVoucherRef);
        const emailAdminSnap = await tx.get(emailAdminRef);

        const nextAttemptAtVoucher = computeVoucherNextAttemptAt({ date, now });
        const shouldQueueVoucher = Boolean(date && date !== 'sin-fecha');

        // El código ya fue reservado antes de la tx (variable externa
        // `reservationCode`). No se toca el contador acá.

        // ============================================
        // FASE 2: TODAS LAS ESCRITURAS
        // ============================================

        if (!reservaSnap.exists()) {
          // Crear nueva reserva
          let referredBy: any = undefined;
          const referralCode = referral?.code;
          
          if (referralCode) {
            const resolved = await resolveReferralFromCode(referralCode);
            if (resolved) {
              const commissionOverride =
                pkg?.bookingConfig?.referralCommission
                  ? {
                      type: pkg.bookingConfig.referralCommission.type,
                      value: pkg.bookingConfig.referralCommission.value,
                      currency: pkg.bookingConfig.referralCommission.currency,
                    }
                  : undefined;
              const comm = computeCommission({ 
                amountTotal: amountTotal || (paymentInfo.transaction_amount ? Math.round(paymentInfo.transaction_amount * 100) : 0), 
                people, 
                vendor: resolved.vendor, 
                commissionOverride 
              });
              const payoutStatus = nextPayoutStatusForReservationStatus(reservationStatus === 'completed' ? 'completed' : 'pending');
              referredBy = {
                vendorId: resolved.vendor.id,
                vendorName: resolved.vendor.name,
                code: resolved.code,
                channel: 'link',
                commissionType: comm.type,
                commissionValue: comm.value,
                commissionCurrency: comm.currency,
                commissionAmount: comm.commissionAmount,
                payoutStatus,
              };
            }
          }

          tx.set(reservaRef, {
            packageId,
            packageSlug,
            packageTitle: finalPackageTitle,
            // Mantener campos legacy por compatibilidad
            experienceId: packageId,
            experienceSlug: packageSlug,
            experienceTitle: finalPackageTitle,
            date,
            people,
            selectedExtras: Array.isArray((intentData as any).selectedExtras) ? (intentData as any).selectedExtras : null,
            baseSubtotalAmount:
              typeof (intentData as any).baseSubtotalAmount === 'number'
                ? Number((intentData as any).baseSubtotalAmount)
                : null,
            extrasTotalAmount:
              typeof (intentData as any).extrasTotalAmount === 'number'
                ? Number((intentData as any).extrasTotalAmount)
                : null,
            amountTotal: amountTotal || Math.round(paymentInfo.transaction_amount * 100),
            currency: currency || paymentInfo.currency_id || 'ars',
            paymentMethod: 'mercadopago',
            mercadoPagoPaymentId: String(paymentId),
            mercadoPagoPreferenceId: intentData.mercadoPagoPreferenceId || null,
            mercadoPagoStatus: paymentStatus,
            mercadoPagoStatusDetail: paymentInfo.status_detail || null,
            externalReference,
            checkoutIntentId: intentId || null,
            customerEmail: customerEmail || '',
            customerEmailLower: normalizeEmail(customerEmail),
            customerName: customerName || '',
            customerNameLower: (customerName || '').trim().toLowerCase() || null,
            customerPhone: customerPhone || null,
            customerPhoneNormalized: normalizeDigits(customerPhone),
            customerCountry: customerCountry || null,
            customerDocument: customerDocument || null,
            customerDocumentNormalized: normalizeDigits(customerDocument),
            customerBirthDate,
            customerAge,
            customerHotel,
            customerComments: intentComments || null,
            passengerDetails,
            reservationCode,
            status: isPixPending ? 'pending' : reservationStatus,
            createdByAdmin: false,
            attachments: [],
            pricingSnapshot: buildReservationPricingSnapshot({
              unitAmount:
                amountTotal > 0 && people > 0
                  ? Math.round(amountTotal / people)
                  : typeof intentData?.unitAmount === 'number' && intentData.unitAmount > 0
                    ? Math.round(intentData.unitAmount)
                    : typeof intentData?.unitPrice === 'number' && intentData.unitPrice > 0
                      ? Math.round(intentData.unitPrice)
                      : null,
              people,
              amountTotal: amountTotal || (paymentInfo.transaction_amount ? Math.round(paymentInfo.transaction_amount * 100) : 0),
              baseSubtotalAmount:
                typeof (intentData as any).baseSubtotalAmount === 'number'
                  ? Number((intentData as any).baseSubtotalAmount)
                  : null,
              extrasTotalAmount:
                typeof (intentData as any).extrasTotalAmount === 'number'
                  ? Number((intentData as any).extrasTotalAmount)
                  : null,
              currency: currency || paymentInfo.currency_id || 'ars',
              paymentMethod: 'mercadopago',
            }),
            capacitySnapshot: {
              date,
              maxPeoplePerBooking: pkg ? resolveDepartureConfig(pkg, date).maxPeople : null,
              hasSpecificDates: Boolean(pkg?.salidas?.length),
              enabled: pkg ? resolveDepartureConfig(pkg, date).enabled : false,
            },
            packageSnapshot: {
              id: packageId,
              slug: packageSlug,
              title: finalPackageTitle,
            },
            // Legacy field
            experienceSnapshot: {
              id: packageId,
              slug: packageSlug,
              title: finalPackageTitle,
            },
            statusHistory: [
              {
                status: isPixPending ? 'pending' : reservationStatus,
                actor: 'system',
                note: isPixPending 
                  ? `Pago iniciado en Mercado Pago (estado: ${paymentStatus})` 
                  : `Pago confirmado por Mercado Pago (ID: ${paymentId})`,
                createdAt: now,
              },
            ],
            paidAt: isApproved ? now : null,
            voucherSent: false,
            voucherSentAt: null,
            voucherScheduledAt: isApproved && shouldQueueVoucher ? nextAttemptAtVoucher : null,
            emailDelivery: isApproved
              ? buildQueuedEmailDelivery({
                  customerConfirmation: { jobId: emailClienteConfirmRef.id },
                  customerVoucher: shouldQueueVoucher
                    ? { jobId: emailClienteVoucherRef.id }
                    : { status: 'not_sent', jobId: null },
                  adminNotification: { jobId: emailAdminRef.id },
                })
              : buildDefaultEmailDelivery(),
            createdAt: now,
            updatedAt: now,
            ...(referredBy ? { referredBy } : {}),
          });
        } else {
          // Actualizar reserva existente
          const updates: any = {
            status: reservationStatus,
            mercadoPagoStatus: paymentStatus,
            mercadoPagoStatusDetail: paymentInfo.status_detail || null,
            updatedAt: now,
          };

          if (isApproved) {
            updates.paidAt = now;
          }

          const rawExisting = reservaSnap.data() as any;
          const hasDelivery = Boolean(rawExisting?.emailDelivery);
          if (isApproved && !hasDelivery) {
            updates.emailDelivery = buildQueuedEmailDelivery({
              customerConfirmation: { jobId: emailClienteConfirmRef.id },
              customerVoucher: shouldQueueVoucher
                ? { jobId: emailClienteVoucherRef.id }
                : { status: 'not_sent', jobId: null },
              adminNotification: { jobId: emailAdminRef.id },
            });
            updates.voucherScheduledAt = shouldQueueVoucher ? nextAttemptAtVoucher : null;
          }

          tx.update(reservaRef, {
            ...updates,
            statusHistory: arrayUnion({
              status: reservationStatus,
              actor: 'system',
              note: `Actualización de Mercado Pago: ${paymentStatus}`,
              createdAt: now,
            }),
          });
        }

        // Email al cliente (solo si aprobado). Si el envío inmediato
        // funcionó, el job nace como "sent"; si no, "pending" para el cron.
        if (!emailClienteConfirmSnap.exists() && customerEmail && isApproved) {
          tx.set(emailClienteConfirmRef, {
            type: 'cliente_confirmacion_compra',
            status: directSend.confirm ? 'sent' : 'pending',
            to: customerEmail,
            from,
            replyTo,
            subject: `Compra confirmada: ${finalPackageTitle || SITE_NAME}`,
            html: htmlConfirm,
            text: textConfirm,
            attempts: directSend.confirm ? 1 : 0,
            lastError: null,
            providerMessageId: directSend.confirm ?? null,
            sentAt: directSend.confirm ? now : null,
            mercadoPagoPaymentId: String(paymentId),
            reservationId,
            nextAttemptAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }

        if (!emailClienteVoucherSnap.exists() && customerEmail && isApproved && shouldQueueVoucher) {
          tx.set(emailClienteVoucherRef, {
            type: 'cliente_voucher_48hs',
            status: directSend.voucher ? 'sent' : 'pending',
            to: customerEmail,
            from,
            replyTo,
            subject: `Recordatorio de salida (48 hs): ${finalPackageTitle || SITE_NAME}`,
            html: htmlVoucher,
            text: textVoucher,
            attempts: directSend.voucher ? 1 : 0,
            lastError: null,
            providerMessageId: directSend.voucher ?? null,
            sentAt: directSend.voucher ? now : null,
            mercadoPagoPaymentId: String(paymentId),
            reservationId,
            nextAttemptAt: nextAttemptAtVoucher,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Email al admin (solo si aprobado)
        if (!emailAdminSnap.exists() && CONTACT_INFO.email && isApproved) {
          tx.set(emailAdminRef, {
            type: 'admin_aviso',
            status: directSend.admin ? 'sent' : 'pending',
            to: CONTACT_INFO.email,
            from,
            replyTo,
            subject: `Nueva reserva: ${finalPackageTitle || 'Paquete'} — ${customerName || customerEmail}`,
            html: htmlAdmin,
            text: textAdmin,
            attempts: directSend.admin ? 1 : 0,
            lastError: null,
            providerMessageId: directSend.admin ?? null,
            sentAt: directSend.admin ? now : null,
            mercadoPagoPaymentId: String(paymentId),
            reservationId,
            nextAttemptAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }

        return {
          hadReserva: reservaSnap.exists(),
          hadEmailCliente: emailClienteConfirmSnap.exists(),
          hadEmailAdmin: emailAdminSnap.exists(),
        };
      });

      console.log('[mercadopago-webhook] Reserva procesada', {
        reservationId,
        paymentId,
        status: reservationStatus,
        isApproved,
        createdNew: !txResult.hadReserva,
      });
      if (isApproved) await import('@/lib/operations/lifecycle').then(({ prepareReservationOperations }) => prepareReservationOperations(reservationId)).catch((error) => console.error('[operaciones]', error));

      // Actualizar checkout intent
      if (intentId) {
        await updateDoc(doc(db, 'checkoutIntents', intentId), {
          status: isApproved ? 'completed' : (isPixPending ? 'pending' : 'failed'),
          mercadoPagoPaymentId: String(paymentId),
          mercadoPagoStatus: paymentStatus,
          updatedAt: Timestamp.now(),
        });
      }

      await recordMPNotification({
        notificationId,
        type: notification.type,
        action: notification.action,
        paymentId: String(paymentId),
        externalReference,
        reservationId,
        status: 'processed',
      });

      return NextResponse.json({ received: true, processed: true });

    } catch (error) {
      console.error('[mercadopago-webhook] Error procesando reserva:', error);
      
      await recordMPNotification({
        notificationId,
        type: notification.type,
        action: notification.action,
        paymentId: String(paymentId),
        externalReference,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json({ error: 'Error procesando reserva' }, { status: 500 });
    }

  } catch (error) {
    console.error('[mercadopago-webhook] Error general:', error);
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 });
  }
}

// Endpoint GET para verificar que el webhook está funcionando (usado por Mercado Pago)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');
  
  if (challenge) {
    // Mercado Pago envía un challenge para verificar el endpoint
    return new Response(challenge, { status: 200 });
  }
  
  return NextResponse.json({ status: 'ok', message: 'Webhook de Mercado Pago activo' });
}
