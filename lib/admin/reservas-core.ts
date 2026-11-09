import { NextResponse } from 'next/server';
import { reservationOperationsSchema } from '@/lib/operations/schemas';
import { snapshotOperations } from '@/lib/operations/server';
import { EMPTY_RESERVATION_OPERATIONS, type PackageOperations } from '@/lib/operations/types';
import { adminDb } from '@/lib/firebaseAdmin';
import { prepareReservationOperations } from '@/lib/operations/lifecycle';
import { collectorForPayment, signedPayment } from '@/lib/operations/calculations';
import type { PaymentRecord } from '@/lib/operations/types';
import { z } from 'zod';
import {
  addReservaAttachments,
  getReservaById,
  removeReservaAttachmentsById,
  updateReservaStatus,
} from '@/lib/reservas';
import { getPaqueteById } from '@/lib/paquetes';
import { randomUUID } from 'crypto';
import { arrayUnion, collection, doc, getDoc, runTransaction, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getVendorById, getReferralByCode } from '@/lib/vendors';
import {
  computeCommission,
  nextPayoutStatusForReservationStatus,
  reservationHasConfirmedPayment,
  resolvePayoutStatus,
  syncReservationPayoutStatus,
} from '@/lib/referrals';
import { buildBaseSeatReservationSeats, getSeatDepartureId, seatIdsFromLabels } from '@/lib/seats/server';
import {
  normalizeDigits,
  normalizeEmail,
  reserveNextReservationCode,
} from '@/lib/reservas/code';
import type { SeatLayoutTemplate, SeatStatus } from '@/types';
import { buildDefaultEmailDelivery } from '@/lib/sales/status';
import { buildEmailDeliveryState, buildEmailJobDocument, emailDeliveryPathForJobType } from '@/lib/sales/email-jobs';
import { getFromEmail } from '@/lib/resend';
import { sendEmailJobNow } from '@/lib/sales/send-email-job';
import {
  buildAdminNuevaReservaHtml,
  buildAdminNuevaReservaText,
  buildClienteCompraConfirmadaHtml,
  buildClienteCompraConfirmadaText,
  buildClienteVoucher48hsHtml,
  buildClienteVoucher48hsText,
} from '@/lib/emails/reserva-confirmada';
import { CONTACT_INFO, SITE_NAME } from '@/lib/constants';
import {
  computeReservationPricing,
  getPackageAddonOptions,
  resolveDepartureConfig,
  resolveReservationExtraSelections,
} from '@/lib/packages/resolve-departure';
import { buildReservationPricingSnapshot } from '@/lib/sales/orchestrator';
import { calculateVoucherReminderSchedule } from '@/lib/vouchers/schedule';

const COLLECTION = 'reservas';

export type ReservaActorContext = {
  email: string;
  role: 'admin' | 'vendor';
  /** Solo para role === 'vendor': el vendedor autenticado. */
  vendor?: { id: string; name: string; allowedPackages: string[] | null };
};
const reservationStatusEnum = z.enum(['pending', 'reserved', 'completed', 'cancelled']);
const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().max(200).optional(),
  type: z.string().max(50).optional(),
  uploadedBy: z.enum(['admin', 'user', 'vendor']).default('admin'),
  key: z.string().optional(),
});

const paymentMovementSchema = z.object({
  movementType: z.enum(['payment', 'extra', 'discount', 'refund', 'adjustment']),
  amount: z.number().int().positive(),
  currency: z.string().min(3).max(10).optional(),
  method: z.string().min(2).max(30),
  reference: z.string().max(80).optional(),
  message: z.string().trim().max(160).default(''),
  occurredAt: z.string().datetime().optional(),
});

const travelerSchema = z.object({
  nationality: z.string().trim().max(80).optional(),
  diet: z.string().trim().max(1000).optional(),
  firstName: z.string().min(2).max(80),
  lastName: z.string().min(2).max(80),
  age: z.number().int().min(0).max(120),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phone: z.string().min(8).max(40),
  document: z.string().min(3).max(40),
  travelerType: z.enum(['adult', 'minor']).nullable().optional(),
});

const editableTravelerSchema = z.object({
  nationality: z.string().trim().max(80).optional(),
  diet: z.string().trim().max(1000).optional(),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  age: z.number().int().min(0).max(120).optional(),
  birthDate: z.string().max(10).optional(),
  phone: z.string().trim().max(40).optional(),
  document: z.string().trim().max(40).optional(),
  travelerType: z.enum(['adult', 'minor']).nullable().optional(),
});

/**
 * Adicional manual (creación/edición de reservas): título + precio los define
 * el admin, sin depender del catálogo del paquete. Es lo que permite sumar
 * un adicional creado para otra excursión.
 */
const manualExtraSchema = z.object({
  title: z.string().min(1).max(120),
  price: z.number().min(0).max(999999999),
  scope: z.enum(['per_booking', 'per_person']).optional(),
});

const addonEditSchema = z.object({
  index: z.number().int().min(0).max(500),
  expectedLabel: z.string().max(500),
  expectedAmount: z.number().int().min(0),
});
const correctionMovementSchema = z.object({
  paymentId: z.string().min(1).max(180),
  movementType: z.enum(['payment', 'extra', 'discount', 'refund', 'adjustment']),
  amount: z.number().int().positive(),
  method: z.string().min(2).max(30),
  reference: z.string().max(80).optional(),
  message: z.string().trim().max(160).default(''),
  reason: z.string().trim().min(3).max(160),
  occurredAt: z.string().datetime().optional(),
});

const adminReservaSchema = z.object({
  requestId: z.string().uuid().optional(),
  operations: reservationOperationsSchema.optional(),
  initialPayment: z.object({ method: z.enum(['pending', 'cash', 'transfer', 'card']), amount: z.number().int().min(0).optional() }).optional(),
  packageId: z.string().min(1),
  date: z.string().min(1),
  people: z.number().int().min(1).optional(),
  peopleAdults: z.number().int().min(0).max(50).optional(),
  peopleMinors: z.number().int().min(0).max(50).optional(),
  depositPercentAdults: z.number().min(0).max(100).optional(),
  depositPercentMinors: z.number().min(0).max(100).optional(),
  customerEmail: z.string().email(),
  customerName: z.string().min(2),
  customerPhone: z.string().max(40).optional(),
  customerCountry: z.string().max(40).optional(),
  customerDocument: z.string().max(40).optional(),
  customerBirthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customerComments: z.string().max(500).optional(),
  passengerDetails: z.array(travelerSchema).max(49).optional(),
  attachments: z.array(attachmentSchema).optional(),
  status: reservationStatusEnum.optional(),
  statusNote: z.string().max(500).optional(),
  vendorId: z.string().min(1).optional(),
  referralCode: z.string().max(60).optional(),
  selectedExtraCodes: z.array(z.enum(['cocheCama', 'panoramicos', 'cafeteras'])).max(10).optional(),
  addonIds: z.array(z.string().min(1).max(80)).max(20).optional(),
  manualExtras: z.array(manualExtraSchema).max(20).optional(),
  selectedSeats: z.array(z.string().min(1).max(20)).max(200).optional(),
}).refine((data) => {
  const a = typeof data.peopleAdults === 'number' ? data.peopleAdults : 0;
  const m = typeof data.peopleMinors === 'number' ? data.peopleMinors : 0;
  const total = a + m;
  if (total > 0) return total >= 1 && total <= 50;
  return typeof data.people === 'number' && data.people >= 1 && data.people <= 50;
}).superRefine((data, ctx) => {
  const a = typeof data.peopleAdults === 'number' ? data.peopleAdults : 0;
  const m = typeof data.peopleMinors === 'number' ? data.peopleMinors : 0;
  const total = a + m;
  const people = total > 0 ? total : typeof data.people === 'number' ? data.people : 0;
  const additionalTravelers = Math.max(0, people - 1);
  if (!data.customerBirthDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customerBirthDate'],
      message: 'La fecha de nacimiento es obligatoria.',
    });
  }
  const passengerCount = Array.isArray(data.passengerDetails) ? data.passengerDetails.length : 0;
  if (passengerCount !== additionalTravelers) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['passengerDetails'],
      message: 'La cantidad de pasajeros no coincide con la reserva.',
    });
  }
});

