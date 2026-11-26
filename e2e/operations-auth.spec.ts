import { test, expect } from '@playwright/test';

test('new administrative reads never disclose business data without authentication', async ({ request }) => {
  for (const path of ['/api/admin/reportes', '/api/admin/finanzas', '/api/admin/counterparties', '/api/admin/package-operations?id=test']) {
    const response = await request.get(path);
    expect([401, 403, 500]).toContain(response.status());
    const body = await response.json();
    expect(body.error).toBeTruthy();
    expect(body).not.toHaveProperty('reservations');
    expect(body).not.toHaveProperty('summary');
    expect(body).not.toHaveProperty('counterparties');
  }
});
test('administrative writes reject unauthenticated requests before executing mutations', async ({ request }) => {
  for (const path of ['/api/admin/finanzas', '/api/admin/reservation-payments', '/api/admin/counterparties', '/api/admin/package-operations', '/api/admin/comprobantes']) {
    const response = await request.post(path, { data: {} });
    expect([401, 403, 500]).toContain(response.status());
    expect((await response.json()).error).toBeTruthy();
  }
  const response = await request.patch('/api/admin/reservation-operations', { data: {} });
  expect([401, 403, 500]).toContain(response.status());
});

test('reservation attachments reject unauthenticated multipart uploads', async ({ request }) => {
  const response = await request.post('/api/admin/reservas/test/adjuntos', {
    multipart: { file: { name: 'test.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') } },
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: 'Autenticación inválida' });
});

test('the sale detail bundle compiles without importing server-only R2', async ({ request }) => {
  const response = await request.get('/admin/ventas/test');
  expect(response.status()).toBe(200);
  expect(await response.text()).not.toContain('No se configuró R2_*');
});
