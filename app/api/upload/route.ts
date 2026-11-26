import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/vendor-admin';

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE;

function ensureR2Config() {
  if (!R2_ACCESS_KEY_ID) throw new Error('Falta R2_ACCESS_KEY_ID');
  if (!R2_SECRET_ACCESS_KEY) throw new Error('Falta R2_SECRET_ACCESS_KEY');
  if (!R2_BUCKET) throw new Error('Falta R2_BUCKET');
  if (!R2_ENDPOINT) throw new Error('Falta R2_ENDPOINT');
  if (!R2_PUBLIC_BASE) throw new Error('Falta R2_PUBLIC_BASE');
}

function getR2Client(): S3Client {
  ensureR2Config();
  return new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT as string,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID as string,
      secretAccessKey: R2_SECRET_ACCESS_KEY as string,
    },
    forcePathStyle: true,
  });
}

function buildPublicUrl(key: string): string {
  ensureR2Config();
  const base = new URL((R2_PUBLIC_BASE as string).endsWith('/') ? (R2_PUBLIC_BASE as string) : `${R2_PUBLIC_BASE}/`);
  return new URL(key, base).toString();
}

export async function POST(request: Request) {
  let stage = 'configuration';
  try {
    ensureR2Config();
    stage = 'multipart';
    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');

    if (!formData || !(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: 'La solicitud no contiene un archivo válido.' },
        { status: 400 }
      );
    }

    const requestedKey = formData.get('key');
    const key = (typeof requestedKey === 'string' && requestedKey) || `${randomUUID()}-${file.name}`;
    if (key.startsWith('reservas/')) return NextResponse.json({ error: 'Usá la carga de adjuntos de la reserva.' }, { status: 403 });
    if (key.startsWith('comprobantes/')) {
      const guard = await guardAdmin(request); if (guard instanceof NextResponse) return guard;
    }

    stage = 'configuration';
    const url = buildPublicUrl(key);
    const client = getR2Client();
    stage = 'read-file';
    const body = Buffer.from(await file.arrayBuffer());

    stage = 'r2-put';
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET as string,
        Key: key,
        ...(key.startsWith('comprobantes/') ? { IfNoneMatch: '*' } : {}),
        Body: body,
        ContentType: file.type || 'application/octet-stream',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    return NextResponse.json({ url, key });
  } catch (error) {
    const reference = randomUUID();
    const cause = error as { name?: string; $metadata?: { httpStatusCode?: number; requestId?: string } };
    console.error('[upload] Error al guardar archivo', {
      reference,
      stage,
      name: cause?.name,
      r2Status: cause?.$metadata?.httpStatusCode,
      r2RequestId: cause?.$metadata?.requestId,
    });
    return NextResponse.json(
      {
        error: stage === 'configuration'
          ? 'El almacenamiento no está configurado correctamente.'
          : stage === 'r2-put'
            ? 'No se pudo guardar el archivo en Cloudflare R2.'
            : 'No se pudo procesar el archivo.',
        reference,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    ensureR2Config();
    const payload = await request.json();
    const key = payload?.key;
    if (typeof key === 'string' && key.startsWith('reservas/')) return NextResponse.json({ error: 'Eliminá el adjunto desde la reserva.' }, { status: 403 });
    if (typeof key === 'string' && key.startsWith('comprobantes/')) return NextResponse.json({ error: 'Los comprobantes contables no se eliminan' }, { status: 403 });
    if (!key) {
      return NextResponse.json({ error: 'Key requerida para eliminar' }, { status: 400 });
    }
    const client = getR2Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET as string,
        Key: key,
      })
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file from R2:', error);
    return NextResponse.json({ error: 'No se pudo borrar el archivo' }, { status: 500 });
  }
}
