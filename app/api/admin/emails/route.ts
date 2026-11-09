import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy as firestoreOrderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { requireAdminToken } from '@/lib/adminAuth';
import { CONTACT_INFO, SITE_NAME } from '@/lib/constants';
import { getFromEmail, isResendConfigured } from '@/lib/resend';
import { sendEmailJobNow } from '@/lib/sales/send-email-job';

export const runtime = 'nodejs';

type AdminAction = 'retry' | 'sendNow';

const actionSchema = z.object({
  action: z.enum(['retry', 'sendNow']),
  jobId: z.string().min(1).max(200),
});

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

function serializeValue(value: unknown): unknown {
  if (!value) return value ?? null;
  const anyValue = value as any;
  if (typeof anyValue?.toDate === 'function') {
    try {
      return anyValue.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serializeValue(v)]));
  }
  return value;
}

function reservationSummary(data: any) {
  return {
    reservationCode: String(data?.reservationCode ?? ''),
    status: String(data?.status ?? ''),
    packageTitle: String(data?.packageTitle ?? data?.experienceTitle ?? ''),
    date: String(data?.date ?? ''),
    people: Number(data?.people ?? 0) || 0,
    amountTotal: Number(data?.amountTotal ?? 0) || 0,
    currency: String(data?.currency ?? ''),
    paymentMethod: String(data?.paymentMethod ?? ''),
    mercadoPagoPaymentId: String(data?.mercadoPagoPaymentId ?? ''),
    mercadoPagoStatus: String(data?.mercadoPagoStatus ?? ''),
    customerEmail: String(data?.customerEmail ?? ''),
    customerName: String(data?.customerName ?? ''),
    paidAt: serializeValue(data?.paidAt ?? null),
    voucherSent: Boolean(data?.voucherSent ?? false),
    voucherSentAt: serializeValue(data?.voucherSentAt ?? null),
    voucherScheduledAt: serializeValue(data?.voucherScheduledAt ?? null),
    emailDelivery: serializeValue(data?.emailDelivery ?? null) as any,
    createdAt: serializeValue(data?.createdAt ?? null),
  };
}

/**
 * Diagnóstico de emails de compra/vouchers (solo admin).
 *
 * GET /api/admin/emails?reservationId=.. | ?jobId=.. | ?email=.. | ?status=failed
 * Devuelve la reserva (si aplica), sus emailJobs y el estado de la config.
 */