const adminUpdateSchema = z.object({
  reservationId: z.string().min(1),
  status: reservationStatusEnum.optional(),
  note: z.string().max(500).optional(),
  attachments: z.array(attachmentSchema).optional(),
  removeAttachments: z.array(z.object({ id: z.string().min(1) })).optional(),
  date: z.string().min(1).optional(),
  vendorId: z.string().min(1).optional(),
  referralCode: z.string().max(60).optional(),
  clearReferredBy: z.boolean().optional(),
  enqueueCustomerVoucherEmail: z.boolean().optional(),
  sendEmailNow: z.boolean().optional(),
  enqueueAdminNotificationEmail: z.boolean().optional(),
  addPaymentEvent: paymentMovementSchema.optional(),
  correctPaymentEvent: correctionMovementSchema.optional(),
  updateCustomer: z.object({
    customerName: z.string().trim().min(2).max(120),
    customerEmail: z.string().trim().email().max(200),
    customerPhone: z.string().trim().max(40).optional(),
    customerCountry: z.string().trim().max(80).optional(),
    customerDocument: z.string().trim().max(40).optional(),
    customerBirthDate: z.string().trim().max(10).optional(),
    customerComments: z.string().trim().max(1000).optional(),
    passengerDetails: z.array(editableTravelerSchema).max(49).optional(),
  }).optional(),
  /** Sumar un adicional existente a una venta ya creada (edición). */
  addAddonExtra: manualExtraSchema.optional(),
  updateAddonExtra: addonEditSchema.extend({
    title: z.string().trim().min(1).max(120),
    amount: z.number().int().min(0).max(99999999999),
    scope: z.enum(['per_booking', 'per_person']),
  }).optional(),
  removeAddonExtra: addonEditSchema.optional(),
});

function parseDate(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return 'sin-fecha';
}

function getErrorMessage(error: unknown, fallback = 'Error desconocido'): string {
  return error instanceof Error ? error.message : fallback;
}

function isEnabledDate(paquete: Awaited<ReturnType<typeof getPaqueteById>> | null, date: string): boolean {
  if (!paquete) return false;
  return resolveDepartureConfig(paquete, date).enabled;
}

function formatEmailDate(date: string): string {
  if (!date || date === 'sin-fecha') return 'A coordinar';
  try {
    return new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return date;
  }
}

function formatEmailAmount(amountTotal: number, currency: string): string {
  const value = (amountTotal ?? 0) / 100;
  const normalized = String(currency || 'ARS').toUpperCase();
  if (normalized === 'ARS') return `$${value.toLocaleString('es-AR')}`;
  if (normalized === 'BRL') return `R$ ${value.toLocaleString('pt-BR')}`;
  if (normalized === 'USD') return `USD ${value.toLocaleString('en-US')}`;
  return `${value.toFixed(2)} ${normalized}`;
}

function normalizePaymentMovementStatus(movementType: z.infer<typeof paymentMovementSchema>['movementType']): string {
  if (movementType === 'payment') return 'paid';
  if (movementType === 'refund') return 'refunded';
  return 'recorded';
}

function normalizePaymentMovementMethod(method: string, movementType: z.infer<typeof paymentMovementSchema>['movementType']): string {
  const normalized = String(method || '').trim().toLowerCase();
  if (normalized) return normalized;
  return movementType === 'payment' ? 'admin' : 'manual';
}

async function resolveReservationReferralAssignment(params: {
  packageId: string;
  amountTotal: number;
  people: number;
  status: z.infer<typeof reservationStatusEnum>;
  vendorId?: string;
  referralCode?: string;
  existingPayoutStatus?: 'pending' | 'accrued' | 'paid' | 'cancelled' | null;
  hasConfirmedPayment?: boolean;
}) {
  const packageId = String(params.packageId || '').trim();
  if (!packageId) {
    throw new Error('No se pudo identificar el paquete de la venta.');
  }

  const paquete = await getPaqueteById(packageId).catch(() => null);
  const commissionOverride =
    paquete?.bookingConfig?.referralCommission
      ? {
          type: paquete.bookingConfig.referralCommission.type,
          value: paquete.bookingConfig.referralCommission.value,
          currency: paquete.bookingConfig.referralCommission.currency,
        }
      : undefined;
  const payoutStatus = resolvePayoutStatus({
    status: params.status,
    hasConfirmedPayment: Boolean(params.hasConfirmedPayment),
    current: params.existingPayoutStatus,
  });

  const referralCode = String(params.referralCode ?? '').trim();
  if (referralCode) {
    const link = await getReferralByCode(referralCode).catch(() => null);
    if (!link) {
      throw new Error('El código de vendedor no existe o está inactivo.');
    }
    if (link.experienceId && String(link.experienceId) !== packageId) {
      throw new Error('El código elegido no corresponde a este paquete.');
    }
    const vendor = await getVendorById(link.vendorId).catch(() => null);
    if (!vendor || !vendor.active) {
      throw new Error('El vendedor asociado al código no está disponible.');
    }
    const allowedPackages = vendor.allowedPackages ?? vendor.allowedExperiences ?? null;
    if (Array.isArray(allowedPackages) && allowedPackages.length > 0 && !allowedPackages.includes(packageId)) {
      throw new Error('El vendedor no tiene habilitado este paquete.');
    }
    const comm = computeCommission({
      amountTotal: params.amountTotal,
      people: params.people,
      vendor,
      commissionOverride,
    });
    return {
      vendorId: vendor.id,
      vendorName: vendor.name,
      code: link.code,
      channel: 'link' as const,
      commissionType: comm.type,
      commissionValue: comm.value,
      commissionCurrency: comm.currency,
      commissionAmount: comm.commissionAmount,
      payoutStatus,
    };
  }

  const vendorId = String(params.vendorId ?? '').trim();
  if (vendorId) {
    const vendor = await getVendorById(vendorId).catch(() => null);
    if (!vendor || !vendor.active) {
      throw new Error('El vendedor seleccionado no está disponible.');
    }
    const allowedPackages = vendor.allowedPackages ?? vendor.allowedExperiences ?? null;
    if (Array.isArray(allowedPackages) && allowedPackages.length > 0 && !allowedPackages.includes(packageId)) {
      throw new Error('El vendedor seleccionado no opera este paquete.');
    }
    const comm = computeCommission({
      amountTotal: params.amountTotal,
      people: params.people,
      vendor,
      commissionOverride,
    });
    return {
      vendorId: vendor.id,
      vendorName: vendor.name,
      channel: 'manual' as const,
      commissionType: comm.type,
      commissionValue: comm.value,
      commissionCurrency: comm.currency,
      commissionAmount: comm.commissionAmount,
      payoutStatus,
    };
  }

  return null;
}

