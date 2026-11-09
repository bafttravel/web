import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';
import { getPaqueteById } from '@/lib/paquetes';
import { CONTACT_INFO, SITE_NAME } from '@/lib/constants';
import {
  buildAdminNuevaReservaHtml,
  buildAdminNuevaReservaText,
  buildClienteCompraConfirmadaHtml,
  buildClienteCompraConfirmadaText,
  buildClienteVoucher48hsHtml,
  buildClienteVoucher48hsText,
} from '@/lib/emails/reserva-confirmada';
import { getFromEmail, isResendConfigured, resend } from '@/lib/resend';
import { getPayment, isPaymentApproved, mapPaymentStatusToReservationStatus, searchPayments } from '@/lib/mercadopago';
import { normalizeDigits, normalizeEmail, reserveNextReservationCode } from '@/lib/reservas/code';
import { buildQueuedEmailDelivery } from '@/lib/sales/status';
import { buildReservationPricingSnapshot } from '@/lib/sales/orchestrator';
import { calculateVoucherReminderSchedule } from '@/lib/vouchers/schedule';
import { buildReferredByFromCode } from '@/lib/referrals';
import { resolveDepartureConfig } from '@/lib/packages/resolve-departure';

export const runtime = 'nodejs';

const payloadSchema = z.object({
  orderId: z.string().min(1).optional(),
  paymentId: z.string().trim().optional(),
  intentId: z.string().trim().min(1).optional(),
  reservationId: z.string().trim().min(1).optional(),
});

