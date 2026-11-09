import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { guardAdmin } from '@/lib/vendor-admin';
import { reservationOperationsSchema } from '@/lib/operations/schemas';
import { snapshotOperations } from '@/lib/operations/server';
import type { PackageOperations, ReservationOperations } from '@/lib/operations/types';

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
      const previous = current.data()?.operations as ReservationOperations | undefined;
      const hasHotelLedger = ledger.docs.some((d) => ['hotel_payment', 'hotel_receipt', 'offset'].includes(String(d.data().kind)));
      if (previous && previous.sellerHotelId !== next.sellerHotelId && (ledger.size || payments.size)) throw new Error('No se puede cambiar quién realizó la venta después de registrar movimientos');
      if (previous?.commissionMethod && previous.commissionMethod !== next.commissionMethod && (payments.size || hasHotelLedger)) throw new Error('No se puede cambiar el medio de comisión después de registrar movimientos');
      const operations = {
        ...next,
        serviceExecuted: Boolean(previous?.serviceExecuted || current.data()?.status === 'completed'),
        automaticEmails: true,
        ...(previous && 'room' in previous ? { room: previous.room } : {}),
        ...(previous ? { providers: previous.providers, costsComplete: previous.costsComplete, ...(previous.sellerHotelId === next.sellerHotelId ? { commissions: previous.commissions, sellerHotelName: previous.sellerHotelName } : {}), ...(previous.pickupHotelId === next.pickupHotelId ? { pickupAddress: input.operations.pickupAddress } : {}) } : {}),
      };
      tx.update(ref, { operations, updatedAt: FieldValue.serverTimestamp(), statusHistory: FieldValue.arrayUnion({ status: current.data()?.status, actor: 'admin', note: 'Datos operativos actualizados', createdAt: new Date() }) });
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo actualizar' }, { status: 400 }); }
}