async function enqueueReservationEmailJob(options: {
  reservationId: string;
  type: 'cliente_confirmacion_compra' | 'cliente_voucher_48hs' | 'admin_aviso';
  nextAttemptAt?: Timestamp;
  jobId?: string;
  scheduledDepartureAtMs?: number;
}) {
  const reservation = await getReservaById(options.reservationId);
  if (!reservation) throw new Error('Venta no encontrada');

  const reservationCode = String((reservation as any).reservationCode ?? reservation.id);
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
  const lookupUrl = siteUrl
    ? `${siteUrl}/consultar-reserva?code=${encodeURIComponent(reservationCode)}`
    : undefined;
  const peopleLabel = reservation.people === 1 ? '1 persona' : `${reservation.people} personas`;
  const seatsLabel = Array.isArray((reservation as any).selectedSeats) && (reservation as any).selectedSeats.length > 0
    ? (reservation as any).selectedSeats.join(', ')
    : undefined;
  const emailData = {
    customerName: reservation.customerName ?? '',
    experienceTitle: reservation.packageTitle || reservation.experienceTitle || SITE_NAME,
    dateFormatted: formatEmailDate(reservation.date),
    peopleLabel,
    seatsLabel,
    amountFormatted: formatEmailAmount(reservation.amountTotal ?? 0, reservation.currency ?? 'ARS'),
    reservationCode,
    lookupUrl,
    sessionId: reservation.orderId || reservation.id,
    customerEmail: reservation.customerEmail ?? '',
    customerPhone: reservation.customerPhone,
    customerCountry: reservation.customerCountry,
    customerComments: reservation.customerComments,
  };

  const now = Timestamp.now();
  const jobId = options.jobId || `${options.reservationId}_${options.type}_${Date.now()}`;
  const emailJobRef = doc(db, 'emailJobs', jobId);
  const reservationRef = doc(db, COLLECTION, options.reservationId);
  const subject =
    options.type === 'cliente_confirmacion_compra'
      ? `Compra confirmada: ${reservation.packageTitle || reservation.experienceTitle || SITE_NAME}`
      : options.type === 'cliente_voucher_48hs'
        ? `Recordatorio de salida (48 hs): ${reservation.packageTitle || reservation.experienceTitle || SITE_NAME}`
      : `Nueva venta: ${reservation.packageTitle || reservation.experienceTitle || 'Paquete'} — ${reservation.customerName || reservation.customerEmail}`;
  const to =
    options.type === 'cliente_confirmacion_compra' || options.type === 'cliente_voucher_48hs'
      ? reservation.customerEmail
      : CONTACT_INFO.email;
  const html =
    options.type === 'cliente_confirmacion_compra'
      ? buildClienteCompraConfirmadaHtml(emailData)
      : options.type === 'cliente_voucher_48hs'
        ? buildClienteVoucher48hsHtml(emailData)
      : buildAdminNuevaReservaHtml(emailData);
  const text =
    options.type === 'cliente_confirmacion_compra'
      ? buildClienteCompraConfirmadaText(emailData)
      : options.type === 'cliente_voucher_48hs'
        ? buildClienteVoucher48hsText(emailData)
      : buildAdminNuevaReservaText(emailData);

  await setDoc(
    emailJobRef,
    buildEmailJobDocument({
      type: options.type,
      to,
      from: getFromEmail(),
      subject,
      html,
      text,
      reservationId: options.reservationId,
      now,
      nextAttemptAt: options.nextAttemptAt || now,
      extra: typeof options.scheduledDepartureAtMs === 'number'
        ? { scheduledDepartureAtMs: options.scheduledDepartureAtMs }
        : undefined,
    })
  );

  await updateDoc(reservationRef, {
    [emailDeliveryPathForJobType(options.type)]: buildEmailDeliveryState({
      status: 'queued',
      now,
      jobId,
    }),
    updatedAt: now,
  }).catch(() => null);

  return jobId;
}

