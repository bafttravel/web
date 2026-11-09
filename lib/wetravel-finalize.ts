import {
  collection,
  doc,
  getDoc,
  runTransaction,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
import { getFromEmail } from '@/lib/resend';
import { normalizeDigits, normalizeEmail, prepareNextReservationCodeInTransaction } from '@/lib/reservas/code';
import { buildQueuedEmailDelivery } from '@/lib/sales/status';
import { buildReservationPricingSnapshot } from '@/lib/sales/orchestrator';
import { buildReferredByFromCode } from '@/lib/referrals';
import { resolveDepartureConfig } from '@/lib/packages/resolve-departure';
import type { WeTravelNormalizedEvent } from '@/lib/wetravel-events';

function formatAmount(amountTotal: number, currency: string) {
  const value = amountTotal / 100;
  if (currency === 'brl') return `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  if (currency === 'usd') return `USD ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$ ${value.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function formatDate(date: string) {
  if (!date || date === 'sin-fecha') return 'A coordinar';
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function voucherAt(date: string, now: Timestamp) {
  if (!date || date === 'sin-fecha') return now;
  const due = new Date(`${date}T09:00:00-03:00`).getTime() - 48 * 60 * 60 * 1000;
  return !Number.isFinite(due) || due <= now.toMillis() + 30_000 ? now : Timestamp.fromMillis(due);
}

function selectedExtrasSnapshot(raw: unknown) {
  return Array.isArray(raw) && raw.length ? raw : null;
}

export async function finalizeWeTravelPaidCheckout(input: {
  intentId: string;
  intentData: any;
  event: WeTravelNormalizedEvent;
}) {
  const { intentId, intentData, event } = input;
  const packageId = String(intentData.packageId || intentData.experienceId || '').trim();
  const packageSlug = String(intentData.packageSlug || intentData.experienceSlug || '').trim();
  const packageTitle = String(intentData.packageTitle || intentData.experienceTitle || '').trim();
  const people = Math.max(1, Number(intentData.people ?? 0) || 0);
  const date = String(intentData.date || 'sin-fecha');
  const currency = String(intentData.currency || 'ars').toLowerCase();
  const amountTotal = Math.max(0, Number(intentData.amountTotal ?? 0) || 0);
  if (!packageId || !people || !amountTotal) throw new Error('El intento WeeTravel no tiene datos válidos.');
  if (event.amountMinor === null || event.amountMinor !== amountTotal) throw new Error('El importe de WeeTravel falta o no coincide con el checkout.');
  if (!event.currency || event.currency !== currency) throw new Error('La moneda de WeeTravel falta o no coincide con el checkout.');

  const pkg = await getPaqueteById(packageId).catch(() => null);
  const finalTitle = packageTitle || pkg?.titulo || SITE_NAME;
  const customerEmail = event.customerEmail || String(intentData.customerEmail || '').trim();
  if (!customerEmail) throw new Error('El pago WeeTravel no trae email del cliente.');
  const customerName = event.customerName || String(intentData.customerName || '').trim();
  // Booking and payment events for the same checkout must contend on the same document.
  const reservationId = String(intentData.reservationId || `wt_${intentId}`);
  const reservationRef = doc(db, 'reservas', reservationId);
  const paymentId = event.paymentId || event.bookingId || event.paymentLinkId || intentId;
  const paymentRef = doc(collection(db, 'reservas', reservationId, 'payments'), paymentId);
  const confirmJobRef = doc(db, 'emailJobs', `wt_${intentId}_cliente_confirm`);
  const voucherJobRef = doc(db, 'emailJobs', `wt_${intentId}_cliente_voucher`);
  const adminJobRef = doc(db, 'emailJobs', `wt_${intentId}_admin`);
  const now = Timestamp.now();
  const nextVoucherAt = voucherAt(date, now);
  const shouldQueueVoucher = date !== 'sin-fecha';
  const selectedExtras = selectedExtrasSnapshot(intentData.selectedExtras);
  const from = getFromEmail(true);
  const referredBy = await buildReferredByFromCode({
    code: intentData.referral?.code,
    pkg,
    amountTotal,
    people,
    status: 'reserved',
    hasConfirmedPayment: true,
  });
  const replyTo = process.env.SUPPORT_EMAIL || getFromEmail(false);
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');

  const result = await runTransaction(db, async (tx) => {
    const existing = await tx.get(reservationRef);
    if (existing.exists()) return { alreadyExists: true, reservationId, reservationCode: String(existing.data()?.reservationCode || '') };
    const confirmSnap = await tx.get(confirmJobRef);
    const voucherSnap = await tx.get(voucherJobRef);
    const adminSnap = await tx.get(adminJobRef);
    const allocation = await prepareNextReservationCodeInTransaction(tx);
    const reservationCode = allocation.reservationCode;
    const peopleLabel = people === 1 ? '1 persona' : `${people} personas`;
    const lookupUrl = siteUrl ? `${siteUrl}/consultar-reserva?code=${encodeURIComponent(reservationCode)}` : undefined;
    const emailData = {
      customerName,
      experienceTitle: finalTitle,
      dateFormatted: formatDate(date),
      peopleLabel,
      amountFormatted: formatAmount(amountTotal, currency),
      selectedExtras,
      baseSubtotalLabel:
        typeof intentData.baseSubtotalAmount === 'number'
          ? `${formatAmount(intentData.baseSubtotalAmount, currency)} (${peopleLabel})`
          : undefined,
      reservationCode,
      lookupUrl,
      sessionId: paymentId,
      customerEmail,
      customerPhone: intentData.customerPhone || undefined,
      customerCountry: intentData.customerCountry || undefined,
      customerComments: intentData.customerComments || undefined,
    };
    const htmlConfirm = buildClienteCompraConfirmadaHtml(emailData);
    const textConfirm = buildClienteCompraConfirmadaText(emailData);
    const htmlVoucher = buildClienteVoucher48hsHtml(emailData);
    const textVoucher = buildClienteVoucher48hsText(emailData);
    const htmlAdmin = buildAdminNuevaReservaHtml(emailData);
    const textAdmin = buildAdminNuevaReservaText(emailData);
    const emailDelivery = buildQueuedEmailDelivery({
      customerConfirmation: { jobId: confirmJobRef.id },
      customerVoucher: shouldQueueVoucher ? { jobId: voucherJobRef.id } : { status: 'not_sent', jobId: null },
      adminNotification: { jobId: adminJobRef.id },
    });
    allocation.commit();

    tx.set(reservationRef, {
      packageId, packageSlug, packageTitle: finalTitle,
      experienceId: packageId, experienceSlug: packageSlug, experienceTitle: finalTitle,
      date, people,
      peopleAdults: typeof intentData.peopleAdults === 'number' ? intentData.peopleAdults : null,
      peopleMinors: typeof intentData.peopleMinors === 'number' ? intentData.peopleMinors : null,
      selectedExtras,
      baseSubtotalAmount: typeof intentData.baseSubtotalAmount === 'number' ? intentData.baseSubtotalAmount : null,
      extrasTotalAmount: typeof intentData.extrasTotalAmount === 'number' ? intentData.extrasTotalAmount : null,
      amountTotal, currency, paymentMethod: 'wetravel',
      wetravelPaymentId: event.paymentId || null,
      wetravelPaymentLinkId: event.paymentLinkId || intentData.wetravelPaymentLinkId || null,
      wetravelBookingId: event.bookingId || null,
      wetravelStatus: 'paid', externalReference: intentData.externalReference || null,
      checkoutIntentId: intentId,
      customerEmail, customerEmailLower: normalizeEmail(customerEmail), customerName,
      customerNameLower: customerName.toLowerCase() || null,
      customerPhone: intentData.customerPhone || null, customerPhoneNormalized: normalizeDigits(intentData.customerPhone),
      customerCountry: intentData.customerCountry || null, customerDocument: intentData.customerDocument || null,
      customerDocumentNormalized: normalizeDigits(intentData.customerDocument),
      customerBirthDate: intentData.customerBirthDate || null,
      customerAge: typeof intentData.customerAge === 'number' ? intentData.customerAge : null,
      customerHotel: intentData.customerHotel || null, customerComments: intentData.customerComments || null,
      passengerDetails: Array.isArray(intentData.passengerDetails) ? intentData.passengerDetails : null,
      reservationCode, status: 'reserved', createdByAdmin: false, attachments: [],
      pricingSnapshot: buildReservationPricingSnapshot({
        unitAmount: Math.round(amountTotal / people), people, amountTotal,
        baseSubtotalAmount: intentData.baseSubtotalAmount ?? null,
        extrasTotalAmount: intentData.extrasTotalAmount ?? null, currency, paymentMethod: 'wetravel',
      }),
      capacitySnapshot: {
        date, maxPeoplePerBooking: pkg ? resolveDepartureConfig(pkg, date).maxPeople : null,
        hasSpecificDates: Boolean(pkg?.salidas?.length), enabled: pkg ? resolveDepartureConfig(pkg, date).enabled : false,
      },
      packageSnapshot: { id: packageId, slug: packageSlug, title: finalTitle },
      experienceSnapshot: { id: packageId, slug: packageSlug, title: finalTitle },
      statusHistory: [{ status: 'reserved', actor: 'system', note: `Pago confirmado por WeeTravel (ID: ${paymentId})`, createdAt: now }],
      paidAt: now, voucherSent: false, voucherSentAt: null,
      ...(referredBy ? { referredBy } : {}),
      voucherScheduledAt: shouldQueueVoucher ? nextVoucherAt : null, emailDelivery,
      createdAt: now, updatedAt: now,
    });

    if (!confirmSnap.exists()) tx.set(confirmJobRef, { type: 'cliente_confirmacion_compra', status: 'pending', to: customerEmail, from, replyTo,
      subject: `Compra confirmada: ${finalTitle}`, html: htmlConfirm, text: textConfirm, attempts: 0, lastError: null,
      providerMessageId: null, sentAt: null, wetravelPaymentId: paymentId, reservationId, nextAttemptAt: now, createdAt: now, updatedAt: now });
    if (!voucherSnap.exists() && shouldQueueVoucher) tx.set(voucherJobRef, { type: 'cliente_voucher_48hs', status: 'pending', to: customerEmail, from, replyTo,
      subject: `Recordatorio de salida (48 hs): ${finalTitle}`, html: htmlVoucher, text: textVoucher, attempts: 0, lastError: null,
      providerMessageId: null, sentAt: null, wetravelPaymentId: paymentId, reservationId, nextAttemptAt: nextVoucherAt, createdAt: now, updatedAt: now });
    if (!adminSnap.exists() && CONTACT_INFO.email) tx.set(adminJobRef, { type: 'admin_aviso', status: 'pending', to: CONTACT_INFO.email, from, replyTo,
      subject: `Nueva reserva: ${finalTitle} — ${customerName || customerEmail}`, html: htmlAdmin, text: textAdmin, attempts: 0, lastError: null,
      providerMessageId: null, sentAt: null, wetravelPaymentId: paymentId, reservationId, nextAttemptAt: now, createdAt: now, updatedAt: now });
    tx.set(paymentRef, { method: 'wetravel', status: 'paid', amount: amountTotal, currency, message: `Pago aprobado por WeeTravel (ID: ${paymentId})`,
      wetravelPaymentId: paymentId, createdAt: now, updatedAt: now }, { merge: true });
    return { alreadyExists: false, reservationId, reservationCode };
  });

  await updateDoc(doc(db, 'checkoutIntents', intentId), {
    status: 'completed', wetravelStatus: 'paid', wetravelPaymentId: event.paymentId || null,
    wetravelBookingId: event.bookingId || null, reservationId, updatedAt: Timestamp.now(),
  });
  await import('@/lib/operations/lifecycle').then(({ prepareReservationOperations }) => prepareReservationOperations(reservationId)).catch((error) => console.error('[wetravel] operaciones:', error));
  return result;
}

export async function releaseWeTravelHold(intentId: string, intentData: any, reason: string) {
  const holdId = String(intentData.holdId || '').trim();
  const now = Timestamp.now();
  if (holdId) {
    await runTransaction(db, async (tx) => {
      const holdRef = doc(db, 'reservationHolds', holdId);
      const holdSnap = await tx.get(holdRef);
      if (holdSnap.exists() && String(holdSnap.data()?.status || '') === 'active') {
        tx.update(holdRef, { status: 'released', releasedAt: now, releaseReason: reason, updatedAt: now });
      }
    });
  }
  await updateDoc(doc(db, 'checkoutIntents', intentId), { status: 'failed', wetravelStatus: reason, updatedAt: now });
}
