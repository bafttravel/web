import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Timestamp, doc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'nodejs';

const payloadSchema = z.object({
  holdId: z.string().min(1),
});

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) return true;
  try {
    return new URL(origin).origin === new URL(site).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  }

  const holdId = parsed.data.holdId.trim();
  const now = Timestamp.now();

  const result = await runTransaction(db, async (tx) => {
    const holdRef = doc(db, 'reservationHolds', holdId);
    const holdSnap = await tx.get(holdRef);
    if (!holdSnap.exists()) return { ok: false, code: 'not_found' as const };

    const hold: any = holdSnap.data();
    const status = String(hold.status ?? '');
    if (status !== 'active') return { ok: true, already: true as const };

    tx.update(holdRef, { status: 'released', releasedAt: now, updatedAt: now });

    return { ok: true, already: false as const };
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'Hold no encontrado.' }, { status: 404 });
  }

  return NextResponse.json({ released: true, alreadyReleased: Boolean((result as any).already) });
}

