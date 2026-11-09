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
