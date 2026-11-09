import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { snapshotOperations } from './server';
import { EMPTY_RESERVATION_OPERATIONS, type PackageOperations } from './types';
import { buildAdminNuevaReservaHtml, buildAdminNuevaReservaText, buildClienteCompraConfirmadaHtml, buildClienteCompraConfirmadaText, buildClienteVoucher48hsHtml, buildClienteVoucher48hsText } from '@/lib/emails/reserva-confirmada';
import { getFromEmail } from '@/lib/resend';
import { CONTACT_INFO, SITE_NAME } from '@/lib/constants';
import { calculateVoucherReminderSchedule } from '@/lib/vouchers/schedule';

const escape = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** Stable job IDs + transaction: retries never enqueue another sale notification. */
export async function prepareReservationOperations(reservationId: string, queueCustomer = false) {
  if (!adminDb) throw new Error('Firebase Admin no está configurado');
  const db = adminDb;
  const ref = db.collection('reservas').doc(reservationId);
  const initial = await ref.get();
  if (!initial.exists) return;
  const data = initial.data()!;
  const packageId = String(data.packageId ?? data.experienceId ?? '');
  const packageOps = packageId ? await db.collection('packageOperations').doc(packageId).get() : null;
  const operations = data.operations ?? await snapshotOperations({ ...EMPTY_RESERVATION_OPERATIONS, channel: data.createdByAdmin ? 'front' : 'web' }, packageOps?.data() as PackageOperations | undefined);
  const vendor = data.referredBy?.vendorId ? await db.collection('vendors').doc(data.referredBy.vendorId).get() : null;
  const now = Timestamp.now();
  const confirmed = ['reserved', 'completed'].includes(data.status);
  const jobs: Array<{ id: string; type: string; to: string; subject: string; html: string; text: string; nextAttemptAt: Timestamp; path: string }> = [];
  const title = String(data.packageTitle ?? data.experienceTitle ?? SITE_NAME);
  const code = String(data.reservationCode ?? reservationId);
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
  if (confirmed && vendor?.exists && vendor.data()?.active && vendor.data()?.email) {
    const text = `Venta confirmada\nReserva: ${code}\nExcursión: ${title}\nFecha: ${data.date}\nPasajeros: ${data.people}\nCliente: ${data.customerName ?? ''}\nImporte: ${(Number(data.amountTotal) / 100).toFixed(2)} ${String(data.currency).toUpperCase()}`;
    jobs.push({ id: `${reservationId}_vendedor_aviso`, type: 'vendedor_aviso', to: vendor.data()!.email, subject: `Venta confirmada: ${title}`, html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Una venta referida por vos fue confirmada</h2><p>${escape(text).replace(/\n/g, '<br/>')}</p></div>`, text, nextAttemptAt: now, path: 'vendorNotification' });
  }
  const emailData = { customerName: escape(data.customerName), experienceTitle: escape(title), dateFormatted: String(data.date), peopleLabel: `${data.people} pasajeros`, amountFormatted: `${(Number(data.amountTotal) / 100).toFixed(2)} ${String(data.currency).toUpperCase()}`, reservationCode: code, lookupUrl: siteUrl ? `${siteUrl}/consultar-reserva?code=${encodeURIComponent(code)}` : undefined, sessionId: reservationId, customerEmail: escape(data.customerEmail), pickupAddress: escape(operations.pickupAddress), pickupTime: operations.pickupTime, pickupHotel: escape(operations.pickupHotelName) };
  if (confirmed && queueCustomer && CONTACT_INFO.email && !data.emailDelivery?.adminNotification?.jobId) jobs.push({ id: `${reservationId}_admin_aviso`, type: 'admin_aviso', to: CONTACT_INFO.email, subject: `Nueva reserva: ${title}`, html: buildAdminNuevaReservaHtml(emailData), text: buildAdminNuevaReservaText(emailData), nextAttemptAt: now, path: 'adminNotification' });
  if (confirmed && queueCustomer && data.customerEmail) {
    if (!data.emailDelivery?.customerConfirmation?.jobId) jobs.push({ id: `${reservationId}_cliente_confirmacion_compra`, type: 'cliente_confirmacion_compra', to: data.customerEmail, subject: `Compra confirmada: ${title}`, html: buildClienteCompraConfirmadaHtml(emailData), text: buildClienteCompraConfirmadaText(emailData), nextAttemptAt: now, path: 'customerConfirmation' });
    if (data.status === 'reserved' && !data.emailDelivery?.customerVoucher?.jobId) {
      const schedule = calculateVoucherReminderSchedule({
        date: data.date,
        departureTime: operations.pickupTime || data.departureTime,
        timeZone: data.timeZone ?? data.timezone,
        nowMs: now.toMillis(),
      });
      if (schedule.kind === 'scheduled') {
        jobs.push({ id: `${reservationId}_cliente_voucher_48hs`, type: 'cliente_voucher_48hs', to: data.customerEmail, subject: `Voucher de salida: ${title}`, html: buildClienteVoucher48hsHtml(emailData), text: buildClienteVoucher48hsText(emailData), nextAttemptAt: Timestamp.fromMillis(schedule.nextAttemptAtMs), path: 'customerVoucher' });
      }
    }
  }
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const existing = await Promise.all(jobs.map((j) => tx.get(db.collection('emailJobs').doc(j.id))));
    if (!current.exists) return;
    if (!current.data()?.operations) tx.update(ref, { operations });
    if (!['reserved', 'completed'].includes(current.data()?.status)) return;
    jobs.forEach((j, i) => {
      if (existing[i].exists) return;
      const currentData = current.data()!;
      if (j.type === 'cliente_voucher_48hs' && currentData.status !== 'reserved') return;
      const voucherSchedule = j.type === 'cliente_voucher_48hs'
        ? calculateVoucherReminderSchedule({
            date: currentData.date,
            departureTime: currentData.operations?.pickupTime || currentData.departureTime,
            timeZone: currentData.timeZone ?? currentData.timezone,
            nowMs: now.toMillis(),
          })
        : null;
      if (voucherSchedule && voucherSchedule.kind !== 'scheduled') return;
      const nextAttemptAt = voucherSchedule?.kind === 'scheduled'
        ? Timestamp.fromMillis(voucherSchedule.nextAttemptAtMs)
        : j.nextAttemptAt;
      tx.create(db.collection('emailJobs').doc(j.id), {
        type: j.type,
        status: 'pending',
        to: j.to,
        from: getFromEmail(),
        subject: j.subject,
        html: j.html,
        text: j.text,
        reservationId,
        attempts: 0,
        lastError: null,
        nextAttemptAt,
        ...(voucherSchedule?.kind === 'scheduled' ? { scheduledDepartureAtMs: voucherSchedule.departureAtMs } : {}),
        createdAt: now,
        updatedAt: now,
      });
      tx.update(ref, {
        [`emailDelivery.${j.path}`]: { status: 'queued', jobId: j.id, provider: 'resend', sentAt: null },
        ...(j.path === 'customerVoucher' ? { voucherScheduledAt: nextAttemptAt } : {}),
      });
    });
  });
}
