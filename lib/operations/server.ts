import type { Firestore, Query, QueryDocumentSnapshot, QuerySnapshot } from 'firebase-admin/firestore';
import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import type { BusinessReservation } from './calculations';
import type { Counterparty, LedgerEntry, PaymentRecord, ReservationOperations, ReservationOperationsInput, PackageOperations } from './types';

/** Read every page; never silently cap financial totals at the first 200 records. */
export async function readAll(query: Query): Promise<Array<Record<string, unknown> & { id: string }>> {
  const rows: Array<Record<string, unknown> & { id: string }> = [];
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    const page: QuerySnapshot = await (cursor ? query.orderBy(FieldPath.documentId()).startAfter(cursor).limit(400) : query.orderBy(FieldPath.documentId()).limit(400)).get();
    rows.push(...page.docs.map((d) => ({ ...d.data(), id: d.id })));
    if (page.size < 400) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return rows;
}
export async function readOperationsData(db: Firestore) {
  const [reservations, counterparties, packages, ledger] = await Promise.all([
    readAll(db.collection('reservas')), readAll(db.collection('counterparties')),
    readAll(db.collection('paquetes')), readAll(db.collection('operationsLedger')),
  ]);
  const payments: PaymentRecord[] = [];
  // Bounded parallelism; query only existing reservation payment subcollections.
  for (let start = 0; start < reservations.length; start += 20) {
    const pages = await Promise.all(reservations.slice(start, start + 20).map(async (r) => {
      const rows = await readAll(db.collection('reservas').doc(r.id).collection('payments'));
      return rows.map((p) => ({ ...p, reservationId: r.id })) as unknown as PaymentRecord[];
    }));
    payments.push(...pages.flat());
  }
  return { reservations: reservations as unknown as BusinessReservation[], counterparties: counterparties as unknown as Counterparty[], packages, ledger: ledger as unknown as LedgerEntry[], payments };
}
export async function snapshotOperations(input: ReservationOperationsInput, packageOps?: PackageOperations, allowInactive: string[] = []): Promise<ReservationOperations> {
  if (!adminDb) throw new Error('Firebase Admin no está configurado');
  const ids = [...new Set([input.sellerHotelId, input.pickupType === 'hotel' ? input.pickupHotelId : '', ...(packageOps?.providers ?? []).map((p) => p.providerId)].filter(Boolean))];
  const parties = new Map<string, Counterparty>();
  await Promise.all(ids.map(async (id) => {
    const doc = await adminDb!.collection('counterparties').doc(id).get();
    if (!doc.exists) throw new Error('El hotel o proveedor seleccionado ya no existe');
    const party = { ...doc.data(), id } as Counterparty;
    if (!party.active && !allowInactive.includes(id)) throw new Error(`${party.name} está inactivo`);
    parties.set(id, party);
  }));
  const seller = parties.get(input.sellerHotelId);
  const pickup = input.pickupType === 'hotel' ? parties.get(input.pickupHotelId) : undefined;
  if ((seller && seller.kind !== 'hotel') || (pickup && pickup.kind !== 'hotel')) throw new Error('Seleccioná un hotel válido');
  const override = packageOps?.hotels.find((p) => p.hotelId === seller?.id);
  const hotelRates = seller?.commissions;
  const cash = override?.cash ?? hotelRates?.cash;
  const deposit = override?.deposit !== undefined && override.deposit !== null ? override.deposit : override?.bank ?? hotelRates?.deposit ?? hotelRates?.bank;
  const creditCard = override?.creditCard !== undefined && override.creditCard !== null ? override.creditCard : override?.bank ?? hotelRates?.creditCard ?? hotelRates?.bank ?? hotelRates?.deposit;
  return {
    ...input, version: 1, sellerHotelName: seller?.name ?? '', pickupHotelName: pickup?.name ?? '',
    pickupHotelId: pickup?.id ?? '', pickupAddress: pickup?.address || input.pickupAddress,
    commissions: seller ? {
      ...(cash ? { cash } : {}),
      ...(deposit ? { deposit } : {}),
      ...(creditCard ? { creditCard } : {}),
    } : null,
    providers: (packageOps?.providers ?? []).map((p) => {
      const party = parties.get(p.providerId)!;
      if (party.kind !== 'provider') throw new Error('Revisá el proveedor seleccionado');
      return { ...p, name: party.name };
    }),
    costsComplete: packageOps?.costsComplete ?? false,
  };
}