function getSearchResults(payload: any): any[] {
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload)) return payload;
  return [];
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
      console.error('[verify-direct] Resend rechazó el email:', error);
      return null;
    }
    return data?.id ?? 'sent';
  } catch (error) {
    console.error('[verify-direct] No se pudo enviar el email ahora:', error);
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = String(url.searchParams.get('payment_id') ?? url.searchParams.get('paymentId') ?? '').trim();
  const externalReference = String(url.searchParams.get('external_reference') ?? url.searchParams.get('externalReference') ?? '').trim();
  if (!paymentId && !externalReference) {
    return NextResponse.json({ error: 'Falta payment_id o external_reference.' }, { status: 400 });
  }
  try {
    if (paymentId) {
      const paymentInfo: any = await getPayment(paymentId);
      const status = String(paymentInfo?.status ?? 'unknown');
      return NextResponse.json({
        ok: true,
        paymentId,
        status,
        approved: isPaymentApproved(status),
        reservationStatus: mapPaymentStatusToReservationStatus(status),
        externalReference: String(paymentInfo?.external_reference ?? externalReference ?? ''),
      });
    }
    const payments = await searchPayments(externalReference).catch(() => null);
    const candidates = getSearchResults(payments);
    const approved = candidates.find((item) => String(item?.status ?? '').toLowerCase() === 'approved');
    const latest = approved ?? candidates[0];
    if (!latest) return NextResponse.json({ error: 'Pago no encontrado.' }, { status: 404 });
    const status = String(latest?.status ?? 'unknown');
    return NextResponse.json({
      ok: true,
      paymentId: String(latest?.id ?? ''),
      status,
      approved: isPaymentApproved(status),
      reservationStatus: mapPaymentStatusToReservationStatus(status),
      externalReference,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'No se pudo consultar el pago.', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  }

  const orderId = String(parsed.data.orderId ?? '').trim();
  const requestedPaymentId = String(parsed.data.paymentId ?? '').trim();
  const intentId = String(parsed.data.intentId ?? '').trim();
  const reservationIdParam = String(parsed.data.reservationId ?? '').trim();

  // Flujo carrito (orderId): delegar al webhook con el paymentId resuelto.
  if (orderId && !intentId && !reservationIdParam) {
    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    if (!orderSnap.exists()) {
      return NextResponse.json({ error: 'Order no encontrada.' }, { status: 404 });
    }

    const order = { id: orderSnap.id, ...(orderSnap.data() as any) };
    if (String(order?.status ?? '') === 'paid') {
      return NextResponse.json({ ok: true, alreadyPaid: true, orderId });
    }

    let paymentId = requestedPaymentId || String(order?.payment?.paymentId ?? '').trim();
    const externalReference = String(order?.payment?.externalReference ?? '').trim();

    if (!paymentId && externalReference) {
      const payments = await searchPayments(externalReference).catch(() => null);
      const candidates = getSearchResults(payments);
      const approved = candidates.find((item) => String(item?.status ?? '').toLowerCase() === 'approved');
      const latest = approved ?? candidates[0];
      paymentId = String(latest?.id ?? '').trim();
    }

    if (!paymentId) {
      return NextResponse.json(
        { error: 'No encontramos un pago asociado para reconciliar esta orden.' },
        { status: 404 }
      );
    }

    const webhookUrl = new URL('/api/mercadopago/webhook', request.url);
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: Date.now(),
        live_mode: true,
        type: 'payment',
        date_created: new Date().toISOString(),
        user_id: 0,
        api_version: 'v1',
        action: 'payment.updated',
        data: {
          id: paymentId,
        },
      }),
    });
    const result = await webhookResponse.json().catch(() => null);
    return NextResponse.json(
      {
        ok: webhookResponse.ok,
        orderId,
        paymentId,
        result,
      },
      { status: webhookResponse.ok ? 200 : webhookResponse.status }
    );
  }

  // Flujo directo (checkout sin carrito): crear la reserva consultando el
  // pago en MP. Sirve para localhost (donde el webhook no llega) y como
  // fallback desde la página de éxito.
  if (!intentId && !reservationIdParam) {
    return NextResponse.json({ error: 'Falta intentId o reservationId.' }, { status: 400 });
  }

  const intentSnap = intentId ? await getDoc(doc(db, 'checkoutIntents', intentId)).catch(() => null) : null;
  const intentData: any = intentSnap?.exists() ? intentSnap.data() : null;
  if (intentId && !intentData) {
    return NextResponse.json({ error: 'Intento de pago no encontrado.' }, { status: 404 });
  }
  const externalReference = String(intentData?.externalReference ?? '').trim();

  // Si el webhook ya creó la reserva, devolver su estado (idempotente).
  const existingReservationId =
    reservationIdParam || (intentData?.mercadoPagoPaymentId ? `mp_${String(intentData.mercadoPagoPaymentId)}` : '');
  if (existingReservationId) {
    const existingSnap = await getDoc(doc(db, 'reservas', existingReservationId)).catch(() => null);
    if (existingSnap?.exists()) {
      const existing: any = existingSnap.data();
      const confirmJobId = String(existing?.emailDelivery?.customerConfirmation?.jobId ?? '');
      let confirmStatus = 'missing';
      if (confirmJobId) {
        const jobSnap = await getDoc(doc(db, 'emailJobs', confirmJobId)).catch(() => null);
        if (jobSnap?.exists()) confirmStatus = String((jobSnap.data() as any)?.status ?? 'pending');
      }
      return NextResponse.json({
        ok: true,
        alreadyExists: true,
        reservationId: existingReservationId,
        reservationCode: String(existing?.reservationCode ?? ''),
        paymentStatus: String(existing?.mercadoPagoStatus ?? ''),
        amountTotal: Number(existing?.amountTotal ?? 0) || 0,
        currency: String(existing?.currency ?? 'ars'),
        emailStatus: confirmStatus,
      });
    }
  }
  if (!intentData) {
    return NextResponse.json({ error: 'Sin datos del intento para verificar.' }, { status: 404 });
  }

  // Consultar el pago en Mercado Pago (por paymentId del retorno o por external_reference).
  let paymentInfo: any = null;
  if (requestedPaymentId) {
    paymentInfo = await getPayment(requestedPaymentId).catch(() => null);
  }
  if (!paymentInfo && externalReference) {
    const payments = await searchPayments(externalReference).catch(() => null);
    const candidates = getSearchResults(payments);
    paymentInfo =
      candidates.find((item) => String(item?.status ?? '').toLowerCase() === 'approved') ?? candidates[0] ?? null;
  }
  if (!paymentInfo) {
    return NextResponse.json(
      { error: 'Todavía no encontramos el pago en Mercado Pago. Probá de nuevo en unos segundos.' },
      { status: 404 }
    );
  }
  const directPaymentStatus = String(paymentInfo?.status ?? 'unknown');
  const directPaymentId = String(paymentInfo?.id ?? requestedPaymentId ?? '');
  if (!isPaymentApproved(directPaymentStatus)) {
    return NextResponse.json(
      { ok: false, paymentStatus: directPaymentStatus, message: 'El pago todavía no está aprobado.' },
      { status: 202 }
    );
  }

  // Crear reserva + jobs (mismo esquema que el webhook, flujo directo).
  const packageId = intentData.packageId || intentData.experienceId;
  const packageSlug = intentData.packageSlug || intentData.experienceSlug;
  const packageTitle = intentData.packageTitle || intentData.experienceTitle || intentData.intentTitle;
  const pkg = packageId ? await getPaqueteById(packageId).catch(() => null) : null;
  const finalPackageTitle = packageTitle ?? pkg?.titulo ?? '';
  const date = String(intentData.date ?? 'sin-fecha');
  const departureTime = String(intentData.operations?.pickupTime || intentData.departureTime || '').trim() || undefined;
  const timeZone = String(intentData.timeZone || intentData.timezone || '').trim() || undefined;
  const people = Number(intentData.people ?? 0) || 0;
  if (!packageId || !people || people < 1) {
    return NextResponse.json({ error: 'El intento no tiene datos válidos.' }, { status: 400 });
  }
  const currency = String(intentData.currency ?? 'ars');
  const amountTotal = Number(intentData.amountTotal ?? 0) || 0;
  const reservationStatus = mapPaymentStatusToReservationStatus(directPaymentStatus);
  const payer = paymentInfo?.payer;
  const customerEmail = payer?.email || intentData.customerEmail || '';
  const customerName = payer?.first_name
    ? `${payer.first_name} ${payer.last_name || ''}`.trim()
    : intentData.customerName || '';
  if (!customerEmail) {
    return NextResponse.json({ error: 'El pago no trae email para confirmar.' }, { status: 400 });
  }
  const customerPhone = payer?.phone?.number || intentData.customerPhone || '';
  const customerDocument = payer?.identification?.number || intentData.customerDocument || '';
  const from = getFromEmail(true);
  const replyTo = process.env.SUPPORT_EMAIL || getFromEmail(false);
  const now = Timestamp.now();
  const peopleLabel = people === 1 ? '1 persona' : `${people} personas`;
  const priceBreakdown = buildPriceBreakdown({
    rawExtras: (intentData as any).selectedExtras,
    baseSubtotalAmount: (intentData as any).baseSubtotalAmount,
    people,
    currency,
    peopleLabel,
  });

  let reservationCode: string;
  try {
    reservationCode = await reserveNextReservationCode();
  } catch {
    return NextResponse.json({ error: 'No se pudo generar el código de reserva.' }, { status: 500 });
  }
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
  const lookupUrl = siteUrl ? `${siteUrl}/consultar-reserva?code=${encodeURIComponent(reservationCode)}` : undefined;
  const directEmailData = {
    customerName: customerName || '',
    experienceTitle: finalPackageTitle || SITE_NAME,
    dateFormatted: formatDate(date),
    peopleLabel,
    amountFormatted: formatAmount(amountTotal || 0, currency),
    ...priceBreakdown,
    reservationCode,
    lookupUrl,
    sessionId: String(directPaymentId),
    customerEmail,
    customerPhone: customerPhone || undefined,
    customerCountry: (intentData.customerCountry ? String(intentData.customerCountry) : '') || undefined,
    customerComments: intentData.customerComments || undefined,
  };
  const htmlConfirm = buildClienteCompraConfirmadaHtml(directEmailData);
  const textConfirm = buildClienteCompraConfirmadaText(directEmailData);
  const htmlVoucher = buildClienteVoucher48hsHtml(directEmailData);
  const textVoucher = buildClienteVoucher48hsText(directEmailData);
  const htmlAdmin = buildAdminNuevaReservaHtml(directEmailData);
  const textAdmin = buildAdminNuevaReservaText(directEmailData);
  const voucherSchedule = calculateVoucherReminderSchedule({
    date,
    departureTime,
    timeZone,
    nowMs: now.toMillis(),
  });
  const shouldQueueVoucher = reservationStatus === 'reserved' && voucherSchedule.kind === 'scheduled';
  const nextAttemptAtVoucher = shouldQueueVoucher && voucherSchedule.kind === 'scheduled'
    ? Timestamp.fromMillis(voucherSchedule.nextAttemptAtMs)
    : null;

  // Los emails se envían desde /api/cron/email después de que la transacción
  // haya creado la reserva y los jobs. Enviar antes de la transacción provoca
  // duplicados cuando el webhook y esta verificación llegan simultáneamente.
  const confirmSendId: string | null = null;
  const voucherSendId: string | null = null;
  const adminSendId: string | null = null;

  const referredBy = await buildReferredByFromCode({
    code: intentData.referral?.code,
    pkg,
    amountTotal,
    people,
    status: reservationStatus === 'completed' ? 'completed' : 'pending',
  });

  const reservationId = `mp_${directPaymentId}`;
  const reservaRef = doc(db, 'reservas', reservationId);
  const emailClienteConfirmRef = doc(db, 'emailJobs', `mp_${reservationId}_cliente_confirm`);
  const emailClienteVoucherRef = doc(db, 'emailJobs', `mp_${reservationId}_cliente_voucher`);
  const emailAdminRef = doc(db, 'emailJobs', `mp_${reservationId}_admin`);
  const paymentRef = doc(collection(db, 'reservas', reservationId, 'payments'), String(directPaymentId));

  try {
    await runTransaction(db, async (tx) => {
      const reservaSnap = await tx.get(reservaRef);
      if (reservaSnap.exists()) return;
      const emailClienteConfirmSnap = await tx.get(emailClienteConfirmRef);
      const emailClienteVoucherSnap = await tx.get(emailClienteVoucherRef);
      const emailAdminSnap = await tx.get(emailAdminRef);

      tx.set(reservaRef, {
        packageId,
        packageSlug,
        packageTitle: finalPackageTitle,
        experienceId: packageId,
        experienceSlug: packageSlug,
        experienceTitle: finalPackageTitle,
        date,
        ...(departureTime ? { departureTime } : {}),
        ...(timeZone ? { timeZone } : {}),
        people,
        peopleAdults: typeof intentData.peopleAdults === 'number' ? intentData.peopleAdults : null,
        peopleMinors: typeof intentData.peopleMinors === 'number' ? intentData.peopleMinors : null,
        selectedExtras: priceBreakdown.selectedExtras,
        baseSubtotalAmount:
          typeof intentData.baseSubtotalAmount === 'number' ? Number(intentData.baseSubtotalAmount) : null,
        extrasTotalAmount: priceBreakdown.extrasTotalAmount ?? null,
        amountTotal: amountTotal || 0,
        currency,
        paymentMethod: 'mercadopago',
        mercadoPagoPaymentId: String(directPaymentId),
        mercadoPagoPreferenceId: intentData.mercadoPagoPreferenceId || null,
        mercadoPagoStatus: directPaymentStatus,
        mercadoPagoStatusDetail: paymentInfo?.status_detail || null,
        externalReference,
        checkoutIntentId: intentId || null,
        customerEmail,
        customerEmailLower: normalizeEmail(customerEmail),
        customerName: customerName || '',
        customerNameLower: (customerName || '').trim().toLowerCase() || null,
        customerPhone: customerPhone || null,
        customerPhoneNormalized: normalizeDigits(customerPhone),
        customerCountry: (intentData.customerCountry ? String(intentData.customerCountry) : '') || null,
        customerDocument: customerDocument || null,
        customerDocumentNormalized: normalizeDigits(customerDocument),
        customerBirthDate: intentData.customerBirthDate ? String(intentData.customerBirthDate) : null,
        customerAge: typeof intentData.customerAge === 'number' ? intentData.customerAge : null,
        customerHotel: intentData.customerHotel ? String(intentData.customerHotel) : null,
        customerComments: intentData.customerComments || null,
        passengerDetails: Array.isArray(intentData.passengerDetails) ? intentData.passengerDetails : null,
        reservationCode,
        status: reservationStatus,
        createdByAdmin: false,
        attachments: [],
        pricingSnapshot: buildReservationPricingSnapshot({
          unitAmount: amountTotal > 0 && people > 0 ? Math.round(amountTotal / people) : null,
          people,
          amountTotal: amountTotal || 0,
          baseSubtotalAmount:
            typeof intentData.baseSubtotalAmount === 'number' ? Number(intentData.baseSubtotalAmount) : null,
          extrasTotalAmount: priceBreakdown.extrasTotalAmount ?? null,
          currency,
          paymentMethod: 'mercadopago',
        }),
        capacitySnapshot: {
          date,
          maxPeoplePerBooking: pkg ? resolveDepartureConfig(pkg, date).maxPeople : null,
          hasSpecificDates: Boolean(pkg?.salidas?.length),
          enabled: pkg ? resolveDepartureConfig(pkg, date).enabled : false,
        },
        packageSnapshot: { id: packageId, slug: packageSlug, title: finalPackageTitle },
        ...(referredBy ? { referredBy } : {}),
        experienceSnapshot: { id: packageId, slug: packageSlug, title: finalPackageTitle },
        statusHistory: [
          {
            status: reservationStatus,
            actor: 'system',
            note: `Pago confirmado por Mercado Pago (ID: ${directPaymentId})`,
            createdAt: now,
          },
        ],
        paidAt: now,
        voucherSent: false,
        voucherSentAt: null,
        voucherScheduledAt: shouldQueueVoucher ? nextAttemptAtVoucher : null,
        emailDelivery: buildQueuedEmailDelivery({
          customerConfirmation: { jobId: emailClienteConfirmRef.id },
          customerVoucher: shouldQueueVoucher
            ? { jobId: emailClienteVoucherRef.id }
            : { status: 'not_sent', jobId: null },
          adminNotification: { jobId: emailAdminRef.id },
        }),
        createdAt: now,
        updatedAt: now,
      });

      if (!emailClienteConfirmSnap.exists()) {
        tx.set(emailClienteConfirmRef, {
          type: 'cliente_confirmacion_compra',
          status: confirmSendId ? 'sent' : 'pending',
          to: customerEmail,
          from,
          replyTo,
          subject: `Compra confirmada: ${finalPackageTitle || SITE_NAME}`,
          html: htmlConfirm,
          text: textConfirm,
          attempts: confirmSendId ? 1 : 0,
          lastError: null,
          providerMessageId: confirmSendId,
          sentAt: confirmSendId ? now : null,
          mercadoPagoPaymentId: String(directPaymentId),
          reservationId,
          nextAttemptAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (!emailClienteVoucherSnap.exists() && shouldQueueVoucher) {
        tx.set(emailClienteVoucherRef, {
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
          mercadoPagoPaymentId: String(directPaymentId),
          reservationId,
          nextAttemptAt: nextAttemptAtVoucher!,
          scheduledDepartureAtMs: voucherSchedule.kind === 'scheduled' ? voucherSchedule.departureAtMs : null,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (!emailAdminSnap.exists() && CONTACT_INFO.email) {
        tx.set(emailAdminRef, {
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
          mercadoPagoPaymentId: String(directPaymentId),
          reservationId,
          nextAttemptAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      tx.set(
        paymentRef,
        {
          method: 'mercadopago',
          status: String(directPaymentStatus ?? 'unknown'),
          amount: amountTotal || 0,
          currency: String(currency || 'ars').toLowerCase(),
          message: `Pago aprobado (ID: ${directPaymentId})`,
          mercadoPagoPaymentId: String(directPaymentId),
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    });
  } catch (error) {
    console.error('[verify-direct] Error creando reserva:', error);
    return NextResponse.json({ error: 'No se pudo registrar la reserva.' }, { status: 500 });
  }

  if (intentId) {
    await updateDoc(doc(db, 'checkoutIntents', intentId), {
      status: 'completed',
      mercadoPagoPaymentId: String(directPaymentId),
      mercadoPagoStatus: directPaymentStatus,
      updatedAt: Timestamp.now(),
    }).catch(() => {});
  }

  await import('@/lib/operations/lifecycle').then(({ prepareReservationOperations }) => prepareReservationOperations(reservationId)).catch((error) => console.error('[operaciones]', error));
  return NextResponse.json({
    ok: true,
    reservationId,
    reservationCode,
    paymentStatus: directPaymentStatus,
    amountTotal,
    currency,
    emailStatus: confirmSendId ? 'sent' : 'pending',
  });
}
