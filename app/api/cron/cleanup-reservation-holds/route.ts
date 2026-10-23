import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit as firestoreLimit,
  orderBy as firestoreOrderBy,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';

export const runtime = 'nodejs';

function getCronSecret(): string | null {
  return process.env.CRON_SECRET ?? null;
}

function isAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? 0 : ms;
  }
  const anyValue = value as any;
  if (typeof anyValue?.toMillis === 'function') return anyValue.toMillis();
  if (typeof anyValue?.seconds === 'number') return anyValue.seconds * 1000;
  return 0;
}

async function fetchExpiredHolds(batchSize: number): Promise<{ id: string; data: any }[]> {
  const col = collection(db, 'reservationHolds');
  const now = Timestamp.now();
  try {
    const q = query(
      col,
      where('status', '==', 'active'),
      where('expiresAt', '<=', now),
      firestoreOrderBy('expiresAt', 'asc'),
      firestoreLimit(batchSize)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, data: d.data() as any }));
  } catch {
    const q2 = query(col, where('status', '==', 'active'), firestoreLimit(200));
    const snap = await getDocs(q2);
    const list = snap.docs
      .map((d) => ({ id: d.id, data: d.data() as any }))
      .filter(({ data }) => toMillis(data?.expiresAt) > 0 && toMillis(data?.expiresAt) <= Date.now())
      .sort((a, b) => toMillis(a.data?.expiresAt) - toMillis(b.data?.expiresAt))
      .slice(0, batchSize);
    return list;
  }
}

export async function POST(request: Request) {
  return processExpiredHolds(request);
}

export async function GET(request: Request) {
  // GET para Vercel Cron.
  return processExpiredHolds(request);
}

async function processExpiredHolds(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const batchSize = 50;
  const holds = await fetchExpiredHolds(batchSize);
  if (holds.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, released: 0 });
  }

  const now = Timestamp.now();
  let released = 0;
  const processed: string[] = [];

  for (const hold of holds) {
    const holdRef = doc(db, 'reservationHolds', hold.id);
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(holdRef);
      if (!snap.exists()) return { ok: false as const };
      const data = snap.data() as any;
      if (String(data.status ?? '') !== 'active') return { ok: true as const, released: false as const };

      tx.update(holdRef, { status: 'released', releasedAt: now, releaseReason: 'expired', updatedAt: now });

      return { ok: true as const, released: true as const };
    }).catch(() => ({ ok: false as const }));

    processed.push(hold.id);
    if ((result as any).released) released += 1;
  }

  return NextResponse.json({ ok: true, processed: processed.length, released });
}
