import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { guardAdmin } from '@/lib/vendor-admin';
import { packageOperationsSchema } from '@/lib/operations/schemas';
import { EMPTY_PACKAGE_OPERATIONS } from '@/lib/operations/types';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const guard = await guardAdmin(request); if (guard instanceof NextResponse) return guard;
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[\w-]{1,128}$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  try {
    const snap = await guard.db.collection('packageOperations').doc(id).get();
    if (!snap.exists) return NextResponse.json({ operations: EMPTY_PACKAGE_OPERATIONS }, { headers: { 'Cache-Control': 'private, no-store' } });
    const parsed = packageOperationsSchema.safeParse(snap.data());
    return NextResponse.json({ operations: parsed.success ? parsed.data : EMPTY_PACKAGE_OPERATIONS }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  catch { return NextResponse.json({ error: 'No se pudieron cargar las condiciones comerciales' }, { status: 500 }); }
}
const schema = z.object({ id: z.string().regex(/^[\w-]{1,128}$/).optional(), package: z.record(z.unknown()), operations: packageOperationsSchema, removeSpecialPrice: z.boolean().default(false) });
/** Keep public product and private rates in a single atomic commit. */
export async function POST(request: Request) {
  const guard = await guardAdmin(request); if (guard instanceof NextResponse) return guard;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Revisá las condiciones comerciales de la excursión' }, { status: 400 });
  try {
    const { id, package: raw, operations, removeSpecialPrice } = parsed.data;
    const { operations: _private, id: _id, fechaCreacion: _created, ...publicData } = raw;
    void _private; void _id; void _created;
    const ref = id ? guard.db.collection('paquetes').doc(id) : guard.db.collection('paquetes').doc();
    await guard.db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (id && !existing.exists) throw new Error('La excursión no existe');
      const selections = [...operations.hotels.map((p) => ({ id: p.hotelId, kind: 'hotel' })), ...operations.providers.map((p) => ({ id: p.providerId, kind: 'provider' }))];
      for (const selected of selections) {
        const party = await tx.get(guard.db.collection('counterparties').doc(selected.id));
        if (!party.exists || party.data()?.kind !== selected.kind) throw new Error('Revisá los hoteles y proveedores seleccionados');
      }
      tx.set(ref, { ...publicData, updatedAt: FieldValue.serverTimestamp(), ...(!id ? { fechaCreacion: FieldValue.serverTimestamp() } : {}), ...(removeSpecialPrice ? { precioDescuentoPrimerosCupos: FieldValue.delete(), tarifaEspecialFechaLimite: FieldValue.delete() } : {}) }, { merge: true });
      tx.set(guard.db.collection('packageOperations').doc(ref.id), { ...operations, updatedAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ id: ref.id });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo guardar la excursión' }, { status: 400 }); }
}
