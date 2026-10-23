/**
 * Funciones para gestionar Paquetes Turísticos (reemplaza experiencias.ts)
 * Adaptado para BAFT - Sistema de reservas sobre Paquetes
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  updateDoc,
  setDoc,
  deleteDoc,
  addDoc,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { serializeFirestoreData } from '@/lib/utils/serialize';
import type { Categoria, Paquete, Salida } from '@/types';
import { getOperationalSalidas, resolveDepartureConfig } from '@/lib/packages/resolve-departure';
import { packageHasCategory, syncPackageCategoryData } from '@/lib/packages/category-utils';

const COLLECTION = 'paquetes';
const CATEGORIAS_COLLECTION = 'categorias';

async function fetchActiveCategoriasInternal(): Promise<Categoria[]> {
  const q = query(
    collection(db, CATEGORIAS_COLLECTION),
    where('activa', '==', true),
    orderBy('orden', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => serializeFirestoreData<Categoria>({ id: d.id, ...d.data() }));
}

function normalizeFetchedPackage(paquete: Paquete, categorias: Categoria[]): Paquete {
  return syncPackageCategoryData(paquete, categorias);
}

// ============================================================================
// TIPOS
// ============================================================================

export type BookingDate = {
  date: string; // YYYY-MM-DD
  enabled: boolean;
};

export type BookingPublicData = {
  enabled: boolean;
  title: string;
  subtitle1: string;
  subtitle2: string;
  hasSpecificDates: boolean;
  dates: BookingDate[];
  maxPeoplePerBooking: number;
  currency: string;
  depositAmount: number | null;
};

export type PackageWithBooking = Paquete;

// ============================================================================
// FUNCIONES CRUD BÁSICAS
// ============================================================================

/** Obtener todos los paquetes visibles (para el frontend) */
export async function getPaquetes(): Promise<Paquete[]> {
  const [snap, categorias] = await Promise.all([
    getDocs(
      query(
        collection(db, COLLECTION),
        where('visible', '==', true),
        orderBy('orden', 'asc')
      )
    ),
    fetchActiveCategoriasInternal(),
  ]);
  return snap.docs.map((d) => normalizeFetchedPackage(serializeFirestoreData<Paquete>({ id: d.id, ...d.data() }), categorias));
}

/** Obtener paquetes destacados (para homepage) */
export async function getPaquetesDestacados(maxItems = 6): Promise<Paquete[]> {
  const [snap, categorias] = await Promise.all([
    getDocs(
      query(
        collection(db, COLLECTION),
        where('visible', '==', true),
        where('destacado', '==', true),
        orderBy('orden', 'asc'),
        firestoreLimit(maxItems)
      )
    ),
    fetchActiveCategoriasInternal(),
  ]);
  return snap.docs.map((d) => normalizeFetchedPackage(serializeFirestoreData<Paquete>({ id: d.id, ...d.data() }), categorias));
}

/** Obtener paquete por ID */
export async function getPaqueteById(id: string): Promise<Paquete | null> {
  const ref = doc(db, COLLECTION, id);
  const [snap, categorias] = await Promise.all([getDoc(ref), fetchActiveCategoriasInternal()]);
  if (!snap.exists()) return null;
  return normalizeFetchedPackage(serializeFirestoreData<Paquete>({ id: snap.id, ...snap.data() }), categorias);
}

/** Obtener paquete por slug (para páginas públicas) */
export async function getPaqueteBySlug(slug: string): Promise<Paquete | null> {
  const [snap, categorias] = await Promise.all([
    getDocs(
      query(
        collection(db, COLLECTION),
        where('slug', '==', slug),
        where('visible', '==', true)
      )
    ),
    fetchActiveCategoriasInternal(),
  ]);
  if (snap.empty) return null;
  const packageDoc = snap.docs[0];
  return normalizeFetchedPackage(serializeFirestoreData<Paquete>({ id: packageDoc.id, ...packageDoc.data() }), categorias);
}

/** Obtener paquetes por categoría/destino */
export async function getPaquetesByCategoria(categoriaId: string): Promise<Paquete[]> {
  const paquetes = await getPaquetes();
  return paquetes.filter((paquete) => packageHasCategory(paquete, categoriaId));
}

// ============================================================================
// FUNCIONES PARA SISTEMA DE RESERVAS
// ============================================================================

/**
 * Convertir un Paquete a datos de booking públicos
 * Las fechas cargadas permanecen reservables; el único límite de personas es por reserva.
 */
export function toBookingPublicData(
  paquete: PackageWithBooking,
  _reservedByDate: Record<string, number>
): BookingPublicData {
  const bc = paquete.bookingConfig;
  const enabled = bc?.enabled !== false;
  const operationalSalidas = getOperationalSalidas(paquete);
  const maxPeoplePerBooking = resolveDepartureConfig(paquete, operationalSalidas[0]?.fecha || 'sin-fecha').maxPeople;

  const dates: BookingDate[] = operationalSalidas.map((salida) => {
    const resolved = resolveDepartureConfig(paquete, salida.fecha);
    return {
      date: salida.fecha,
      enabled: resolved.enabled,
    };
  });

  return {
    enabled,
    title: paquete.titulo || 'Reserva',
    subtitle1: paquete.descripcionCorta || paquete.descripcion || '',
    subtitle2: '',
    hasSpecificDates: dates.length > 0,
    dates: dates.filter((d) => d.enabled),
    maxPeoplePerBooking,
    currency: String(resolveDepartureConfig(paquete, operationalSalidas[0]?.fecha || 'sin-fecha').currency || 'ars').toLowerCase(),
    depositAmount: typeof bc?.depositAmount === 'number' ? bc.depositAmount : null,
  };
}