export async function createReservaCore(request: Request, ctx: ReservaActorContext) {
  const adminUser = { email: ctx.email };
  const isVendor = ctx.role === 'vendor';

  let payload: z.infer<typeof adminReservaSchema>;
  try {
    const body = await request.json();
    payload = adminReservaSchema.parse({
      ...body,
      date: parseDate(body.date),
    });
  } catch (error) {
    console.error('[admin/reservas] Error parseando payload:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors.map((item) => item.message).join(', ') },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const paquete = await getPaqueteById(payload.packageId);
  if (!paquete) {
    return NextResponse.json({ error: 'Paquete no encontrado' }, { status: 404 });
  }

  if (isVendor && ctx.vendor) {
    const allowed = ctx.vendor.allowedPackages;
    if ((paquete as any).visible === false) {
      return NextResponse.json({ error: 'La excursión no está disponible.' }, { status: 404 });
    }
    if (allowed && allowed.length > 0 && !allowed.includes(paquete.id)) {
      return NextResponse.json({ error: 'No tenés permiso para este paquete.' }, { status: 403 });
    }
    // El vendedor siempre carga ventas a su nombre y sin estados finales.
    payload.vendorId = ctx.vendor.id;
    payload.referralCode = undefined;
    if (payload.manualExtras?.length) {
      const options = getPackageAddonOptions(paquete as any);
      const allowedExtras = payload.manualExtras.every((extra) =>
        options.some((o) => o.title === extra.title && Number(o.price) === Number(extra.price))
      );
      if (!allowedExtras) {
        return NextResponse.json({ error: 'Los adicionales elegidos no corresponden a esta excursión.' }, { status: 400 });
      }
    }
    if (payload.status !== 'pending') payload.status = 'reserved';
  }

  try {
    const packageSlug = paquete.slug ?? paquete.id;
    const bc = paquete.bookingConfig;
    const departureConfig = resolveDepartureConfig(paquete, payload.date);
    const maxPeople = departureConfig.maxPeople;
    const adults = Math.max(0, Number((payload as any).peopleAdults ?? 0) || 0);
    const minors = Math.max(0, Number((payload as any).peopleMinors ?? 0) || 0);
    const derivedPeople = adults + minors;
    const people = derivedPeople > 0 ? derivedPeople : Math.max(1, Number((payload as any).people ?? 1) || 1);
    const peopleAdults = derivedPeople > 0 ? adults : null;
    const peopleMinors = derivedPeople > 0 ? minors : null;
    const depositPercentAdults = typeof (payload as any).depositPercentAdults === 'number' ? Number((payload as any).depositPercentAdults) : null;
    const depositPercentMinors = typeof (payload as any).depositPercentMinors === 'number' ? Number((payload as any).depositPercentMinors) : null;

    if (people > maxPeople) {
      return NextResponse.json({ error: `Máximo permitido por reserva: ${maxPeople}` }, { status: 400 });
    }
    if (!isEnabledDate(paquete, payload.date)) {
      return NextResponse.json({ error: 'La fecha seleccionada no está habilitada para este paquete.' }, { status: 400 });
    }

    const computedPricing = computeReservationPricing(paquete, payload.date, {
      people,
      peopleAdults,
      peopleMinors,
      depositPercentAdults,
      depositPercentMinors,
    });
    const currency = (computedPricing.currency ?? 'ars').toLowerCase() as 'ars' | 'brl' | 'usd';
    const unitAmount = computedPricing.unitAmount;
    if (computedPricing.pricingMode === 'percent' && computedPricing.baseUnitAmount < 1) {
      return NextResponse.json({ error: 'Falta precio base para calcular porcentaje.' }, { status: 400 });
    }
    if (!Number.isFinite(unitAmount) || unitAmount < 1 || computedPricing.subtotalAmount < 1) {
      return NextResponse.json({ error: 'Este paquete no tiene configurado un valor de reserva válido.' }, { status: 400 });
    }
    const amountTotal = computedPricing.subtotalAmount;

    const selectedSeats = Array.isArray(payload.selectedSeats)
      ? Array.from(new Set(payload.selectedSeats.map((s) => String(s).trim()).filter(Boolean)))
      : [];
    const seatsEnabled = departureConfig.seatsEnabled;
    const seatLayoutId = departureConfig.seatLayoutId ?? '';
    if (seatsEnabled) {
      if (!seatLayoutId) {
        return NextResponse.json({ error: 'La salida requiere butacas, pero no tiene plantilla asignada.' }, { status: 400 });
      }
      if (selectedSeats.length !== people) {
        return NextResponse.json({ error: 'Debés seleccionar una butaca por pasajero.' }, { status: 400 });
      }
    }

    const selectedExtraCodes = Array.isArray(payload.selectedExtraCodes)
      ? Array.from(new Set(payload.selectedExtraCodes.map((code) => String(code).trim()).filter(Boolean)))
      : [];
    let seatLayoutTemplateForExtras: SeatLayoutTemplate | null = null;
    if (seatLayoutId && selectedExtraCodes.length > 0) {
      const templateSnap = await getDoc(doc(db, 'seatLayouts', seatLayoutId));
      if (!templateSnap.exists()) {
        return NextResponse.json({ error: 'Plantilla de micro no encontrada.' }, { status: 400 });
      }
      seatLayoutTemplateForExtras = { id: templateSnap.id, ...(templateSnap.data() as any) } as SeatLayoutTemplate;
    }
    const selectedExtras = resolveReservationExtraSelections({
      paquete,
      selectedExtraCodes,
      addonIds: Array.isArray((payload as any).addonIds)
        ? (payload as any).addonIds.map((id: unknown) => String(id ?? '').trim()).filter(Boolean)
        : [],
      manualExtras: Array.isArray((payload as any).manualExtras)
        ? (payload as any).manualExtras.map((extra: any) => ({
            label: String(extra?.title ?? '').trim(),
            amount: Math.max(0, Number(extra?.price ?? 0) || 0),
            perPerson: String(extra?.scope ?? 'per_booking') === 'per_person',
          }))
        : [],
      seatLayoutTemplate: seatLayoutTemplateForExtras,
    });
    const repriced = computeReservationPricing(paquete, payload.date, {
      people,
      peopleAdults,
      peopleMinors,
      depositPercentAdults,
      depositPercentMinors,
      selectedExtras,
    });

    const referredBy = await resolveReservationReferralAssignment({
      packageId: paquete.id,
      amountTotal: repriced.subtotalAmount,
      people,
      status: payload.status ?? 'reserved',
      vendorId: payload.vendorId,
      referralCode: payload.referralCode,
      hasConfirmedPayment: (payload.status ?? 'reserved') === 'reserved' || payload.status === 'completed',
    });

    // El código se reserva en su propia transacción ANTES: así la transacción
    // principal solo hace sus lecturas primero y después sus escrituras
    // (Firestore exige reads antes de writes).
    let reservationCode: string;
    try {
      reservationCode = await reserveNextReservationCode();
    } catch (error) {
      return NextResponse.json(
        { error: 'No se pudo generar el código de reserva', detail: getErrorMessage(error) },
        { status: 500 }
      );
    }

    const now = Timestamp.now();
    const status = payload.status ?? 'reserved';
    const packageOperationsDoc = await adminDb?.collection('packageOperations').doc(paquete.id).get();
    const operationInput = { ...(payload.operations ?? { ...EMPTY_RESERVATION_OPERATIONS }), serviceExecuted: status === 'completed', automaticEmails: true };
    const operations = await snapshotOperations(operationInput, packageOperationsDoc?.data() as PackageOperations | undefined);
    if (payload.initialPayment?.amount !== undefined && payload.initialPayment.amount > repriced.subtotalAmount) return NextResponse.json({ error: 'El cobro inicial no puede superar el total de la reserva' }, { status: 400 });
    const reservaRef = payload.requestId ? doc(db, COLLECTION, payload.requestId) : doc(collection(db, COLLECTION));
    const seatsNeeded = Boolean(seatsEnabled && seatLayoutId && payload.date !== 'sin-fecha');
    const departureId = getSeatDepartureId(paquete.id, payload.date);
    const seatResRef = doc(db, 'seatReservations', departureId);

    try {
      await runTransaction(db, async (tx) => {
        // Todas las lecturas primero.
        const existingRequest = await tx.get(reservaRef);
        if (existingRequest.exists()) {
          if (existingRequest.data().createdByEmail !== ctx.email) throw new Error('La solicitud ya fue utilizada');
          return;
        }
        const templateSnap = seatsNeeded ? await tx.get(doc(db, 'seatLayouts', seatLayoutId)) : null;
        const seatResSnap = seatsNeeded ? await tx.get(seatResRef) : null;

        if (seatsNeeded) {
          if (!templateSnap?.exists()) {
            throw new Error('Plantilla de micro no encontrada.');
          }
          const template = { id: templateSnap.id, ...(templateSnap.data() as any) } as SeatLayoutTemplate;
          const baseSeats = buildBaseSeatReservationSeats(template);
          const seatResData: any = seatResSnap?.exists() ? seatResSnap.data() : null;
          const currentLayoutId = seatResData ? String(seatResData?.seatLayoutId ?? '') : '';
          const seatsMap: Record<string, any> =
            seatResSnap?.exists() && currentLayoutId === seatLayoutId
              ? { ...(seatResData?.seats ?? {}) }
              : { ...baseSeats };

          if (!seatResSnap?.exists() || currentLayoutId !== seatLayoutId) {
            tx.set(
              seatResRef,
              {
                packageId: paquete.id,
                date: payload.date,
                seatLayoutId,
                seats: seatsMap,
                createdAt: now,
                updatedAt: now,
              },
              { merge: true }
            );
          }

          const seatIds = seatIdsFromLabels(template, selectedSeats);
          if (seatIds.length !== selectedSeats.length) throw new Error('Una o más butacas no existen en la plantilla.');

          for (const seatId of seatIds) {
            const current = seatsMap[seatId] ?? baseSeats[seatId];
            if (!current) throw new Error('Una o más butacas no existen en la plantilla.');
            const s = String(current.status ?? 'available') as SeatStatus;
            if (s !== 'available') throw new Error('Una o más butacas no están disponibles.');
          }

          const seatTargetStatus: SeatStatus = status === 'completed' ? 'paid' : 'reserved';
          for (const seatId of seatIds) {
            seatsMap[seatId] = {
              status: seatTargetStatus,
              holdId: null,
              cartId: null,
              cartItemId: null,
              orderId: null,
              reservationId: reservaRef.id,
              expiresAt: null,
              blockedBy: null,
              updatedAt: now,
            };
          }
          tx.set(seatResRef, { seats: seatsMap, updatedAt: now }, { merge: true });
        }

        const attachments =
          payload.attachments?.map((attachment) => ({
            id: randomUUID(),
            name: attachment.name,
            type: attachment.type,
            url: attachment.url,
            uploadedBy: attachment.uploadedBy ?? 'admin',
            key: attachment.key,
            createdAt: now,
          })) ?? [];

        const customerEmailLower = normalizeEmail(payload.customerEmail);
        const customerNameLower = String(payload.customerName ?? '').trim().toLowerCase() || null;
        const customerPhoneNormalized = normalizeDigits(payload.customerPhone);
        const customerDocumentNormalized = normalizeDigits(payload.customerDocument);

        tx.set(reservaRef, {
          operations,
          paymentTrackingVersion: 1,
          packageId: paquete.id,
          packageSlug: paquete.slug,
          packageTitle: paquete.titulo,
          experienceId: paquete.id,
          experienceSlug: paquete.slug,
          experienceTitle: paquete.titulo,
          date: payload.date,
          people,
          peopleAdults,
          peopleMinors,
          seatLayoutId: seatsEnabled ? seatLayoutId : null,
          selectedSeats: seatsEnabled ? (selectedSeats.length ? selectedSeats : null) : null,
          pricingMode: computedPricing.pricingMode,
          pricingBaseUnitAmount: repriced.baseUnitAmount,
          unitAmountAdults: repriced.unitAmountAdults,
          unitAmountMinors: repriced.unitAmountMinors,
          depositPercentAdults: repriced.depositPercentAdults,
          depositPercentMinors: repriced.depositPercentMinors,
          baseSubtotalAmount: repriced.baseSubtotalAmount,
          extrasTotalAmount: repriced.extrasTotalAmount,
          selectedExtras: selectedExtras.length ? selectedExtras : null,
          amountTotal: repriced.subtotalAmount,
          currency,
          paymentMethod: 'admin',
          customerEmail: payload.customerEmail,
          customerEmailLower,
          customerName: payload.customerName,
          customerNameLower,
          customerPhone: payload.customerPhone ?? null,
          customerPhoneNormalized,
          customerCountry: payload.customerCountry ?? null,
          customerDocument: payload.customerDocument ?? null,
          customerDocumentNormalized,
          customerBirthDate: payload.customerBirthDate ?? null,
          customerComments: payload.customerComments ?? null,
          passengerDetails: payload.passengerDetails ?? [],
          reservationCode,
          attachments: attachments.length ? attachments : [],
          status,
          createdByAdmin: true,
          createdByEmail: ctx.email,
          ...(isVendor && ctx.vendor ? { createdByVendorId: ctx.vendor.id } : {}),
          pricingSnapshot: buildReservationPricingSnapshot({
            unitAmount: repriced.subtotalAmount > 0 && people > 0 ? Math.round(repriced.subtotalAmount / people) : unitAmount,
            people,
            amountTotal: repriced.subtotalAmount,
            baseSubtotalAmount: repriced.baseSubtotalAmount,
            extrasTotalAmount: repriced.extrasTotalAmount,
            currency,
            paymentMethod: 'admin',
          }),
          capacitySnapshot: {
            date: payload.date,
            maxPeoplePerBooking: departureConfig.maxPeople,
            hasSpecificDates: Boolean(paquete.salidas?.length),
            enabled: departureConfig.enabled,
          },
          experienceSnapshot: {
            id: paquete.id,
            slug: paquete.slug,
            title: paquete.titulo,
          },
          packageSnapshot: {
            id: paquete.id,
            slug: paquete.slug,
            title: paquete.titulo,
          },
          statusHistory: [
            {
              status,
              actor: isVendor ? 'vendor' : 'admin',
              note: payload.statusNote ?? 'Reserva creada',
              createdAt: now,
            },
          ],
          paidAt: status === 'completed' && payload.initialPayment?.method !== 'pending' && (payload.initialPayment?.amount ?? repriced.subtotalAmount) >= repriced.subtotalAmount ? now : null,
          voucherSent: false,
          voucherSentAt: null,
          emailDelivery: buildDefaultEmailDelivery(),
          createdAt: now,
          updatedAt: now,
          ...(referredBy ? { referredBy } : {}),
        });

        if ((status === 'reserved' || status === 'completed') && payload.initialPayment?.method !== 'pending' && (payload.initialPayment?.amount ?? repriced.subtotalAmount) > 0) {
          const paymentRef = doc(collection(db, COLLECTION, reservaRef.id, 'payments'), `admin_${reservaRef.id}`);
          tx.set(
            paymentRef,
            {
              method: payload.initialPayment?.method ?? 'admin',
              collectedBy: collectorForPayment(operations.sellerHotelId, payload.initialPayment?.method ?? 'admin'),
              status: 'paid',
              amount: payload.initialPayment?.amount ?? repriced.subtotalAmount,
              currency,
              message: payload.statusNote ?? (isVendor ? 'Reserva cargada por vendedor' : 'Pago registrado por admin'),
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
        }
      });
    } catch (error) {
      return NextResponse.json(
        { error: 'No se pudo guardar la reserva', detail: getErrorMessage(error) },
        { status: 400 }
      );
    }

    let notificationWarning: string | undefined;
    try { await prepareReservationOperations(reservaRef.id, true); } catch (error) { console.error('[reservas] preparación de avisos:', error); notificationWarning = 'La reserva se guardó, pero no se pudieron preparar todos los avisos automáticos.'; }
    return NextResponse.json({ id: reservaRef.id, notificationWarning });
  } catch (error) {
    console.error('[admin/reservas] Error guardando reserva manual:', error);
    return NextResponse.json(
      { error: 'No se pudo guardar la reserva', detail: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function patchReservaCore(request: Request, ctx: ReservaActorContext) {
  const adminUser = { email: ctx.email };

  let payload: z.infer<typeof adminUpdateSchema>;
  try {
    payload = adminUpdateSchema.parse(await request.json());
  } catch (error) {
    console.error('[admin/reservas] Error parseando PATCH:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors.map((item) => item.message).join(', ') },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const reservation = await getReservaById(payload.reservationId);
  if (!reservation) {
    return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
  }

  try {
    if (payload.status && payload.status !== reservation.status) {
      const hasSeats = Array.isArray((reservation as any).selectedSeats) && (reservation as any).selectedSeats.length > 0;
      const seatLayoutId = (reservation as any).seatLayoutId ? String((reservation as any).seatLayoutId) : '';
      const shouldTouchSeats = hasSeats && seatLayoutId && reservation.date && reservation.date !== 'sin-fecha';
      if (shouldTouchSeats) {
        const paquete = await getPaqueteById(reservation.packageId ?? reservation.experienceId);
        const seatsEnabled = paquete ? resolveDepartureConfig(paquete, reservation.date).seatsEnabled : false;
        if (seatsEnabled) {
          const selectedSeatLabels = (reservation as any).selectedSeats.map((s: any) => String(s));
          const nextSeatStatus: SeatStatus = payload.status === 'completed' ? 'paid' : payload.status === 'cancelled' ? 'available' : 'reserved';
          const seatDepartureId = getSeatDepartureId(String(reservation.packageId ?? reservation.experienceId), reservation.date);
          const seatResRef = doc(db, 'seatReservations', seatDepartureId);
          const templateRef = doc(db, 'seatLayouts', seatLayoutId);
          try {
            await runTransaction(db, async (tx) => {
              const templateSnap = await tx.get(templateRef);
              if (!templateSnap.exists()) throw new Error('Plantilla de micro no encontrada.');
              const template = { id: templateSnap.id, ...(templateSnap.data() as any) } as SeatLayoutTemplate;
              const seatIds = seatIdsFromLabels(template, selectedSeatLabels);
              if (seatIds.length !== selectedSeatLabels.length) throw new Error('Una o más butacas no existen en la plantilla.');

              const seatResSnap = await tx.get(seatResRef);
              if (!seatResSnap.exists()) throw new Error('No se encontró el mapa de butacas para esta salida.');
              const seatResData: any = seatResSnap.data();
              const seatsMap: Record<string, any> = { ...(seatResData?.seats ?? {}) };

              if (payload.status !== 'cancelled') {
                for (const seatId of seatIds) {
                  const seat = seatsMap[seatId];
                  if (!seat) throw new Error('Una o más butacas no existen en la salida.');
                  const s = String(seat.status ?? 'available') as SeatStatus;
                  if (s === 'available') continue;
                  if (String(seat.reservationId ?? '') === reservation.id) continue;
                  throw new Error('Una o más butacas ya no están disponibles.');
                }
              }

              for (const seatId of seatIds) {
                const seat = seatsMap[seatId];
                if (!seat) continue;
                if (payload.status === 'cancelled') {
                  if (String(seat.reservationId ?? '') !== reservation.id) continue;
                  seatsMap[seatId] = { status: 'available', holdId: null, cartId: null, cartItemId: null, orderId: null, reservationId: null, expiresAt: null, blockedBy: null, updatedAt: Timestamp.now() };
                } else {
                  seatsMap[seatId] = { status: nextSeatStatus, holdId: null, cartId: null, cartItemId: null, orderId: (reservation as any).orderId ?? null, reservationId: reservation.id, expiresAt: null, blockedBy: null, updatedAt: Timestamp.now() };
                }
              }

              tx.set(seatResRef, { seats: seatsMap, updatedAt: Timestamp.now() }, { merge: true });
            });
          } catch (error) {
            return NextResponse.json(
              { error: getErrorMessage(error, 'No se pudo actualizar butacas') },
              { status: 400 }
            );
          }
        }
      }

      await updateReservaStatus(payload.reservationId, payload.status, {
        note: payload.note,
      });
      if (payload.status === 'completed' || payload.status === 'cancelled') {
        const voucherJobId = String((reservation as any).emailDelivery?.customerVoucher?.jobId ?? '');
        if (voucherJobId) {
          const voucherJobRef = doc(db, 'emailJobs', voucherJobId);
          const voucherJob = await getDoc(voucherJobRef).catch(() => null);
          const now = Timestamp.now();
          if (voucherJob?.exists() && voucherJob.data()?.status !== 'sent') {
            const reason = `La reserva cambió a ${payload.status}; se canceló el voucher pendiente.`;
            await updateDoc(voucherJobRef, { status: 'cancelled', lastError: reason, updatedAt: now }).catch(() => null);
            await updateDoc(doc(db, COLLECTION, payload.reservationId), {
              'emailDelivery.customerVoucher.status': 'cancelled',
              'emailDelivery.customerVoucher.error': reason,
              voucherScheduledAt: null,
              updatedAt: now,
            }).catch(() => null);
          }
        }
      }
      if (payload.status === 'completed' || payload.status === 'cancelled') {
        const payoutStatus = nextPayoutStatusForReservationStatus(payload.status);
        await updateDoc(doc(db, COLLECTION, payload.reservationId), {
          'referredBy.payoutStatus': payoutStatus,
          ...(payload.status === 'completed' ? { 'operations.serviceExecuted': true } : {}),
          updatedAt: Timestamp.now(),
        }).catch(() => null);
      }
    }
    if (payload.date && payload.date !== reservation.date) {
      const paquete = await getPaqueteById(reservation.packageId ?? reservation.experienceId);
      if (!paquete) {
        return NextResponse.json({ error: 'Paquete no encontrado' }, { status: 404 });
      }
      if (!isEnabledDate(paquete, payload.date)) {
        return NextResponse.json({ error: 'La nueva fecha no está habilitada para este paquete.' }, { status: 400 });
      }
      const historyEntry = {
        status: reservation.status,
        actor: 'admin' as const,
        note: payload.note ?? `Reprogramada a ${payload.date}`,
        createdAt: Timestamp.now(),
      };
      await updateDoc(doc(db, COLLECTION, payload.reservationId), {
        date: payload.date,
        updatedAt: Timestamp.now(),
        statusHistory: arrayUnion(historyEntry),
        capacitySnapshot: {
          date: payload.date,
          maxPeoplePerBooking: typeof paquete.bookingConfig?.maxPeoplePerBooking === 'number' ? paquete.bookingConfig.maxPeoplePerBooking : null,
          hasSpecificDates: Boolean(paquete.bookingConfig?.hasSpecificDates),
          enabled: paquete.bookingConfig?.enabled !== false,
        },
      });

      const paidAt = (reservation as any).paidAt;
      const voucherAlreadySent = Boolean((reservation as any).voucherSent);
      const customerEmail = String((reservation as any).customerEmail ?? '').trim();
      const resultingReservationStatus = payload.status ?? reservation.status;
      const now = Timestamp.now();
      const existingJobId = String((reservation as any).emailDelivery?.customerVoucher?.jobId ?? '');
      const shouldManageVoucher = Boolean(customerEmail && (paidAt || existingJobId));
      if (shouldManageVoucher) {
        const schedule = calculateVoucherReminderSchedule({
          date: payload.date,
          departureTime: (reservation as any).operations?.pickupTime || (reservation as any).departureTime,
          timeZone: (reservation as any).timeZone ?? (reservation as any).timezone,
          nowMs: now.toMillis(),
        });
        const previousJobRef = existingJobId ? doc(db, 'emailJobs', existingJobId) : null;
        const previousJob = previousJobRef ? await getDoc(previousJobRef).catch(() => null) : null;
        const previousWasSent = voucherAlreadySent || previousJob?.data()?.status === 'sent';

        if (schedule.kind === 'scheduled' && resultingReservationStatus === 'reserved') {
          const nextAttemptAt = Timestamp.fromMillis(schedule.nextAttemptAtMs);
          const jobId = previousWasSent
            ? `${payload.reservationId}_cliente_voucher_48hs_${schedule.departureAtMs}`
            : existingJobId || `${payload.reservationId}_cliente_voucher`;
          await enqueueReservationEmailJob({
            reservationId: payload.reservationId,
            type: 'cliente_voucher_48hs',
            nextAttemptAt,
            jobId,
            scheduledDepartureAtMs: schedule.departureAtMs,
          });
          await updateDoc(doc(db, COLLECTION, payload.reservationId), {
            voucherScheduledAt: nextAttemptAt,
            voucherSent: false,
            voucherSentAt: null,
            updatedAt: now,
          }).catch(() => null);
        } else {
          const reason = schedule.kind === 'skipped'
            ? schedule.reason === 'departure_already_passed'
              ? 'La salida ya ocurrió; se canceló el recordatorio vencido.'
              : 'No hay una fecha y hora de salida válidas para programar el voucher.'
            : 'La reserva ya no está activa.';
          if (previousJobRef && previousJob?.data()?.status !== 'sent') {
            await updateDoc(previousJobRef, { status: 'cancelled', lastError: reason, updatedAt: now }).catch(() => null);
          }
          await updateDoc(doc(db, COLLECTION, payload.reservationId), {
            voucherScheduledAt: null,
            voucherSent: false,
            voucherSentAt: null,
            'emailDelivery.customerVoucher.status': 'cancelled',
            'emailDelivery.customerVoucher.error': reason,
            updatedAt: now,
          }).catch(() => null);
        }
      }
    }
    if (payload.updateCustomer) {
      const customer = payload.updateCustomer;
      const customerEmail = normalizeEmail(customer.customerEmail) ?? customer.customerEmail.trim().toLowerCase();
      const customerName = customer.customerName.trim();
      const now = Timestamp.now();
      await updateDoc(doc(db, COLLECTION, payload.reservationId), {
        customerName,
        customerNameLower: customerName.toLowerCase(),
        customerEmail,
        customerEmailLower: customerEmail,
        customerPhone: customer.customerPhone?.trim() ?? '',
        customerPhoneNormalized: normalizeDigits(customer.customerPhone),
        customerCountry: customer.customerCountry?.trim() ?? '',
        customerDocument: customer.customerDocument?.trim() ?? '',
        customerDocumentNormalized: normalizeDigits(customer.customerDocument),
        customerBirthDate: customer.customerBirthDate?.trim() ?? '',
        customerComments: customer.customerComments?.trim() ?? '',
        ...(customer.passengerDetails ? { passengerDetails: customer.passengerDetails } : {}),
        updatedAt: now,
        statusHistory: arrayUnion({
          status: reservation.status,
          actor: 'admin',
          note: 'Datos del cliente y pasajeros actualizados en esta reserva.',
          createdAt: now,
        }),
      });
    }
    if (payload.attachments?.length) {
      await addReservaAttachments(payload.reservationId, payload.attachments);
    }
    if (payload.removeAttachments?.length) {
      await removeReservaAttachmentsById(
        payload.reservationId,
        payload.removeAttachments.map((item) => item.id)
      );
    }

    if (payload.clearReferredBy) {
      await updateDoc(doc(db, COLLECTION, payload.reservationId), {
        referredBy: null,
        updatedAt: Timestamp.now(),
      });
    } else if (payload.vendorId || payload.referralCode) {
      const referredBy = await resolveReservationReferralAssignment({
        packageId: String(reservation.packageId ?? reservation.experienceId ?? ''),
        amountTotal: reservation.amountTotal ?? 0,
        people: reservation.people ?? 0,
        status: payload.status ?? reservation.status,
        vendorId: payload.vendorId,
        referralCode: payload.referralCode,
        existingPayoutStatus: (reservation as any).referredBy?.payoutStatus,
        hasConfirmedPayment: await reservationHasConfirmedPayment(payload.reservationId),
      });

      if (referredBy) {
        await updateDoc(doc(db, COLLECTION, payload.reservationId), {
          referredBy,
          updatedAt: Timestamp.now(),
        });
      }
    }

    if (payload.addPaymentEvent) {
      const now = Timestamp.now();
      const movement = payload.addPaymentEvent;
      const paymentRef = doc(collection(db, COLLECTION, payload.reservationId, 'payments'), `manual_${randomUUID()}`);
      const occurredAt = movement.occurredAt
        ? Timestamp.fromDate(new Date(movement.occurredAt))
        : now;

      if (!adminDb) throw new Error('Firebase Admin no está configurado');
      const movementCurrency = String(movement.currency || reservation.currency || 'ars').toLowerCase();
      if (movementCurrency !== String(reservation.currency).toLowerCase()) return NextResponse.json({ error: 'La moneda del movimiento debe coincidir con la reserva' }, { status: 400 });
      const movementData = {
        method: normalizePaymentMovementMethod(movement.method, movement.movementType),
        movementType: movement.movementType,
        source: 'manual',
        status: normalizePaymentMovementStatus(movement.movementType),
        amount: movement.amount,
        currency: movementCurrency,
        message: movement.message,
        reference: movement.reference?.trim() || null,
        recordedBy: adminUser?.email ?? 'admin',
        occurredAt: occurredAt.toDate(),
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
      };
      const privateDb = adminDb;
      await privateDb.runTransaction(async (tx) => {
        const ref = privateDb.collection('reservas').doc(payload.reservationId);
        const current = await tx.get(ref);
        const prior = movement.movementType === 'refund' ? await tx.get(ref.collection('payments')) : null;
        if (!current.exists) throw new Error('La reserva no existe');
        if (occurredAt.toMillis() > Date.now() + 60000) throw new Error('No se puede registrar un movimiento futuro');
        const collector = ['payment', 'refund'].includes(movement.movementType)
          ? collectorForPayment(String(current.data()?.operations?.sellerHotelId ?? ''), movementData.method)
          : undefined;
        if (prior) {
          const sellerHotelId = String(current.data()?.operations?.sellerHotelId ?? '');
          const collectorPaid = prior.docs.map((d) => d.data() as PaymentRecord).filter((p) => collectorForPayment(sellerHotelId, p.method) === collector && String(p.currency ?? movementCurrency).toLowerCase() === movementCurrency).reduce((sum, p) => sum + signedPayment(p), 0);
          if (movement.amount > collectorPaid) throw new Error(collector === 'hotel' ? 'El reintegro supera lo que recibió el hotel' : 'La devolución supera lo cobrado por Baftravel');
        }
        tx.create(ref.collection('payments').doc(paymentRef.id), { ...movementData, ...(collector ? { collectedBy: collector } : {}) });
        tx.update(ref, { financeVersion: (Number(current.data()?.financeVersion) || 0) + 1 });
      });

      await updateDoc(doc(db, COLLECTION, payload.reservationId), {
        updatedAt: now,
        statusHistory: arrayUnion({
          status: reservation.status,
          actor: 'admin',
          note: `Movimiento financiero registrado: ${movement.message}`,
          createdAt: now,
        }),
      }).catch(() => null);
    }

    if (payload.correctPaymentEvent) {
      if (!adminDb) throw new Error('Firebase Admin no está configurado');
      const correction = payload.correctPaymentEvent;
      const privateDb = adminDb;
      const reservationRef = privateDb.collection(COLLECTION).doc(payload.reservationId);
      const paymentCollection = reservationRef.collection('payments');
      const originalRef = paymentCollection.doc(correction.paymentId);
      const replacementRef = paymentCollection.doc(`manual_${randomUUID()}`);
      const now = Timestamp.now();
      const method = normalizePaymentMovementMethod(correction.method, correction.movementType);
      const currency = String(reservation.currency || 'ars').toLowerCase();
      await privateDb.runTransaction(async (tx) => {
        const reservationSnap = await tx.get(reservationRef);
        const originalSnap = await tx.get(originalRef);
        const paymentSnap = await tx.get(paymentCollection);
        if (!reservationSnap.exists || !originalSnap.exists) throw new Error('No se encontró el movimiento que querés corregir.');
        const original = originalSnap.data() ?? {};
        if (original.source !== 'manual' && !(original.source == null && original.recordedBy)) {
          throw new Error('Solo se pueden corregir movimientos registrados manualmente.');
        }
        if (String(original.status ?? '').toLowerCase() === 'voided' || original.correctedBy) {
          throw new Error('Este movimiento ya fue corregido.');
        }
        if (String(original.movementType ?? '') === 'extra' && original.includedInTotal === true) {
          throw new Error('Editá o quitá este adicional desde el detalle de la venta.');
        }
        if (String(original.movementType ?? 'payment') === 'payment' && correction.movementType === 'refund') {
          throw new Error('Un reintegro es un movimiento nuevo; agregalo como “Reintegro” en lugar de convertir un cobro.');
        }
        if (String(original.currency ?? currency).toLowerCase() !== currency) {
          throw new Error('La moneda del movimiento debe coincidir con la reserva.');
        }
        const reservationData = reservationSnap.data() ?? {};
        const sellerHotelId = String(reservationData.operations?.sellerHotelId ?? '');
        const collector = ['payment', 'refund'].includes(correction.movementType)
          ? collectorForPayment(sellerHotelId, method)
          : undefined;
        if (correction.movementType === 'refund') {
          const alreadyCollected = paymentSnap.docs
            .filter((entry) => entry.id !== originalSnap.id && String(entry.data().status ?? '').toLowerCase() !== 'voided')
            .map((entry) => entry.data() as PaymentRecord)
            .filter((entry) => collectorForPayment(sellerHotelId, entry.method) === collector && String(entry.currency ?? currency).toLowerCase() === currency)
            .reduce((sum, entry) => sum + signedPayment(entry), 0);
          if (correction.amount > alreadyCollected) {
            throw new Error(collector === 'hotel' ? 'El reintegro supera lo que recibió el hotel.' : 'La devolución supera lo cobrado por Baftravel.');
          }
        }
        const occurredAt = correction.occurredAt
          ? Timestamp.fromDate(new Date(correction.occurredAt)).toDate()
          : original.occurredAt ?? now.toDate();
        if (occurredAt instanceof Date && occurredAt.getTime() > Date.now() + 60000) throw new Error('No se puede registrar un movimiento futuro.');
        const nextMovement = {
          method,
          movementType: correction.movementType,
          source: 'manual',
          status: normalizePaymentMovementStatus(correction.movementType),
          amount: correction.amount,
          currency,
          message: correction.message,
          reference: correction.reference?.trim() || null,
          recordedBy: adminUser.email,
          occurredAt,
          createdAt: now.toDate(),
          updatedAt: now.toDate(),
          correctsPaymentId: correction.paymentId,
          correctionReason: correction.reason,
          ...(original.includedInTotal === true ? { includedInTotal: true } : {}),
          ...(original.extraId ? { extraId: original.extraId } : {}),
          ...(collector ? { collectedBy: collector } : {}),
        };
        tx.update(originalRef, {
          status: 'voided',
          correctedBy: replacementRef.id,
          correctionReason: correction.reason,
          correctedAt: now.toDate(),
          updatedAt: now.toDate(),
        });
        tx.create(replacementRef, nextMovement);
        const history = Array.isArray(reservationData.statusHistory) ? reservationData.statusHistory : [];
        tx.update(reservationRef, {
          financeVersion: (Number(reservationData.financeVersion) || 0) + 1,
          updatedAt: now.toDate(),
          statusHistory: [...history, {
            status: String(reservationData.status ?? 'reserved'),
            actor: 'admin',
            note: `Movimiento financiero corregido: ${correction.reason}`,
            createdAt: now.toDate(),
          }],
        });
      });
    }

    if (payload.updateAddonExtra || payload.removeAddonExtra) {
      if (!adminDb) throw new Error('Firebase Admin no está configurado');
      const privateDb = adminDb;
      const reservationRef = privateDb.collection(COLLECTION).doc(payload.reservationId);
      const edit = payload.updateAddonExtra ?? payload.removeAddonExtra!;
      const now = Timestamp.now();
      const paymentsRef = reservationRef.collection('payments');
      await privateDb.runTransaction(async (tx) => {
        const snapshot = await tx.get(reservationRef);
        const paymentSnapshot = await tx.get(paymentsRef);
        if (!snapshot.exists) throw new Error('La reserva no existe.');
        const current = snapshot.data() ?? {};
        const currentExtras = Array.isArray(current.selectedExtras) ? current.selectedExtras as Array<Record<string, unknown>> : [];
        const selected = currentExtras[edit.index];
        if (!selected || String(selected.label ?? '').trim() !== edit.expectedLabel || Number(selected.amount ?? 0) !== edit.expectedAmount) {
          throw new Error('Los adicionales cambiaron desde que abriste esta venta. Actualizá la página e intentá de nuevo.');
        }
        const nextExtras = [...currentExtras];
        const extraId = String(selected.id ?? randomUUID());
        const matchingExtraMovement = paymentSnapshot.docs.find((entry) => {
          const movement = entry.data();
          if (movement.source !== 'manual' || movement.movementType !== 'extra' || movement.includedInTotal !== true || String(movement.status ?? '').toLowerCase() === 'voided' || Number(movement.amount ?? 0) !== Number(selected.amount ?? 0)) return false;
          if (selected.id) return movement.extraId === selected.id;
          return !movement.extraId && String(movement.message ?? '') === `Adicional sumado: ${String(selected.label ?? '')}`;
        });
        let historyNote = '';
        if (payload.updateAddonExtra) {
          const update = payload.updateAddonExtra;
          const previousAmount = Number(selected.amount ?? 0) || 0;
          nextExtras[update.index] = { ...selected, id: extraId, label: update.title, amount: update.amount, scope: update.scope };
          historyNote = `Adicional editado: ${String(selected.label)} → ${update.title} (${previousAmount} → ${update.amount} centavos).`;
        } else {
          const removed = nextExtras.splice(edit.index, 1)[0];
          historyNote = `Adicional eliminado: ${String(removed?.label ?? 'Adicional')} (${Number(removed?.amount ?? 0)} centavos).`;
        }
        const previousAmount = Number(selected.amount ?? 0) || 0;
        const nextAmount = payload.updateAddonExtra ? payload.updateAddonExtra.amount : 0;
        const delta = nextAmount - previousAmount;
        const replacementMovementRef = matchingExtraMovement && payload.updateAddonExtra
          ? paymentsRef.doc(`manual_${randomUUID()}`)
          : null;
        if (matchingExtraMovement) {
          tx.update(matchingExtraMovement.ref, {
            status: 'voided',
            ...(replacementMovementRef ? { correctedBy: replacementMovementRef.id } : {}),
            correctionReason: historyNote,
            correctedAt: now.toDate(),
            updatedAt: now.toDate(),
          });
        }
        if (replacementMovementRef && payload.updateAddonExtra && matchingExtraMovement) {
          const currentCurrency = String(current.currency ?? 'ars').toLowerCase();
          tx.create(replacementMovementRef, {
            extraId,
            method: 'admin',
            movementType: 'extra',
            source: 'manual',
            status: 'recorded',
            amount: payload.updateAddonExtra.amount,
            currency: currentCurrency,
            message: `Adicional actualizado: ${payload.updateAddonExtra.title}`,
            includedInTotal: true,
            reference: null,
            recordedBy: adminUser.email,
            occurredAt: now.toDate(),
            createdAt: now.toDate(),
            updatedAt: now.toDate(),
            correctsPaymentId: matchingExtraMovement.id,
            correctionReason: historyNote,
          });
        }
        const history = Array.isArray(current.statusHistory) ? current.statusHistory : [];
        tx.update(reservationRef, {
          selectedExtras: nextExtras,
          amountTotal: Math.max(0, (Number(current.amountTotal) || 0) + delta),
          extrasTotalAmount: nextExtras.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
          financeVersion: (Number(current.financeVersion) || 0) + 1,
          updatedAt: now.toDate(),
          statusHistory: [...history, {
            status: String(current.status ?? 'reserved'),
            actor: 'admin',
            note: historyNote,
            createdAt: now.toDate(),
          }],
        });
      });
    }

    if (payload.addAddonExtra) {
      // Sumar un adicional a una venta creada: se agrega a selectedExtras y
      // se recalcula amountTotal para que el detalle muestre el nuevo total.
      const title = String(payload.addAddonExtra.title ?? '').trim().slice(0, 120);
      const price = Math.max(0, Number(payload.addAddonExtra.price ?? 0) || 0);
      const perPerson = String(payload.addAddonExtra.scope ?? 'per_booking') === 'per_person';
      if (!title || price <= 0) {
        return NextResponse.json({ error: 'Adicional inválido.' }, { status: 400 });
      }
      if (!adminDb) throw new Error('Firebase Admin no está configurado');
      const privateDb = adminDb;
      const reservationRef = privateDb.collection(COLLECTION).doc(payload.reservationId);
      const paymentRef = reservationRef.collection('payments').doc(`manual_${randomUUID()}`);
      const extraId = randomUUID();
      const nowAddon = Timestamp.now();
      await privateDb.runTransaction(async (tx) => {
        const snapshot = await tx.get(reservationRef);
        if (!snapshot.exists) throw new Error('La reserva no existe.');
        const current = snapshot.data() ?? {};
        const peopleCount = Math.max(1, Number(current.people ?? 1) || 1);
        const extraInCents = Math.round(price * 100) * (perPerson ? peopleCount : 1);
        const currentExtras = Array.isArray(current.selectedExtras) ? current.selectedExtras as Array<Record<string, unknown>> : [];
        const nextExtras = [...currentExtras, {
          id: extraId,
          code: 'manualExtra',
          label: title,
          amount: extraInCents,
          source: 'manualExtra',
          scope: perPerson ? 'per_person' : 'per_booking',
        }];
        const history = Array.isArray(current.statusHistory) ? current.statusHistory : [];
        const currency = String(current.currency || 'ars').toLowerCase();
        tx.update(reservationRef, {
          selectedExtras: nextExtras,
          amountTotal: Math.max(0, Number(current.amountTotal ?? 0) || 0) + extraInCents,
          extrasTotalAmount: nextExtras.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
          financeVersion: (Number(current.financeVersion) || 0) + 1,
          updatedAt: nowAddon.toDate(),
          statusHistory: [...history, {
            status: String(current.status ?? 'reserved'),
            actor: 'admin',
            note: `Adicional sumado: ${title}`,
            createdAt: nowAddon.toDate(),
          }],
        });
        tx.create(paymentRef, {
          extraId,
          method: 'admin',
          movementType: 'extra',
          source: 'manual',
          status: 'recorded',
          amount: extraInCents,
          currency,
          message: `Adicional sumado: ${title}`,
          includedInTotal: true,
          reference: null,
          recordedBy: adminUser.email,
          occurredAt: nowAddon.toDate(),
          createdAt: nowAddon.toDate(),
          updatedAt: nowAddon.toDate(),
        });
      });
    }

    // La comisión siempre refleja el estado actual de la venta y sus pagos.
    await syncReservationPayoutStatus(payload.reservationId).catch(() => null);
    await prepareReservationOperations(payload.reservationId, true).catch((error) => console.error('[reservas] preparación de avisos:', error));

    const emailResults: Array<{ type: string; sent: boolean; deferred?: boolean; error?: string }> = [];
    const queueEmail = async (type: 'cliente_voucher_48hs' | 'admin_aviso') => {
      const jobId = await enqueueReservationEmailJob({ reservationId: payload.reservationId, type });
      if (!payload.sendEmailNow) {
        emailResults.push({ type, sent: false });
        return;
      }
      const result = await sendEmailJobNow(jobId);
      if (!result.ok) emailResults.push({ type, sent: false, error: result.error });
      else if ('deferred' in result && result.deferred) emailResults.push({ type, sent: false, deferred: true });
      else emailResults.push({ type, sent: true });
    };

    if (payload.enqueueCustomerVoucherEmail) await queueEmail('cliente_voucher_48hs');
    if (payload.enqueueAdminNotificationEmail) await queueEmail('admin_aviso');

    const emailError = emailResults.find((r) => r.error);
    if (emailError) {
      return NextResponse.json(
        { error: `No se pudo enviar el email: ${emailError.error}`, emails: emailResults },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, emails: emailResults });
  } catch (error) {
    console.error('[admin/reservas] Error actualizando reserva:', error);
    return NextResponse.json({ error: 'No se pudo actualizar la reserva' }, { status: 500 });
  }
}
