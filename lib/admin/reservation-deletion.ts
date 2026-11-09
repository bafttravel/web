import { FieldValue, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { deleteBlobAsset } from '@/lib/blob';

function financialSnapshot(reservation: Record<string, any>) {
  const operations = reservation.operations ?? {};
  const referredBy = reservation.referredBy ?? null;
  return {
    reservationCode: reservation.reservationCode ?? null,
    packageId: reservation.packageId ?? reservation.experienceId ?? null,
    packageTitle: reservation.packageTitle ?? reservation.experienceTitle ?? null,
    date: reservation.date ?? null,
    people: reservation.people ?? null,
    amountTotal: reservation.amountTotal ?? null,
    currency: reservation.currency ?? null,
    paymentMethod: reservation.paymentMethod ?? null,
    status: reservation.status ?? null,
    createdAt: reservation.createdAt ?? null,
    customerName: reservation.customerName ?? null,
    selectedExtras: reservation.selectedExtras ?? [],
    pricingSnapshot: reservation.pricingSnapshot ?? null,
    mercadoPagoPaymentId: reservation.mercadoPagoPaymentId ?? null,
    mercadoPagoPreferenceId: reservation.mercadoPagoPreferenceId ?? null,
    mercadoPagoStatus: reservation.mercadoPagoStatus ?? null,
    externalReference: reservation.externalReference ?? null,
    orderId: reservation.orderId ?? null,
    checkoutIntentId: reservation.checkoutIntentId ?? null,
    operations: {
      serviceExecuted: Boolean(operations.serviceExecuted),
      sellerHotelId: operations.sellerHotelId ?? '',
      sellerHotelName: operations.sellerHotelName ?? '',
      commissionMethod: operations.commissionMethod ?? '',
      commissions: operations.commissions ?? null,
      providers: operations.providers ?? [],
      costsComplete: Boolean(operations.costsComplete),
    },
    referredBy: referredBy
      ? {
          vendorId: referredBy.vendorId ?? '',
          vendorName: referredBy.vendorName ?? '',
          code: referredBy.code ?? '',
          commissionType: referredBy.commissionType ?? null,
          commissionValue: referredBy.commissionValue ?? null,
          commissionAmount: referredBy.commissionAmount ?? null,
          commissionCurrency: referredBy.commissionCurrency ?? null,
          payoutStatus: referredBy.payoutStatus ?? null,
        }
      : null,
  };
}

function getOwnedAttachmentKey(attachment: Record<string, unknown>): string | null {
  if (!attachment || typeof attachment !== 'object') return null;
  let key = typeof attachment.key === 'string' ? attachment.key.trim() : '';
  if (!key && typeof attachment.url === 'string') {
    try {
      const url = new URL(attachment.url);
      const publicBase = process.env.R2_PUBLIC_BASE;
      if (!publicBase || url.origin !== new URL(publicBase).origin) return null;
      key = decodeURIComponent(url.pathname.replace(/^\//, ''));
    } catch {
      return null;
    }
  }

  if (!key || key.startsWith('comprobantes/') || key.includes('..') || key.startsWith('/')) return null;
  if (key.startsWith('reservas/')) return key;
  // Older reservation uploads used a UUID-prefixed object key at the bucket root.
  return /^[\da-f]{8}-[\da-f-]{27}-/i.test(key) ? key : null;
}

async function writeInChunks(
  db: Firestore,
  operations: Array<(batch: WriteBatch) => void>,
) {
  for (let offset = 0; offset < operations.length; offset += 450) {
    const batch = db.batch();
    operations.slice(offset, offset + 450).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

export async function deleteReservationPermanently(
  db: Firestore,
  reservationId: string,
  deletedBy: string,
): Promise<{ alreadyDeleted: boolean; fileDeletionWarnings: number }> {
  const reservationRef = db.collection('reservas').doc(reservationId);
  const reservationSnapshot = await reservationRef.get();
  if (!reservationSnapshot.exists) return { alreadyDeleted: true, fileDeletionWarnings: 0 };

  const reservation = reservationSnapshot.data() ?? {};
  const [paymentsSnapshot, jobsSnapshot, ordersSnapshot] = await Promise.all([
    reservationRef.collection('payments').get(),
    db.collection('emailJobs').where('reservationId', '==', reservationId).get(),
    db.collection('orders').where('reservationIds', 'array-contains', reservationId).get(),
  ]);
  const orderRefs = new Map(ordersSnapshot.docs.map((order) => [order.id, order.ref] as const));
  const linkedOrderId = String(reservation.orderId ?? '').trim();
  if (linkedOrderId && !orderRefs.has(linkedOrderId)) {
    const linkedOrder = await db.collection('orders').doc(linkedOrderId).get();
    if (linkedOrder.exists) orderRefs.set(linkedOrder.id, linkedOrder.ref);
  }

  const archiveRef = db.collection('reservationDeletionArchives').doc(reservationId);
  await archiveRef.set({
    reservationId,
    reservationCode: reservation.reservationCode ?? null,
    deletedAt: FieldValue.serverTimestamp(),
    deletedBy,
    financialSnapshot: financialSnapshot(reservation),
    paymentEventCount: paymentsSnapshot.size,
    preservedOperationsLedger: true,
  }, { merge: true });

  for (let offset = 0; offset < paymentsSnapshot.docs.length; offset += 450) {
    const batch = db.batch();
    paymentsSnapshot.docs.slice(offset, offset + 450).forEach((payment) => {
      batch.set(archiveRef.collection('payments').doc(payment.id), {
        ...payment.data(),
        reservationId,
        archivedFromPaymentId: payment.id,
      }, { merge: true });
    });
    await batch.commit();
  }

  const firestoreOperations: Array<(batch: WriteBatch) => void> = [
    ...jobsSnapshot.docs.map((job) => (batch: WriteBatch) => batch.delete(job.ref)),
    ...[...orderRefs.values()].map((orderRef) => (batch: WriteBatch) => batch.update(orderRef, {
      reservationIds: FieldValue.arrayRemove(reservationId),
      updatedAt: FieldValue.serverTimestamp(),
    })),
    ...paymentsSnapshot.docs.map((payment) => (batch: WriteBatch) => batch.delete(payment.ref)),
    (batch) => batch.delete(reservationRef),
  ];
  await writeInChunks(db, firestoreOperations);

  const fileKeys = Array.isArray(reservation.attachments)
    ? [...new Set(reservation.attachments
        .map((attachment: Record<string, unknown>) => getOwnedAttachmentKey(attachment))
        .filter((key: string | null): key is string => Boolean(key)))]
    : [];
  const fileResults = await Promise.allSettled(fileKeys.map((key) => deleteBlobAsset(key)));
  const fileDeletionWarnings = fileResults.filter((result) => result.status === 'rejected').length;
  if (fileDeletionWarnings) {
    console.error('[admin/reservas] Algunos archivos de la reserva no pudieron eliminarse', {
      reservationId,
      failedCount: fileDeletionWarnings,
    });
  }

  return { alreadyDeleted: false, fileDeletionWarnings };
}
