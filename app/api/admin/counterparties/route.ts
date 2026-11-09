import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { guardAdmin } from '@/lib/vendor-admin';
import { counterpartySchema } from '@/lib/operations/schemas';
import { readAll } from '@/lib/operations/server';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const guard = await guardAdmin(request);
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json({ counterparties: await readAll(guard.db.collection('counterparties')) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'No se pudieron cargar los hoteles y proveedores' }, { status: 500 }); }
}
export async function POST(request: Request) { return save(request); }
export async function PATCH(request: Request) { return save(request); }
async function save(request: Request) {
  const guard = await guardAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const body = await request.json().catch(() => null);
  const parsed = counterpartySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
  if (request.method === 'PATCH' && (typeof body.id !== 'string' || !/^[\w-]{1,128}$/.test(body.id))) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  try {
    const ref = body.id ? guard.db.collection('counterparties').doc(body.id) : guard.db.collection('counterparties').doc();
    await guard.db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (body.id && !existing.exists) throw new Error('No encontramos el hotel o proveedor');
      if (existing.exists && existing.data()?.kind !== parsed.data.kind) throw new Error('No se puede convertir un hotel en proveedor ni un proveedor en hotel');
      tx.set(ref, { ...parsed.data, updatedAt: FieldValue.serverTimestamp(), ...(!existing.exists ? { createdAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
    });
    return NextResponse.json({ id: ref.id });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo guardar' }, { status: 400 }); }
}
