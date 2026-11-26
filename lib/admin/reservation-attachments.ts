import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { deleteBlobAsset } from '@/lib/blob';

export function getOwnedAttachmentKey(reservationId: string, attachment: Record<string, unknown>): string | null {
  if (typeof attachment?.url !== 'string' || !process.env.R2_PUBLIC_BASE) return null;
  try {
    const base = new URL(process.env.R2_PUBLIC_BASE);
    const url = new URL(attachment.url);
    const prefix = `${base.pathname.replace(/\/+$/, '')}/`;
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return null;
    const key = decodeURIComponent(url.pathname.slice(prefix.length));
    if (attachment.key && attachment.key !== key) return null;
    const scopedPrefix = `reservas/${reservationId}/`;
    if (key.startsWith(scopedPrefix) && /^[a-f0-9]{64}\.(pdf|jpg|png|webp)$/.test(key.slice(scopedPrefix.length))) return key;
    // Older reservation attachments used a UUID-prefixed filename at the bucket root.
    return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}-[^/\\]+$/i.test(key) ? key : null;
  } catch {
    return null;
  }
}

export async function removeReservaAttachmentsById(db: Firestore, id: string, attachmentIds: string[]) {
  const ref = db.collection('reservas').doc(id);
  const keys = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const attachments = snapshot.data()?.attachments;
    if (!Array.isArray(attachments)) return [];
    const remaining = attachments.filter((attachment) => !attachmentIds.includes(attachment?.id));
    if (remaining.length === attachments.length) return [];

    const remainingKeys = new Set(remaining.map((attachment) => getOwnedAttachmentKey(id, attachment)));
    const removedKeys = attachments
      .filter((attachment) => attachmentIds.includes(attachment?.id))
      .map((attachment) => getOwnedAttachmentKey(id, attachment))
      .filter((key): key is string => Boolean(key) && !remainingKeys.has(key));
    tx.update(ref, { attachments: remaining, updatedAt: FieldValue.serverTimestamp() });
    return [...new Set(removedKeys)];
  });

  const results = await Promise.allSettled(keys.map(deleteBlobAsset));
  const failures = results.filter((result) => result.status === 'rejected').length;
  if (failures) console.error('[reserva/adjuntos] No se pudieron borrar objetos desvinculados', { id, failures });
  return failures;
}
