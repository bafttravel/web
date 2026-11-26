import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReservationAttachment } from '../lib/reservas/attachments.ts';
import { prepareReservationUpload, uploadAndLinkReservationAttachment } from '../lib/reservas/attachment-upload.ts';
import { MAX_MULTIPART_FILE_BYTES } from '../lib/utils/imageValidation.ts';
import { UploadError, uploadFile, uploadImage, uploadVideo } from '../lib/utils/upload.ts';

test('a non-JSON 413 returns the upload limit instead of a JSON parsing error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('FUNCTION_PAYLOAD_TOO_LARGE', { status: 413 }));
  await assert.rejects(uploadImage(new File(['x'], 'test.png')), { constructor: UploadError, message: /4 MB/ });
});

test('an oversized video is rejected before making a request', async (t) => {
  const mockFetch = t.mock.method(globalThis, 'fetch', async () => new Response());
  const file = new File([new Uint8Array(MAX_MULTIPART_FILE_BYTES + 1)], 'test.mp4');
  await assert.rejects(uploadVideo(file), /4 MB/);
  assert.equal(mockFetch.mock.callCount(), 0);
});

test('a storage failure preserves the server diagnostic reference', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'No se pudo guardar en R2.', reference: 'test-reference' }, { status: 500 }));
  await assert.rejects(uploadImage(new File(['x'], 'test.png')), /R2\. Referencia: test-reference/);
});

test('a legacy reservation attachment without an R2 key has no undefined fields for Firestore', () => {
  const createdAt = new Date();
  const url = 'https://assets.example.com/comprobante.pdf';
  const { id, ...fields } = buildReservationAttachment({ url, name: undefined, type: undefined, key: undefined }, createdAt);
  assert.ok(id);
  assert.deepEqual(fields, { url, uploadedBy: 'admin', createdAt });
});

test('a PDF upload returns the original R2 key so it can be linked to the reservation', async (t) => {
  const uploaded = { url: 'https://assets.example.com/comprobante.pdf', key: 'comprobante.pdf' };
  t.mock.method(globalThis, 'fetch', async (_url: string, request: RequestInit) => {
    const file = (request.body as FormData).get('file');
    assert.ok(file instanceof File);
    assert.equal(file.type, 'application/pdf');
    return Response.json(uploaded);
  });
  const result = await uploadFile(new File(['pdf'], 'comprobante.pdf', { type: 'application/pdf' }));
  assert.deepEqual(result, uploaded);
  assert.equal(buildReservationAttachment({ ...result, name: 'comprobante.pdf', type: 'application/pdf' }, new Date()).key, uploaded.key);
});

test('reservation attachments accept PDF and images by signature and reject a fake PDF', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7');
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.match(prepareReservationUpload('test', { name: 'comprobante.pdf', type: 'application/pdf' }, pdf)!.key, /^reservas\/test\/[a-f0-9]{64}\.pdf$/);
  assert.equal(prepareReservationUpload('test', { name: 'foto.png', type: 'image/png' }, png)?.type, 'image/png');
  assert.equal(prepareReservationUpload('test', { name: 'falso.pdf', type: 'application/pdf' }, png), null);
});

test('a Firestore failure after upload can be retried with the same R2 object', async () => {
  const file = { name: 'comprobante.pdf', type: 'application/pdf' };
  const pdf = new TextEncoder().encode('%PDF-1.7');
  const objects = new Set<string>();
  const store = async ({ key }: { key: string }) => {
    objects.add(key);
    return `https://assets.example.com/${key}`;
  };
  const failed = await uploadAndLinkReservationAttachment(prepareReservationUpload('test', file, pdf)!, store, async () => {
    throw new Error('transient Firestore error');
  });
  assert.equal(failed.status, 'link-error');
  const retried = await uploadAndLinkReservationAttachment(prepareReservationUpload('test', file, pdf)!, store, async ({ key, url }) => {
    assert.ok(url.endsWith(key));
    return true;
  });
  assert.equal(retried.status, 'linked');
  assert.equal(objects.size, 1);
  assert.notEqual(prepareReservationUpload('other-reservation', file, pdf)?.key, [...objects][0]);
});

test('an R2 failure does not attempt a Firestore write', async () => {
  const upload = prepareReservationUpload('test', { name: 'test.pdf', type: 'application/pdf' }, new TextEncoder().encode('%PDF-1.7'))!;
  let linked = false;
  const result = await uploadAndLinkReservationAttachment(upload, async () => { throw new Error('R2 failed'); }, async () => {
    linked = true;
    return true;
  });
  assert.equal(result.status, 'storage-error');
  assert.equal(linked, false);
});
