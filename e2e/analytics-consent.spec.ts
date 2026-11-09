import { test, expect } from '@playwright/test';

const analyticsHosts = /(?:clarity\.ms|googletagmanager\.com)/i;

test.describe('consentimiento de analíticas', () => {
  test('mantiene Clarity y GTM apagados hasta aceptar y permite retirar la elección', async ({ page }) => {
    const analyticsRequests: string[] = [];
    await page.route(analyticsHosts, async (route) => {
      analyticsRequests.push(route.request().url());
      await route.abort();
    });

    await page.goto('/es/terminos-condiciones');
    await expect(page.getByRole('heading', { name: 'Tu privacidad importa' })).toBeVisible();
    expect(analyticsRequests).toHaveLength(0);

    await page.getByRole('button', { name: 'Configurar', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Preferencias de cookies' })).toBeVisible();
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

    await page.getByRole('button', { name: 'Rechazar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tu privacidad importa' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Tu privacidad importa' })).toHaveCount(0);
    expect(analyticsRequests).toHaveLength(0);

    await page.getByRole('button', { name: 'Configurar cookies', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Preferencias de cookies' })).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Guardar preferencias', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // In local/test domains the real tags are intentionally never loaded.
    expect(analyticsRequests).toHaveLength(0);
    await page.locator('a[data-analytics-location="floating_button"]').dispatchEvent('click');
    const tracked = await page.evaluate(() => (window as any).dataLayer?.map((event: any) => event.event) ?? []);
    expect(tracked).toContain('whatsapp_click');
  });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`el aviso se adapta a ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/es/terminos-condiciones');
      const banner = page.getByRole('region', { name: 'Tu privacidad importa' });
      await expect(banner).toBeVisible();
      await expect(banner.getByRole('button', { name: 'Aceptar analíticas', exact: true })).toBeVisible();
      await expect(banner.getByRole('button', { name: 'Rechazar', exact: true })).toBeVisible();
      await expect(banner.getByRole('button', { name: 'Configurar', exact: true })).toBeVisible();
    });
  }
});
