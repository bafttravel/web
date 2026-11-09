import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { guardAdmin } from '@/lib/vendor-admin';
import { POST as upload } from '@/app/api/upload/route';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const guard = await guardAdmin(request); if (guard instanceof NextResponse) return guard;
  if (Number(request.headers.get('content-length') ?? 0) > 6 * 1024 * 1024) return NextResponse.json({ error: 'El comprobante no puede superar 5 MB' }, { status: 413 });
  try {
    const input = await request.formData(); const file = input.get('file');
    if (!(file instanceof File) || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) return NextResponse.json({ error: 'Usá PDF, JPG o PNG de hasta 5 MB' }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = file.type === 'application/pdf' ? new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-' : file.type === 'image/png' ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid) return NextResponse.json({ error: 'El contenido del archivo no coincide con su formato' }, { status: 400 });
    const body = new FormData(); body.set('file', file); body.set('key', `comprobantes/${randomUUID()}.${file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'}`);
    return upload(new Request(request.url, { method: 'POST', body, headers: { Authorization: request.headers.get('authorization') ?? '' } }));
  } catch { return NextResponse.json({ error: 'No se pudo adjuntar el comprobante' }, { status: 400 }); }
}
