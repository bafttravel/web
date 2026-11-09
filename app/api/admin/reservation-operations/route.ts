import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { guardAdmin } from '@/lib/vendor-admin';
import { reservationOperationsSchema } from '@/lib/operations/schemas';
import { snapshotOperations } from '@/lib/operations/server';
import type { PackageOperations, ReservationOperations } from '@/lib/operations/types';
import { calculateVoucherReminderSchedule } from '@/lib/vouchers/schedule';

export const runtime = 'nodejs';
const schema = z.object({
  reservationId: z.string().regex(/^[\w-]{1,128}$/), operations: reservationOperationsSchema,
});
export async function PATCH(request: Request) {
  const guard = await guardAdmin(request); if (guard instanceof NextResponse) return guard;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Revisá los datos de operación' }, { status: 400 });
  try {
    const input = parsed.data;
    const ref = guard.db.collection('reservas').doc(input.reservationId);
    const before = await ref.get();
    if (!before.exists) return NextResponse.json({ error: 'Reserva inexistente' }, { status: 404 });
    const packageId = String(before.data()!.packageId ?? before.data()!.experienceId);
    const packageOps = await guard.db.collection('packageOperations').doc(packageId).get();
    const previousInput = before.data()?.operations as ReservationOperations | undefined;
    const next = await snapshotOperations(input.operations, previousInput ? { hotels: (packageOps.data() as PackageOperations | undefined)?.hotels ?? [], providers: previousInput.providers, costsComplete: previousInput.costsComplete } : packageOps.data() as PackageOperations | undefined, previousInput ? [previousInput.sellerHotelId, previousInput.pickupHotelId, ...previousInput.providers.map((p) => p.providerId)] : []);
    await guard.db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const ledger = await tx.get(guard.db.collection('operationsLedger').where('reservationId', '==', input.reservationId));
      const payments = await tx.get(ref.collection('payments'));
      if (!current.exists) throw new Error('La reserva ya no existe');
      const currentData = current.data()!;
      const previous = currentData.operations as ReservationOperations | undefined;
      const hasHotelLedger = ledger.docs.some((d) => ['hotel_payment', 'hotel_receipt', 'offset'].includes(String(d.data().kind)));
      if (previous && previous.sellerHotelId !== next.sellerHotelId && (ledger.size || payments.size)) throw new Error('No se puede cambiar quién realizó la venta después de registrar movimientos');
      if (previous?.commissionMethod && previous.commissionMethod !== next.commissionMethod && (payments.size || hasHotelLedger)) throw new Error('No se puede cambiar el medio de comisión después de registrar movimientos');
      const voucherJobId = String(currentData.emailDelivery?.customerVoucher?.jobId ?? '');
      const voucherJobRef = voucherJobId ? guard.db.collection('emailJobs').doc(voucherJobId) : null;
      const voucherJobSnap = voucherJobRef ? await tx.get(voucherJobRef) : null;
      const operations = {
        ...next,
        serviceExecuted: Boolean(previous?.serviceExecuted || current.data()?.status === 'completed'),
        automaticEmails: true,
        ...(previous && 'room' in previous ? { room: previous.room } : {}),
        ...(previous ? { providers: previous.providers, costsComplete: previous.costsComplete, ...(previous.sellerHotelId === next.sellerHotelId ? { commissions: previous.commissions, sellerHotelName: previous.sellerHotelName } : {}), ...(previous.pickupHotelId === next.pickupHotelId ? { pickupAddress: input.operations.pickupAddress } : {}) } : {}),
      };
      const now = new Date();
      const reservationUpdate: Record<string, any> = {
        operations,
        updatedAt: FieldValue.serverTimestamp(),
        statusHistory: FieldValue.arrayUnion({ status: currentData.status, actor: 'admin', note: 'Datos operativos actualizados', createdAt: now }),
      };

      if (voucherJobRef && voucherJobSnap?.exists) {
        const voucherJob = voucherJobSnap.data()!;
        const schedule = calculateVoucherReminderSchedule({
          date: currentData.date,
          departureTime: next.pickupTime || currentData.departureTime,
          timeZone: currentData.timeZone ?? currentData.timezone,
          nowMs: now.getTime(),
        });
        const statusAllowsVoucher = currentData.status === 'reserved';
        const sent = voucherJob.status === 'sent';
        const oldDepartureAtMs = Number(voucherJob.scheduledDepartureAtMs) || (() => {
          const oldSchedule = calculateVoucherReminderSchedule({
            date: currentData.date,
            departureTime: previous?.pickupTime || currentData.departureTime,
            timeZone: currentData.timeZone ?? currentData.timezone,
            nowMs: now.getTime(),
          });
          return oldSchedule.kind === 'scheduled' ? oldSchedule.departureAtMs : null;
        })();
        const changedDeparture = schedule.kind === 'scheduled' && oldDepartureAtMs !== schedule.departureAtMs;

        if (statusAllowsVoucher && schedule.kind === 'scheduled' && sent && changedDeparture) {
          const replacementId = `${input.reservationId}_cliente_voucher_48hs_${schedule.departureAtMs}`;
          const replacementRef = guard.db.collection('emailJobs').doc(replacementId);
          const replacementSnap = await tx.get(replacementRef);
          if (!replacementSnap.exists || replacementSnap.data()?.status !== 'sent') {
            const nextAttemptAt = new Date(schedule.nextAttemptAtMs);
            if (!replacementSnap.exists) {
              tx.set(replacementRef, {
                ...voucherJob,
                status: 'pending',
                attempts: 0,
                lastError: null,
                providerMessageId: null,
                sentAt: null,
                nextAttemptAt,
                scheduledDepartureAtMs: schedule.departureAtMs,
                createdAt: now,
                updatedAt: now,
              });
            } else {
              tx.update(replacementRef, { status: 'pending', attempts: 0, lastError: null, nextAttemptAt, scheduledDepartureAtMs: schedule.departureAtMs, updatedAt: now });
            }
            reservationUpdate['emailDelivery.customerVoucher.jobId'] = replacementId;
            reservationUpdate['emailDelivery.customerVoucher.status'] = 'queued';
            reservationUpdate['emailDelivery.customerVoucher.error'] = null;
            reservationUpdate['emailDelivery.customerVoucher.sentAt'] = null;
            reservationUpdate['emailDelivery.customerVoucher.providerMessageId'] = null;
            reservationUpdate.voucherScheduledAt = nextAttemptAt;
            reservationUpdate.voucherSent = false;
            reservationUpdate.voucherSentAt = null;
          }
        } else if (!sent) {
          if (statusAllowsVoucher && schedule.kind === 'scheduled') {
            const nextAttemptAt = new Date(schedule.nextAttemptAtMs);
            tx.update(voucherJobRef, { status: 'pending', nextAttemptAt, scheduledDepartureAtMs: schedule.departureAtMs, lastError: null, updatedAt: now });
            reservationUpdate['emailDelivery.customerVoucher.status'] = 'queued';
            reservationUpdate['emailDelivery.customerVoucher.error'] = null;
            reservationUpdate.voucherScheduledAt = nextAttemptAt;
          } else {
            const reason = schedule.kind === 'skipped' ? schedule.reason : 'La reserva ya no está activa.';
            tx.update(voucherJobRef, { status: 'cancelled', lastError: reason, updatedAt: now });
            reservationUpdate['emailDelivery.customerVoucher.status'] = 'cancelled';
            reservationUpdate['emailDelivery.customerVoucher.error'] = reason;
            reservationUpdate.voucherScheduledAt = null;
          }
        }
      }

      tx.update(ref, reservationUpdate);
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo actualizar' }, { status: 400 }); }
}