export async function GET(request: Request) {
  try {
    await requireAdminToken(request);
  } catch {
    return NextResponse.json({ error: 'Autenticación inválida' }, { status: 401 });
  }

  const url = new URL(request.url);
  const reservationId = (url.searchParams.get('reservationId') ?? '').trim();
  const jobId = (url.searchParams.get('jobId') ?? '').trim();
  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase();
  const status = (url.searchParams.get('status') ?? '').trim().toLowerCase();
  const limitParam = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20) || 20));

  const config = {
    resendConfigured: isResendConfigured(),
    from: (() => { try { return getFromEmail(); } catch { return null; } })(),
    adminEmail: CONTACT_INFO.email,
    siteName: SITE_NAME,
    cronEmailPath: '/api/cron/email',
    cronVoucherHint: 'El voucher 48hs se programa con nextAttemptAt; el cron lo envía cuando llega la fecha.',
  };

  try {
    // 1) Búsqueda directa por job.
    if (jobId) {
      const snap = await getDoc(doc(db, 'emailJobs', jobId));
      if (!snap.exists()) return NextResponse.json({ error: 'Job no encontrado', config }, { status: 404 });
      const data = snap.data() as any;
      let reservation: any = null;
      if (data?.reservationId) {
        const rSnap = await getDoc(doc(db, 'reservas', String(data.reservationId))).catch(() => null);
        if (rSnap?.exists()) reservation = { ...reservationSummary(rSnap.data()), id: rSnap.id };
      }
      return NextResponse.json({
        ok: true,
        config,
        job: { id: snap.id, ...((serializeValue(data) as any) ?? {}) },
        reservation,
      });
    }

    // 2) Reserva + sus jobs.
    if (reservationId) {
      const rSnap = await getDoc(doc(db, 'reservas', reservationId));
      if (!rSnap.exists()) return NextResponse.json({ error: 'Venta no encontrada', config }, { status: 404 });
      const data = rSnap.data() as any;
      const jobsCol = collection(db, 'emailJobs');
      let jobDocs: Array<{ id: string; data: any }> = [];
      try {
        const q = query(jobsCol, where('reservationId', '==', reservationId), firestoreLimit(25));
        const snap = await getDocs(q);
        jobDocs = snap.docs.map((d) => ({ id: d.id, data: serializeValue(d.data()) }));
      } catch {
        jobDocs = [];
      }
      return NextResponse.json({
        ok: true,
        config,
        reservation: { ...reservationSummary(data), id: rSnap.id },
        jobs: jobDocs,
      });
    }

    // 3) Listado con filtros (logs).
    const col = collection(db, 'emailJobs');
    let docs: Array<{ id: string; data: any }> = [];
    try {
      if (status === 'failed' || status === 'pending' || status === 'sent' || status === 'sending' || status === 'cancelled') {
        const q = query(
          col,
          where('status', '==', status),
          firestoreOrderBy('updatedAt', 'desc'),
          firestoreLimit(limitParam)
        );
        const snap = await getDocs(q);
        docs = snap.docs.map((d) => ({ id: d.id, data: serializeValue(d.data()) }));
      } else if (email) {
        const q = query(col, where('to', '==', email), firestoreLimit(limitParam));
        const snap = await getDocs(q);
        docs = snap.docs
          .map((d) => ({ id: d.id, data: serializeValue(d.data()) }))
          .sort((a, b) => toMillis((b.data as any)?.updatedAt) - toMillis((a.data as any)?.updatedAt));
      } else {
        const q = query(col, firestoreOrderBy('updatedAt', 'desc'), firestoreLimit(limitParam));
        const snap = await getDocs(q);
        docs = snap.docs.map((d) => ({ id: d.id, data: serializeValue(d.data()) }));
      }
    } catch {
      // Fallback sin índices: traer últimos y filtrar en memoria.
      const q = query(col, firestoreLimit(200));
      const snap = await getDocs(q);
      docs = snap.docs
        .map((d) => ({ id: d.id, data: serializeValue(d.data()) }))
        .filter((j) => {
          const data = j.data as any;
          if (status && String(data?.status ?? '').toLowerCase() !== status) return false;
          if (email && String(data?.to ?? '').toLowerCase() !== email) return false;
          return true;
        })
        .sort((a, b) => toMillis((b.data as any)?.updatedAt) - toMillis((a.data as any)?.updatedAt))
        .slice(0, limitParam);
    }

    return NextResponse.json({ ok: true, config, jobs: docs });
  } catch (error) {
    return NextResponse.json(
      { error: 'No se pudo consultar los emails', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/emails { action: 'retry' | 'sendNow', jobId }
 * - retry: vuelve a pending con nextAttemptAt=ahora (lo toma el cron).
 * - sendNow: envía con Resend en el momento (solo admin) y marca sent/failed.
 */
export async function POST(request: Request) {
  let adminUser: any;
  try {
    adminUser = await requireAdminToken(request);
  } catch {
    return NextResponse.json({ error: 'Autenticación inválida' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos (action, jobId).' }, { status: 400 });
  }
  const { action, jobId } = parsed.data as { action: AdminAction; jobId: string };

  const jobRef = doc(db, 'emailJobs', jobId);
  const jobSnap = await getDoc(jobRef).catch(() => null);
  if (!jobSnap?.exists()) {
    return NextResponse.json({ error: 'Job no encontrado' }, { status: 404 });
  }
  const job = jobSnap.data() as any;

  if (action === 'retry') {
    if (job.status === 'cancelled') {
      return NextResponse.json({ error: 'El trabajo fue cancelado y ya no se puede reintentar.' }, { status: 409 });
    }
    const now = Timestamp.now();
    await updateDoc(jobRef, {
      status: 'pending',
      nextAttemptAt: now,
      lastError: null,
      updatedAt: now,
    });
    return NextResponse.json({ ok: true, jobId, queued: true });
  }

  const result = await sendEmailJobNow(jobId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, sentBy: adminUser?.email ?? 'admin' }, { status: result.status });
  }
  if ('deferred' in result && result.deferred) {
    return NextResponse.json({ ok: true, jobId, queued: true, deferred: true, nextAttemptAt: result.nextAttemptAt });
  }
  return NextResponse.json({ ok: true, jobId, sent: true, providerMessageId: 'providerMessageId' in result ? result.providerMessageId : null });
}
