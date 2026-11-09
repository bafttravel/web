'use client';
import { getAuthInstance } from '@/lib/firebase';

export async function operationsFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const user = getAuthInstance().currentUser;
  if (!user) throw new Error('Iniciá sesión para continuar');
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}`, ...options.headers }, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la operación');
  return data as T;
}

export async function operationsDownload(path: string): Promise<Blob> {
  const user = getAuthInstance().currentUser;
  if (!user) throw new Error('Iniciá sesión para continuar');
  const response = await fetch(path, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || 'No se pudo descargar el voucher');
  }
  if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('La respuesta no es un PDF válido');
  return response.blob();
}
