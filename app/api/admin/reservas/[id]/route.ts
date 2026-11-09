import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/vendor-admin';
import { deleteReservationPermanently } from '@/lib/admin/reservation-deletion';
import { serializeFirestoreData } from '@/lib/utils/serialize';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

function isValidReservationId(id: string): boolean {
  return /^[\w-]{1,128}$/.test(id);
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
    const authorization = request.headers.get('authorization') ?? '';
    const actor = authorization.startsWith('Bearer ')
      ? await guard.auth.verifyIdToken(authorization.slice(7))
      : null;
    const result = await deleteReservationPermanently(
      guard.db,
      id,
      String(actor?.email ?? actor?.uid ?? 'admin'),
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[admin/reservas] No se pudo borrar la reserva', error);
    return NextResponse.json({ error: 'No se pudo completar el borrado de la reserva' }, { status: 500 });
  }
}