/** Verificar si un paquete tiene reservas habilitadas */
export function isBookingEnabled(paquete: PackageWithBooking | null): boolean {
  if (!paquete) return false;
  return paquete.bookingConfig?.enabled !== false;
}

/** Obtener precio de reserva de un paquete */
export function getBookingPrice(paquete: PackageWithBooking | null): number {
  if (!paquete) return 0;
  const bc = paquete.bookingConfig;
  if (typeof bc?.depositAmount === 'number' && bc.depositAmount > 0) {
    return bc.depositAmount;
  }
  // Si no hay depositAmount configurado, usar precio del paquete
  return paquete.precio || 0;
}

// ============================================================================
// FUNCIONES ADMIN
// ============================================================================

/** Crear paquete (admin) */
export async function createPaquete(data: Omit<Paquete, 'id' | 'fechaCreacion'>): Promise<string> {
  const now = Timestamp.now();
  const payload = {
    ...data,
    fechaCreacion: now,
  };
  const docRef = await addDoc(collection(db, COLLECTION), payload);
  return docRef.id;
}

/** Actualizar paquete (admin) */
export async function updatePaquete(id: string, data: Partial<Paquete>): Promise<void> {
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

/** Eliminar paquete (admin) */
export async function deletePaquete(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Obtener todos los paquetes para admin (incluye no visibles) */
export async function getAllPaquetesAdmin(): Promise<Paquete[]> {
  const [snap, categorias] = await Promise.all([
    getDocs(query(collection(db, COLLECTION), orderBy('orden', 'asc'))),
    fetchActiveCategoriasInternal(),
  ]);
  return snap.docs.map((d) => normalizeFetchedPackage(serializeFirestoreData<Paquete>({ id: d.id, ...d.data() }), categorias));
}

// ============================================================================
// CONFIGURACIÓN DE RESERVAS (BOOKING CONFIG)
// ============================================================================

/** Actualizar configuración de reservas de un paquete */
export async function updatePaqueteBookingConfig(
  paqueteId: string,
  config: PackageWithBooking['bookingConfig']
): Promise<void> {
  const ref = doc(db, COLLECTION, paqueteId);
  await updateDoc(ref, {
    bookingConfig: config,
    updatedAt: Timestamp.now(),
  });
}

/** Habilitar/deshabilitar reservas para un paquete */
export async function togglePaqueteBooking(paqueteId: string, enabled: boolean): Promise<void> {
  const ref = doc(db, COLLECTION, paqueteId);
  await updateDoc(ref, {
    'bookingConfig.enabled': enabled,
    updatedAt: Timestamp.now(),
  });
}

// ============================================================================
// SALIDAS/FECHAS
// ============================================================================

/** Agregar salida a un paquete */
export async function addSalida(paqueteId: string, salida: Omit<Salida, 'id'>): Promise<void> {
  const ref = doc(db, COLLECTION, paqueteId);
  const paquete = await getPaqueteById(paqueteId);
  if (!paquete) throw new Error('Paquete no encontrado');
  
  const nuevasSalidas = [...(paquete.salidas || []), { ...salida, id: crypto.randomUUID() }];
  await updateDoc(ref, {
    salidas: nuevasSalidas,
    updatedAt: Timestamp.now(),
  });
}

/** Eliminar salida de un paquete */
export async function removeSalida(paqueteId: string, salidaId: string): Promise<void> {
  const ref = doc(db, COLLECTION, paqueteId);
  const paquete = await getPaqueteById(paqueteId);
  if (!paquete) throw new Error('Paquete no encontrado');
  
  const nuevasSalidas = (paquete.salidas || []).filter((s) => s.id !== salidaId);
  await updateDoc(ref, {
    salidas: nuevasSalidas,
    updatedAt: Timestamp.now(),
  });
}

// ============================================================================
// CATEGORÍAS/DESTINOS
// ============================================================================

/** Obtener todas las categorías/destinos */
export async function getCategorias(): Promise<any[]> {
  const q = query(
    collection(db, CATEGORIAS_COLLECTION),
    where('activa', '==', true),
    orderBy('orden', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => serializeFirestoreData({ id: d.id, ...d.data() }));
}

/** Obtener categoría por slug */
export async function getCategoriaBySlug(slug: string): Promise<any | null> {
  const q = query(
    collection(db, CATEGORIAS_COLLECTION),
    where('slug', '==', slug),
    where('activa', '==', true)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return serializeFirestoreData({ id: snap.docs[0].id, ...snap.docs[0].data() });
}

// ============================================================================
// COMPATIBILIDAD (para migración suave)
// ============================================================================

/** Alias para mantener compatibilidad con código que espera experiencias */
export const getExperienciaById = getPaqueteById;
export const getExperienciaBySlug = getPaqueteBySlug;
