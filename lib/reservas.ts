import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy as firestoreOrderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
} from 'firebase/firestore';

import { randomUUID } from 'crypto';
import { db } from '@/lib/firebase';
import { deleteBlobAsset } from '@/lib/blob';
import {
  normalizeDigits,
  normalizeEmail,
  reserveNextReservationCode,
} from '@/lib/reservas/code';
import { serializeFirestoreData } from '@/lib/utils/serialize';
import type {
  Reservation,
  ReservationAttachment,
  ReservationHistoryItem,
  ReservationStatus,
} from '@/components/landing-reserva/types';

const COLLECTION = 'reservas';

export type ReservationAttachmentInput = Omit<ReservationAttachment, 'id' | 'createdAt'>;
export type CreateReservaPayload = Omit<
  Reservation,
  'id' | 'createdAt' | 'updatedAt' | 'statusHistory' | 'attachments'
> & {
  attachments?: ReservationAttachmentInput[];
  historyNote?: string;
};

function mapDocToReservation(docSnap: DocumentSnapshot): Reservation | null {
  const data = docSnap.data();
  if (!data) return null;
  return serializeFirestoreData<Reservation>({ id: docSnap.id, ...data });
}

function buildAttachment(payload: ReservationAttachmentInput, timestamp: Timestamp): ReservationAttachment {
  return {
    id: randomUUID(),
    name: payload.name,
    type: payload.type,
    url: payload.url,
    uploadedBy: payload.uploadedBy ?? 'admin',
    key: payload.key,
    createdAt: timestamp,
  };
}

function buildHistoryEntry(
  status: ReservationStatus,
  actor: 'admin' | 'system',
  note: string | undefined,
  timestamp: Timestamp
): ReservationHistoryItem {
  return {
    status,
    actor,
    note,
    createdAt: timestamp,
  };
}

function getBlobKeyFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    return pathname.startsWith('/') ? pathname.slice(1) : pathname;
  } catch {
    return null;
  }
}

/** Crea una reserva en Firestore (usado por el webhook al completar checkout y el admin). */
export async function createReserva(data: CreateReservaPayload): Promise<string> {
  const now = Timestamp.now();
  const status: ReservationStatus = data.status ?? 'reserved';
  const attachments =
    data.attachments?.map((attachment) => buildAttachment(attachment, now)) ?? [];
  const ref = doc(collection(db, COLLECTION));
  const reservationCode = await reserveNextReservationCode();
  const payload = {
    ...data,
    status,
    attachments: attachments.length > 0 ? attachments : undefined,
    statusHistory: [buildHistoryEntry(status, data.createdByAdmin ? 'admin' : 'system', data.historyNote ?? 'Reserva creada', now)],
    reservationCode,
    customerEmailLower: normalizeEmail((data as any).customerEmail),
    customerNameLower: String((data as any).customerName ?? '').trim().toLowerCase() || null,
    customerPhoneNormalized: normalizeDigits((data as any).customerPhone),
    customerDocumentNormalized: normalizeDigits((data as any).customerDocument),
    createdAt: now,
    updatedAt: now,
  };
  // Firestore doesn't accept undefined for fields intentionally stored as null.
  // Normalize optional string fields to null so the DB stores explicit nulls instead of omitting keys.
  const normalized = {
    ...payload,
    customerPhone: (payload as any).customerPhone ?? null,
    customerCountry: (payload as any).customerCountry ?? null,
    customerDocument: (payload as any).customerDocument ?? null,
    customerComments: (payload as any).customerComments ?? null,
    // Normalizar historyNote para evitar guardar `undefined` en Firestore
    historyNote: (payload as any).historyNote ?? null,
  };
  await setDoc(ref, normalized);
  return ref.id;
}

/** Actualiza el estado de una reserva y guarda el historial. */
export async function updateReservaStatus(
  id: string,
  status: ReservationStatus,
  options?: { actor?: 'admin' | 'system'; note?: string }
): Promise<void> {
  const now = Timestamp.now();
  const entry = buildHistoryEntry(status, options?.actor ?? 'admin', options?.note, now);
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, {
    status,
    updatedAt: now,
    statusHistory: arrayUnion(entry),
  });
}

/** Agrega adjuntos a la reserva. */
export async function addReservaAttachments(
  id: string,
  attachments: ReservationAttachmentInput[]
): Promise<void> {
  if (attachments.length === 0) return;
  const now = Timestamp.now();
  const docs = attachments.map((attachment) => buildAttachment(attachment, now));
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, {
    attachments: arrayUnion(...docs),
    updatedAt: now,
  });
}

export async function removeReservaAttachmentsById(
  id: string,
  attachmentIds: string[]
): Promise<ReservationAttachment[]> {
  if (attachmentIds.length === 0) return [];
  const ref = doc(db, COLLECTION, id);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return [];
  const reservation = mapDocToReservation(snapshot);
  const current = reservation?.attachments ?? [];
  const toRemove = current.filter((attachment) => attachmentIds.includes(attachment.id));
  const remaining = current.filter((attachment) => !attachmentIds.includes(attachment.id));
  await updateDoc(ref, {
    attachments: remaining.length > 0 ? remaining : [],
    updatedAt: Timestamp.now(),
  });
  for (const attachment of toRemove) {
    const key = attachment.key ?? getBlobKeyFromUrl(attachment.url);
    if (!key) continue;
    try {
      await deleteBlobAsset(key);
    } catch (error) {
      console.error('[reservas] Error borrando blob:', error);
    }
  }
  return toRemove;
}

