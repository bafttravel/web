import 'server-only';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_ENDPOINT = process.env.R2_ENDPOINT;

function getR2Storage() {
  if (!R2_ACCESS_KEY_ID) throw new Error('Falta R2_ACCESS_KEY_ID');
  if (!R2_SECRET_ACCESS_KEY) throw new Error('Falta R2_SECRET_ACCESS_KEY');
  if (!R2_BUCKET) throw new Error('Falta R2_BUCKET');
  if (!R2_ENDPOINT) throw new Error('Falta R2_ENDPOINT');

  const client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  return { client, bucket: R2_BUCKET };
}

export async function deleteBlobAsset(key: string): Promise<void> {
  const { client, bucket } = getR2Storage();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } finally {
    client.destroy();
  }
}

/** Reuses an existing object for a retry with the same content-derived key. */
export async function putReservationBlob(key: string, body: Uint8Array, contentType: string): Promise<string> {
  const publicBase = process.env.R2_PUBLIC_BASE;
  if (!publicBase) throw new Error('Falta R2_PUBLIC_BASE');
  const url = new URL(key, `${publicBase.replace(/\/+$/, '')}/`).toString();
  const { client, bucket } = getR2Storage();
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'private, no-store',
      IfNoneMatch: '*',
    }));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode !== 412) throw error;
  } finally {
    client.destroy();
  }
  return url;
}
