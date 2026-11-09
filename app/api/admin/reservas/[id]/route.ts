import { FieldValue, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { deleteBlobAsset } from '@/lib/blob';
import { getSeatDepartureId, seatIdsFromLabels } from '@/lib/seats/server';
import { guardAdmin } from '@/lib/vendor-admin';
import { serializeFirestoreData } from '@/lib/utils/serialize';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

function isValidReservationId(id: string): boolean {
  return /^[\w-]{1,128}$/.test(id);
}

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

async function releaseReservationSeats(
  db: Firestore,
  reservationId: string,
  reservation: Record<string, any>,
) {
  const labels = Array.isArray(reservation.selectedSeats)
    ? reservation.selectedSeats.map((seat: unknown) => String(seat)).filter(Boolean)
    : [];
  const packageId = String(reservation.packageId ?? reservation.experienceId ?? '');
  const date = String(reservation.date ?? '');
  const layoutId = String(reservation.seatLayoutId ?? '');
  if (!labels.length || !packageId || !date || date === 'sin-fecha' || !layoutId) return;

  const layoutRef = db.collection('seatLayouts').doc(layoutId);
  const departureRef = db.collection('seatReservations').doc(getSeatDepartureId(packageId, date));
  await db.runTransaction(async (transaction) => {
    const [reservationSnapshot, layoutSnapshot, departureSnapshot] = await Promise.all([
      transaction.get(db.collection('reservas').doc(reservationId)),
      transaction.get(layoutRef),
      transaction.get(departureRef),
    ]);
    if (!reservationSnapshot.exists || !layoutSnapshot.exists || !departureSnapshot.exists) return;

    const template = { id: layoutSnapshot.id, ...layoutSnapshot.data() } as any;
    const seatIds = seatIdsFromLabels(template, labels);
    if (!seatIds.length) return;

    const departure = departureSnapshot.data() ?? {};
    const seats = { ...(departure.seats ?? {}) } as Record<string, Record<string, unknown>>;
    const templateSeats = new Map<string, Record<string, unknown>>(
      (Array.isArray(template.seats) ? template.seats : []).map((seat: Record<string, unknown>) => [String(seat.seatId), seat]),
    );
    let changed = false;

    for (const seatId of seatIds) {
      const current = seats[seatId];
      if (!current || String(current.reservationId ?? '') !== reservationId) continue;
      const base = templateSeats.get(seatId);
      const disabled = Boolean(base?.disabled);
      const defaultBlocked = Boolean(base?.defaultBlocked);
      seats[seatId] = {
        status: disabled ? 'disabled' : defaultBlocked ? 'blocked' : 'available',
        holdId: null,
        cartId: null,
        cartItemId: null,
        orderId: null,
        reservationId: null,
        expiresAt: null,
        blockedBy: defaultBlocked ? 'default' : null,
        updatedAt: new Date(),
      };
      changed = true;
    }

    if (changed) transaction.set(departureRef, { seats, updatedAt: new Date() }, { merge: true });
  });
}

export async function GET(request: Request, { params }: RouteContext) {
  const guard = await guardAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  if (!isValidReservationId(id)) return NextResponse.json({ error: 'Reserva inválida' }, { status: 400 });

  try {
    const snapshot = await guard.db.collection('reservas').doc(id).get();
    if (!snapshot.exists) return NextResponse.json({ error: 'Reserva inexistente' }, { status: 404 });
    return NextResponse.json(
      { reservation: serializeFirestoreData({ id: snapshot.id, ...snapshot.data() }) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[admin/reservas] No se pudo cargar la reserva para duplicar', error);
    return NextResponse.json({ error: 'No se pudo cargar la reserva' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const guard = await guardAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  if (!isValidReservationId(id)) return NextResponse.json({ error: 'Reserva inválida' }, { status: 400 });

  try {
    const reservationRef = guard.db.collection('reservas').doc(id);
    const reservationSnapshot = await reservationRef.get();
    if (!reservationSnapshot.exists) return NextResponse.json({ ok: true, alreadyDeleted: true });

    const reservation = reservationSnapshot.data() ?? {};
    const requestBody = await request.json().catch(() => null);
    const expectedCode = String(reservation.reservationCode ?? id);
    const confirmationCode = typeof requestBody?.confirmationCode === 'string' ? requestBody.confirmationCode.trim() : '';
    if (confirmationCode !== expectedCode) {
      return NextResponse.json({ error: 'El código de reserva no coincide' }, { status: 400 });
    }
    const [paymentsSnapshot, jobsSnapshot, ordersSnapshot] = await Promise.all([
      reservationRef.collection('payments').get(),
      guard.db.collection('emailJobs').where('reservationId', '==', id).get(),
      guard.db.collection('orders').where('reservationIds', 'array-contains', id).get(),
    ]);
    const orderRefs = new Map(ordersSnapshot.docs.map((order) => [order.id, order.ref] as const));
    const linkedOrderId = String(reservation.orderId ?? '').trim();
    if (linkedOrderId && !orderRefs.has(linkedOrderId)) {
      const linkedOrder = await guard.db.collection('orders').doc(linkedOrderId).get();
      if (linkedOrder.exists) orderRefs.set(linkedOrder.id, linkedOrder.ref);
    }
    const authorization = request.headers.get('authorization') ?? '';
    const actor = authorization.startsWith('Bearer ')
      ? await guard.auth.verifyIdToken(authorization.slice(7))
      : null;
    const archiveRef = guard.db.collection('reservationDeletionArchives').doc(id);
    const archiveSnapshot = {
      reservationId: id,
      reservationCode: reservation.reservationCode ?? null,
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: String(actor?.email ?? actor?.uid ?? 'admin'),
      financialSnapshot: financialSnapshot(reservation),
      paymentEventCount: paymentsSnapshot.size,
      preservedOperationsLedger: true,
    };

    await archiveRef.set(archiveSnapshot, { merge: true });
    for (let offset = 0; offset < paymentsSnapshot.docs.length; offset += 450) {
      const batch = guard.db.batch();
      paymentsSnapshot.docs.slice(offset, offset + 450).forEach((payment) => {
        batch.set(archiveRef.collection('payments').doc(payment.id), {
          ...payment.data(),
          reservationId: id,
          archivedFromPaymentId: payment.id,
        }, { merge: true });
      });
      await batch.commit();
    }

    await releaseReservationSeats(guard.db, id, reservation);

    const firestoreOperations: Array<(batch: WriteBatch) => void> = [
      ...jobsSnapshot.docs.map((job) => (batch: WriteBatch) => batch.delete(job.ref)),
      ...[...orderRefs.values()].map((orderRef) => (batch: WriteBatch) => batch.update(orderRef, {
        reservationIds: FieldValue.arrayRemove(id),
        updatedAt: FieldValue.serverTimestamp(),
      })),
      ...paymentsSnapshot.docs.map((payment) => (batch: WriteBatch) => batch.delete(payment.ref)),
      (batch) => batch.delete(reservationRef),
    ];
    await writeInChunks(guard.db, firestoreOperations);

    const fileKeys = Array.isArray(reservation.attachments)
      ? [...new Set(reservation.attachments.map((attachment: Record<string, unknown>) => getOwnedAttachmentKey(attachment)).filter((key: string | null): key is string => Boolean(key)))]
      : [];
    const fileResults = await Promise.allSettled(fileKeys.map((key) => deleteBlobAsset(key)));
    const fileDeletionWarnings = fileResults.filter((result) => result.status === 'rejected').length;
    if (fileDeletionWarnings) {
      console.error('[admin/reservas] Algunos archivos de la reserva no pudieron eliminarse', {
        reservationId: id,
        failedCount: fileDeletionWarnings,
      });
    }

    return NextResponse.json({ ok: true, fileDeletionWarnings });
  } catch (error) {
    console.error('[admin/reservas] No se pudo borrar la reserva', error);
    return NextResponse.json({ error: 'No se pudo completar el borrado de la reserva' }, { status: 500 });
  }
}
