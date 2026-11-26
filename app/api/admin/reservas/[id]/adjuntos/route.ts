import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { putReservationBlob } from '@/lib/blob';
import { buildReservationAttachment } from '@/lib/reservas/attachments';
import { prepareReservationUpload, uploadAndLinkReservationAttachment } from '@/lib/reservas/attachment-upload';
import { MAX_MULTIPART_FILE_BYTES } from '@/lib/utils/imageValidation';
import { guardAdmin } from '@/lib/vendor-admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!request.headers.get('authorization')?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Autenticación inválida' }, { status: 401 });
  }
  const guard = await guardAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  if (!/^[\w-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Reserva inválida.' }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'Seleccioná un archivo válido.' }, { status: 400 });
  if (file.size > MAX_MULTIPART_FILE_BYTES) return NextResponse.json({ error: 'El adjunto no puede superar 4 MB.' }, { status: 413 });

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const upload = prepareReservationUpload(id, file, bytes);
    if (!upload) return NextResponse.json({ error: 'Usá un PDF, JPG, PNG o WebP válido.' }, { status: 415 });

    const ref = guard.db.collection('reservas').doc(id);
    const initial = await ref.get();
    if (!initial.exists) return NextResponse.json({ error: 'La reserva ya no existe.' }, { status: 404 });
    const existing = initial.data()?.attachments;
    if (Array.isArray(existing) && existing.some((item) => item?.key === upload.key)) {
      return NextResponse.json({ ok: true });
    }

    const result = await uploadAndLinkReservationAttachment(
      upload,
      (item) => putReservationBlob(item.key, bytes, item.type),
      (item) => guard.db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (!current.exists) return false;
        const attachments = current.data()?.attachments;
        if (!Array.isArray(attachments) || !attachments.some((entry) => entry?.key === item.key)) {
          tx.update(ref, {
            attachments: FieldValue.arrayUnion(buildReservationAttachment(item, new Date())),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        return true;
      }),
    );

    if (result.status === 'linked') return NextResponse.json({ ok: true });
    if (result.status === 'reservation-missing') return NextResponse.json({ error: 'La reserva ya no existe.' }, { status: 404 });

    const reference = crypto.randomUUID();
    console.error('[reserva/adjuntos]', { reference, stage: result.status, name: (result.error as Error)?.name });
    return NextResponse.json({
      reference,
      error: result.status === 'storage-error'
        ? 'No se pudo subir el archivo a R2. Podés reintentar.'
        : 'El archivo se subió, pero no se pudo vincular a la reserva. Reintentá para completar la operación.',
    }, { status: 502 });
  } catch (error) {
    const reference = crypto.randomUUID();
    console.error('[reserva/adjuntos]', { reference, stage: 'prepare', name: (error as Error)?.name });
    return NextResponse.json({ error: 'No se pudo preparar el adjunto de la reserva.', reference }, { status: 500 });
  }
}
