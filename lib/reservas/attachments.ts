import type { ReservationAttachment } from '../../components/landing-reserva/types.ts';

export type ReservationAttachmentInput = Omit<ReservationAttachment, 'id' | 'createdAt' | 'uploadedBy'> & {
  uploadedBy?: ReservationAttachment['uploadedBy'];
};

export function buildReservationAttachment(
  payload: ReservationAttachmentInput,
  createdAt: ReservationAttachment['createdAt']
): ReservationAttachment {
  return {
    id: crypto.randomUUID(),
    url: payload.url,
    uploadedBy: payload.uploadedBy ?? 'admin',
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.type !== undefined ? { type: payload.type } : {}),
    ...(payload.key !== undefined ? { key: payload.key } : {}),
    createdAt,
  };
}
