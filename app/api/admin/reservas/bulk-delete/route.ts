import { NextResponse } from 'next/server';
import { deleteReservationPermanently } from '@/lib/admin/reservation-deletion';
import { guardAdmin } from '@/lib/vendor-admin';

export const runtime = 'nodejs';

const MAX_BULK_CHUNK = 25;
const MAX_BULK_TOTAL = 300;

function isValidReservationId(id: unknown): id is string {
  return typeof id === 'string' && /^[\w-]{1,128}$/.test(id);
}

export async function POST(request: Request) {
  const guard = await guardAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const body = await request.json().catch(() => null);
  const ids = body?.ids;
  const totalCount = body?.totalCount;
  const confirmationCode = typeof body?.confirmationCode === 'string' ? body.confirmationCode.trim() : '';

  if (
    !Array.isArray(ids)
    || ids.length < 1
    || ids.length > MAX_BULK_CHUNK
    || !ids.every(isValidReservationId)
    || new Set(ids).size !== ids.length
    || !Number.isInteger(totalCount)
    || totalCount < ids.length
    || totalCount > MAX_BULK_TOTAL
    || confirmationCode !== `ELIMINAR ${totalCount}`
  ) {
    return NextResponse.json({ error: 'Solicitud de borrado masivo inválida o confirmación incorrecta' }, { status: 400 });
  }

  try {
    const authorization = request.headers.get('authorization') ?? '';
    const actor = authorization.startsWith('Bearer ')
      ? await guard.auth.verifyIdToken(authorization.slice(7))
      : null;
    const deletedBy = String(actor?.email ?? actor?.uid ?? 'admin');
    const results: Array<{ id: string; alreadyDeleted?: boolean; fileDeletionWarnings?: number; error?: string }> = [];

    // Keep each request bounded; the client sends larger selections in chunks.
    for (const id of ids) {
      try {
        results.push({ id, ...(await deleteReservationPermanently(guard.db, id, deletedBy)) });
      } catch (error) {
        console.error('[admin/reservas] No se pudo borrar una reserva del lote', { reservationId: id, error });
        results.push({ id, error: 'No se pudo completar el borrado de esta reserva' });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error('[admin/reservas] No se pudo completar el borrado masivo', error);
    return NextResponse.json({ error: 'No se pudo completar el borrado masivo' }, { status: 500 });
  }
}