/** Lista reservas con filtros opcionales. Orden por createdAt desc. */
export async function getReservas(filters: {
  experienceId?: string;
  date?: string;
  status?: ReservationStatus | ReservationStatus[];
  limit?: number;
} = {}): Promise<Reservation[]> {
  const { experienceId, date, limit: limitOption = 100, status } = filters;
  const constraints: ReturnType<typeof where>[] = [];
  const statuses = Array.isArray(status) ? status : status ? [status] : [];
  if (statuses.length === 1) {
    constraints.push(where('status', '==', statuses[0]));
  } else if (statuses.length > 1 && statuses.length <= 10) {
    constraints.push(where('status', 'in', statuses));
  }
  if (experienceId) constraints.push(where('experienceId', '==', experienceId));
  if (date) constraints.push(where('date', '==', date));
  const q = query(
    collection(db, COLLECTION),
    ...constraints,
    firestoreOrderBy('createdAt', 'desc'),
    ...(limitOption > 0 ? [firestoreLimit(limitOption)] : [])
  );
  try {
    const snapshot = await getDocs(q);
    let list = snapshot.docs.map((d) =>
      serializeFirestoreData<Reservation>({ id: d.id, ...d.data() })
    );
    if (limitOption > 0) list = list.slice(0, limitOption);
    return list;
  } catch {
    // Sin índice compuesto: traer sin orderBy y ordenar en memoria
    const q2 = query(collection(db, COLLECTION), ...constraints);
    const snapshot = await getDocs(q2);
    let list = snapshot.docs.map((d) =>
      serializeFirestoreData<Reservation>({ id: d.id, ...d.data() })
    );
    list.sort((a, b) => {
      const toMs = (v: unknown): number => {
        if (typeof v === 'string') return new Date(v).getTime();
        if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate().getTime();
        if (v && typeof v === 'object' && 'seconds' in v) return ((v as { seconds: number }).seconds ?? 0) * 1000;
        return 0;
      };
      return toMs(b.createdAt) - toMs(a.createdAt);
    });
    if (limitOption > 0) list = list.slice(0, limitOption);
    return list;
  }
}


export async function getReservasByCustomerEmail(
  email: string,
  options: { onlyManual?: boolean } = {}
): Promise<Reservation[]> {
  const normalizedEmail = normalizeEmail(email);
  const constraints: ReturnType<typeof where>[] = [
    where(normalizedEmail ? 'customerEmailLower' : 'customerEmail', '==', normalizedEmail || email),
  ];
  if (options.onlyManual) {
    constraints.push(where('createdByAdmin', '==', true));
  }
  try {
    const q = query(
      collection(db, COLLECTION),
      ...constraints,
      firestoreOrderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => serializeFirestoreData<Reservation>({ id: d.id, ...d.data() }));
  } catch {
    const q = query(collection(db, COLLECTION), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((d) => serializeFirestoreData<Reservation>({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const toMs = (v: unknown): number => {
          if (typeof v === 'string') return new Date(v).getTime();
          if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
            return (v as { toDate: () => Date }).toDate().getTime();
          }
          if (v && typeof v === 'object' && 'seconds' in v) return ((v as { seconds: number }).seconds ?? 0) * 1000;
          return 0;
        };
        return toMs(b.createdAt) - toMs(a.createdAt);
      });
  }
}

/** Obtiene una reserva por id. */
export async function getReservaById(id: string): Promise<Reservation | null> {
  const ref = doc(db, COLLECTION, id);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return mapDocToReservation(snapshot);
}

export type ReservaPaymentEvent = {
  id: string;
  method: 'mercadopago' | 'admin' | string;
  movementType?: 'payment' | 'extra' | 'discount' | 'refund' | string;
  collectedBy?: 'baft' | 'hotel';
  source?: 'system' | 'manual' | string;
  status: string;
  amount: number;
  currency: string;
  reference?: string | null;
  recordedBy?: string | null;
  occurredAt?: object | null;
  message?: string | null;
  mercadoPagoPaymentId?: string | null;
  correctsPaymentId?: string | null;
  correctedBy?: string | null;
  correctionReason?: string | null;
  correctedAt?: object | null;
  includedInTotal?: boolean;
  extraId?: string | null;
  createdAt: object;
  updatedAt?: object | null;
};

export async function getReservaPayments(reservationId: string, options: { limit?: number } = {}): Promise<ReservaPaymentEvent[]> {
  const lim = Math.max(1, Math.min(100, Number(options.limit ?? 50)));
  const q = query(
    collection(db, COLLECTION, reservationId, 'payments'),
    firestoreOrderBy('createdAt', 'desc'),
    firestoreLimit(lim)
  );
  const snapshot = await getDocs(q).catch(() => null);
  if (!snapshot) return [];
  return snapshot.docs.map((d) => serializeFirestoreData<ReservaPaymentEvent>({ id: d.id, ...d.data() }));
}

/** Conteo de personas reservadas por fecha para un paquete (solo status reserved/completed). Para cada date YYYY-MM-DD devuelve la suma de people. */
export async function getReservasCountByPackageAndDate(
  packageId: string
): Promise<Record<string, number>> {
  // Count reservations that occupy capacity: both 'reserved' and 'completed'
  const q = query(
    collection(db, COLLECTION),
    where('packageId', '==', packageId),
    where('status', 'in', ['reserved', 'completed'])
  );
  const snapshot = await getDocs(q);
  const byDate: Record<string, number> = {};
  snapshot.docs.forEach((d) => {
    const data = d.data();
    const date = data.date as string;
    const people = typeof data.people === 'number' ? data.people : 0;
    if (date && date !== 'sin-fecha') {
      byDate[date] = (byDate[date] ?? 0) + people;
    }
  });
  return byDate;
}

// Alias para mantener compatibilidad durante la transición
export const getReservasCountByExperienceAndDate = getReservasCountByPackageAndDate;
