import { createHash } from 'node:crypto';

const startsWith = (body: Uint8Array, signature: number[]) => signature.every((byte, index) => body[index] === byte);
const ascii = (body: Uint8Array, offset: number, text: string) =>
  [...text].every((char, index) => body[offset + index] === char.charCodeAt(0));

function detectFormat(body: Uint8Array) {
  if (ascii(body, 0, '%PDF-')) return { extension: 'pdf', type: 'application/pdf' };
  if (startsWith(body, [0xff, 0xd8, 0xff])) return { extension: 'jpg', type: 'image/jpeg' };
  if (startsWith(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { extension: 'png', type: 'image/png' };
  if (ascii(body, 0, 'RIFF') && ascii(body, 8, 'WEBP')) return { extension: 'webp', type: 'image/webp' };
  return null;
}

export function prepareReservationUpload(reservationId: string, file: Pick<File, 'name' | 'type'>, body: Uint8Array) {
  const format = detectFormat(body);
  if (!format || (file.type && file.type !== 'application/octet-stream' && file.type !== format.type)) return null;

  const digest = createHash('sha256').update(body).digest('hex');
  const name = file.name.replace(/[\u0000-\u001f\u007f\\/]/g, '').trim().slice(0, 200) || `adjunto.${format.extension}`;
  return { key: `reservas/${reservationId}/${digest}.${format.extension}`, type: format.type, name };
}

type PreparedUpload = NonNullable<ReturnType<typeof prepareReservationUpload>>;
type LinkedUpload = PreparedUpload & { url: string };

/** The storage key and the link are idempotent; a retry after either response was lost is safe. */
export async function uploadAndLinkReservationAttachment(
  upload: PreparedUpload,
  store: (upload: PreparedUpload) => Promise<string>,
  link: (upload: LinkedUpload) => Promise<boolean>,
) {
  let url: string;
  try {
    url = await store(upload);
  } catch (error) {
    return { status: 'storage-error', error } as const;
  }
  try {
    return await link({ ...upload, url }) ? { status: 'linked' } as const : { status: 'reservation-missing' } as const;
  } catch (error) {
    return { status: 'link-error', error } as const;
  }
}
