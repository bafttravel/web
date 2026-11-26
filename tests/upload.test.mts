import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_MULTIPART_FILE_BYTES } from '../lib/utils/imageValidation.ts';
import { UploadError, uploadImage, uploadVideo } from '../lib/utils/upload.ts';

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
