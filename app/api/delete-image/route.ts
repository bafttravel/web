import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';

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

function isAllowedPublicHost(hostname: string): boolean {
  const envHost = (() => {
    if (!R2_PUBLIC_BASE) return '';
    try {
      return new URL(R2_PUBLIC_BASE).hostname;
    } catch {
      return '';
    }
  })();
  if (envHost && hostname === envHost) return true;
  return hostname.endsWith('.r2.dev');
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'No image URL provided' },
        { status: 400 }
      );
    }

    let key = '';
    try {
      const parsed = new URL(imageUrl);
      if (!isAllowedPublicHost(parsed.hostname)) {
        return NextResponse.json(
          { error: 'Invalid image URL' },
          { status: 400 }
        );
      }
      key = decodeURIComponent(parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname);
    } catch {
      return NextResponse.json(
        { error: 'Invalid image URL' },
        { status: 400 }
      );
    }

    if (!key) {
      return NextResponse.json(
        { error: 'Invalid image URL' },
        { status: 400 }
      );
    }

    if (key.startsWith('comprobantes/')) return NextResponse.json({ error: 'Los comprobantes contables no se eliminan' }, { status: 403 });

    const client = getR2Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET as string,
        Key: key,
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting image:', error);
    return NextResponse.json(
      { error: 'Delete failed' },
      { status: 500 }
    );
  }
}
