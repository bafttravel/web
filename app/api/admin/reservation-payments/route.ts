import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { guardAdmin } from '@/lib/vendor-admin';
import { reservationPaymentSchema } from '@/lib/operations/payment-schemas';
import { collectorForPayment, signedPayment } from '@/lib/operations/calculations';
import type { PaymentRecord } from '@/lib/operations/types';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const guard = await guardAdmin(request); if (guard instanceof NextResponse) return guard;
  const parsed = reservationPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Revisá los datos del cobro o devolución' }, { status: 400 });
  try {
    const input = parsed.data; const user = await guard.auth.verifyIdToken((request.headers.get('authorization') ?? '').slice(7));
    if (Date.parse(input.occurredAt) > Date.now() + 60000) throw new Error('La fecha no puede ser futura');
    const ref = guard.db.collection('reservas').doc(input.reservationId); const paymentRef = ref.collection('payments').doc(input.requestId);
    await guard.db.runTransaction(async (tx) => {
      const existing = await tx.get(paymentRef); if (existing.exists) return;
      const reservation = await tx.get(ref); if (!reservation.exists) throw new Error('La reserva no existe');
      const r = reservation.data()!;
      if (String(r.currency).toUpperCase() !== input.currency) throw new Error('La moneda no coincide con la reserva');
       const collector = collectorForPayment(String(r.operations?.sellerHotelId ?? ''), input.method);
       const payments = await tx.get(ref.collection('payments'));
       const collectorPaid = payments.docs.map((d) => d.data() as PaymentRecord).filter((p) => collectorForPayment(String(r.operations?.sellerHotelId ?? ''), p.method) === collector && String(p.currency ?? '').toUpperCase() === input.currency).reduce((s, p) => s + signedPayment(p), 0);
       if (input.movementType === 'refund' && input.amount > collectorPaid) throw new Error('La devolución supera lo que recibió quien realiza el reintegro');
       tx.create(paymentRef, { amount: input.amount, currency: input.currency.toLowerCase(), method: input.method, collectedBy: collector, movementType: input.movementType, status: 'paid', message: input.note, occurredAt: new Date(input.occurredAt), recordedBy: user.email ?? user.uid, createdAt: FieldValue.serverTimestamp() });
      tx.update(ref, { updatedAt: FieldValue.serverTimestamp(), financeVersion: FieldValue.increment(1) });
    });
    return NextResponse.json({ id: input.requestId });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo registrar' }, { status: 400 }); }
}
