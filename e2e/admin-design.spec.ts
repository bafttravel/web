import { test, expect } from '@playwright/test';

test('reservation PDF download uses the shared attachment renderer and a minimal reminder', async ({ page }, testInfo) => {
  await page.goto('/e2e/admin-design?screen=voucher');
  await expect(page.getByText(/Habitación|LEGACY-ROOM-SECRET/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
  await expect(page.getByLabel(/Habitación/i)).toHaveCount(0);
  await expect(page.getByText(/Habitación|LEGACY-ROOM-SECRET/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar edición', exact: true }).click();
  await page.evaluate(() => { window.open = (url) => { document.documentElement.dataset.sharedVoucherUrl = String(url); return null; }; });
  await page.getByRole('button', { name: 'Compartir por WhatsApp', exact: true }).click();
  const shared = await page.evaluate(() => document.documentElement.dataset.sharedVoucherUrl || '');
  expect(decodeURIComponent(shared)).not.toMatch(/Habitación|LEGACY-ROOM-SECRET/);
  const mail = page.frameLocator('iframe[title="Email de recordatorio con datos de prueba"]');
  await expect(mail.getByText('Hola María de Prueba,', { exact: true })).toBeVisible();
  await expect(mail.getByText('Te adjuntamos el voucher', { exact: false })).toBeVisible();
  await expect(mail.getByText('Horario: 07:30', { exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar voucher PDF', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('voucher-DEMO-5806.pdf');
  await download.saveAs(testInfo.outputPath('voucher_datos_de_prueba.pdf'));
  await expect(page.getByRole('button', { name: 'Descargar voucher PDF', exact: true })).toBeEnabled();
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('recordatorio_minimal_datos_de_prueba.png'), fullPage: true });
  const unauthenticated = await page.request.get('/api/admin/reservas/fixture-voucher/voucher');
  expect(unauthenticated.status()).not.toBe(200);
  await page.route('**/e2e/admin-design/voucher', (route) => route.fulfill({ status: 500, body: 'Error de prueba' }));
  await page.getByRole('button', { name: 'Descargar voucher PDF', exact: true }).click();
  await expect(page.getByText('No se pudo generar el voucher de prueba', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar voucher PDF', exact: true })).toBeEnabled();
});

test('manual creation opens and closes its single addon catalog with the right icon and no room field', async ({ page }, testInfo) => {
  await page.route('**/api/admin/**', (route) => route.fulfill({ json: { vendors: [], counterparties: [] } }));
  await page.goto('/e2e/admin-design?screen=reservation-form');
  const open = page.getByRole('button', { name: 'Buscar adicionales', exact: true });
  await expect(open).toHaveCount(1);
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  await expect(open.locator('svg.lucide-plus')).toHaveCount(1);
  await open.click();
  const close = page.getByRole('button', { name: 'Cerrar', exact: true });
  await expect(close).toHaveAttribute('aria-expanded', 'true');
  await expect(close.locator('svg.lucide-x')).toHaveCount(1);
  await expect(close.locator('svg.lucide-plus')).toHaveCount(0);
  await expect(page.locator('#reservation-addon-catalog')).toHaveCount(1);
  await expect(page.getByPlaceholder('Buscar por adicional o excursión…')).toBeVisible();
  await expect(page.getByText('Detalles opcionales:', { exact: false })).toHaveCount(0);
  await expect(page.getByText(/Habitación/i)).toHaveCount(0);
  await expect(page.getByLabel(/Habitación/i)).toHaveCount(0);
  await readyForScreenshot(page);
  await page.locator('#reservation-addon-catalog').locator('..').screenshot({ path: testInfo.outputPath('adicionales_abiertos_icono_cerrar.png') });
  await close.click();
  await expect(page.locator('#reservation-addon-catalog')).toHaveCount(0);
  await expect(open.locator('svg.lucide-plus')).toHaveCount(1);
  await expect(open).toHaveAttribute('aria-expanded', 'false');
});

test('complete reservation form has semantic typography on desktop and mobile', async ({ page }) => {
  await page.route('**/api/admin/**', (route) => route.fulfill({ json: { vendors: [], counterparties: [] } }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/e2e/admin-design?screen=reservation-form');
    await expect(page.getByRole('heading', { name: 'Crear reserva manual' })).toHaveCSS('font-size', '24px');
    for (const name of ['01 · Excursión y salida', '02 · Titular y pasajeros', '03 · Venta y retiro', '04 · Notas y comprobantes']) {
      await expect(page.getByRole('heading', { name, exact: true })).toHaveCSS('font-size', '18px');
      await expect(page.getByRole('heading', { name, exact: true })).toHaveCSS('text-transform', 'none');
    }
    await expect(page.getByText('Resumen', { exact: true }).last()).toHaveCSS('font-size', '18px');
    await expect(page.getByText('Revisá los datos antes de crear la reserva.', { exact: true })).toHaveCSS('font-size', '12px');
    await expect(page.locator('.admin-metric')).toHaveCSS('font-size', '28px');
    const labels = await page.locator('.admin-content label').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontSize));
    expect(labels.length).toBeGreaterThan(10);
    expect([...new Set(labels)]).toEqual(['14px']);
    const unexpected = await page.locator('.admin-content').evaluate((root) => [...root.querySelectorAll('*')].filter((node) => node.children.length === 0 && node.textContent?.trim() && node.getBoundingClientRect().width > 0 && !node.closest('svg')).map((node) => ({ text: node.textContent?.slice(0, 60), size: getComputedStyle(node).fontSize })).filter(({ size }) => !['12px', '14px', '18px', '24px', '28px'].includes(size)));
    expect(unexpected).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('complete manual editor keeps excursion dates, pickup time and one live summary together', async ({ page }, testInfo) => {
  await page.route('**/api/admin/**', (route) => route.fulfill({ json: { vendors: [], counterparties: [] } }));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/e2e/admin-design?screen=reservation-form');
  const summary = page.getByRole('complementary', { name: 'Resumen de la reserva', exact: true });
  await expect(summary).toHaveCount(1);
  await expect(page.getByRole('complementary', { name: 'Resumen de venta y retiro' })).toHaveCount(0);
  await expect(page.getByLabel('Fecha de la excursión', { exact: true })).toHaveText('17/01/2030');
  await expect(page.getByRole('button', { name: 'Fecha de la excursión', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Crear reserva', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre *', exact: true })).toBeFocused();
  for (const removed of ['Detalles opcionales: horario e indicaciones', 'Dieta / alergias', 'Indicaciones', 'Enviar confirmación y voucher al cliente', '04 · Cobro', '¿Se recibió dinero?', 'Registrá solamente el dinero que ya se recibió.', 'La reserva se crea sin cobro registrado. Podés cargarlo después.']) await expect(page.getByText(removed, { exact: true })).toHaveCount(0);
  await expect(page.locator('#reservation-payment')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Secciones de la reserva' }).getByRole('link', { name: 'Cobro', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Medio de cobro', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hotel', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Hotel que realizó la venta', exact: true }).selectOption('hotel-0');
  await page.getByRole('combobox', { name: 'Medio de pago de la reserva', exact: true }).selectOption('cash');
  await page.getByRole('button', { name: 'Hotel', exact: true }).last().click();
  await page.getByRole('combobox', { name: 'Hotel de retiro', exact: true }).selectOption('hotel-1');
  await page.getByRole('combobox', { name: 'Horario de retiro: hora', exact: true }).selectOption('07');
  await page.getByRole('combobox', { name: 'Horario de retiro: minutos', exact: true }).selectOption('30');
  await expect(summary).toContainText('Hotel Lago Austral');
  await expect(summary).toContainText('07:30');
  await expect(summary).toContainText('17/01/2030');
  await page.getByRole('checkbox', { name: /Traslado a la excursión/ }).check();
  await expect(summary.locator('.admin-metric')).toContainText('475.000');
  await expect(summary.getByLabel('Estado del cobro')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Crear reserva', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Crear reserva', exact: true })).toHaveAttribute('form', 'manual-reservation-form');
  await page.getByRole('heading', { name: 'Crear reserva manual', exact: true }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('reserva_manual_redisenada_desktop.png'), fullPage: true });
  const excursion = page.getByRole('combobox', { name: 'Excursión', exact: true });
  await excursion.click(); await page.getByRole('option', { name: 'Todo Glaciares', exact: true }).click();
  const date = page.getByRole('button', { name: 'Fecha de la excursión', exact: true });
  await expect(date).toHaveText('10/02/2030');
  await date.click();
  const calendar = page.getByRole('dialog', { name: 'Elegir fecha', exact: true });
  await expect(calendar.getByRole('button', { name: /11 de febrero de 2030/ })).toBeDisabled();
  await calendar.getByRole('button', { name: /12 de febrero de 2030/ }).click();
  await expect(summary).toContainText('12/02/2030');
  await expect(summary).toContainText('07:30');
  await excursion.click(); await page.getByRole('option', { name: 'Servicio a coordinar', exact: true }).click();
  await expect(page.getByLabel('Fecha de la excursión', { exact: true })).toHaveText('A coordinar');
  await expect(page.getByRole('button', { name: 'Fecha de la excursión', exact: true })).toHaveCount(0);
  await expect(page.getByText('La excursión no tiene salidas programadas.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/admin-design?screen=reservation-form');
  await page.getByRole('combobox', { name: 'Horario de retiro: hora', exact: true }).selectOption('09');
  await page.getByRole('combobox', { name: 'Horario de retiro: minutos', exact: true }).selectOption('15');
  await expect(summary).toContainText('09:15');
  await expect(page.locator('#reservation-payment')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sí, registrar cobro', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('reserva_manual_redisenada_mobile.png'), fullPage: true });
});

test('secondary text retains hierarchy in directories, commissions and payment dialogs', async ({ page }) => {
  for (const screen of ['hotels', 'providers', 'commissions', 'finance']) {
    await page.goto(`/e2e/admin-design?screen=${screen}`);
    await expect(page.locator('.admin-content h1')).toHaveCSS('font-size', '24px');
    const captions = page.locator('.admin-content .text-xs');
    for (let i = 0; i < await captions.count(); i++) await expect(captions.nth(i)).toHaveCSS('font-size', '12px');
  }
  await page.getByRole('button', { name: 'Registrar pago a proveedor', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading')).toHaveCSS('font-size', '18px');
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Proveedor del pago', exact: true })).toHaveCSS('font-size', '14px');
});
import type { Page } from '@playwright/test';

async function readyForScreenshot(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => {
    let element: HTMLElement | null = document.querySelector('.admin-workspace'); let opacity = 1;
    while (element) { opacity *= Number(getComputedStyle(element).opacity); element = element.parentElement; }
    return opacity;
  })).toBe(1);
}

test('Dashboard unifies analysis and supports compact navigation, filters and keyboard search', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/e2e/admin-design');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByLabel('Indicadores del período')).toBeVisible();
  await expect(page.getByText('Estadísticas y reportes', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Vistas del Dashboard' }).getByRole('button')).toHaveCount(5);
  await expect(page.locator('.dash-advanced')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Blog', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Proveedores', exact: true })).toBeVisible();
  await expect(page.locator('h1')).toHaveCSS('font-size', '24px');
  await expect(page.locator('.dash-panel h2').first()).toHaveCSS('font-size', '18px');
  await expect(page.locator('.dash-metric > strong').first()).toHaveCSS('font-size', '28px');
  await expect(page.locator('.dash-metric > small').first()).toHaveCSS('font-size', '12px');
  await expect(page.locator('.dash-panel').first()).toHaveCSS('border-top-width', '0px');
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('admin_dashboard_desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Filtros', exact: false }).click();
  await expect(page.getByText('Nacionalidad', { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Vistas del Dashboard' }).getByRole('button', { name: 'Pasajeros', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edad al viajar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Contraer navegación' }).click();
  await expect(page.getByRole('button', { name: 'Expandir navegación' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar sección' }).fill('blog');
  await expect(page.getByRole('navigation', { name: 'Resultados de navegación' }).getByRole('link')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Buscar sección' }).fill('hotel');
  await expect(page.getByRole('navigation', { name: 'Resultados de navegación' }).getByRole('link')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('hotel directory uses search and a focused editor rather than displacing the table', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/e2e/admin-design?screen=hotels');
  await expect(page.getByText('Hotel Lago Austral', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Buscar hoteles' })).toHaveCSS('padding-left', '38px');
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('admin_hoteles_desktop.png'), fullPage: true });
  await page.getByRole('textbox', { name: 'Buscar hoteles' }).fill('Lago');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Editar Hotel Lago Austral', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Razón social', { exact: true })).toHaveValue('Hotel Lago Austral');
  await expect(page.getByLabel('Razón social', { exact: true })).toHaveCSS('font-size', '14px');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('payments show the familiar five tasks and focused dialogs', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/e2e/admin-design?screen=finance');
  await expect(page.getByRole('heading', { name: 'Pagos', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pagos', exact: true })).toHaveAttribute('href', '/admin/pagos');
  await expect(page.getByRole('navigation', { name: 'Secciones de pagos' }).getByRole('button')).toHaveCount(5);
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('admin_pagos_desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Registrar pago a proveedor', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Proveedor del pago', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Concepto del movimiento', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Liquidaciones Baftravel', exact: true }).click();
  await expect(page.locator('tbody').getByText(/DEMO-1000/).first()).toBeVisible();
  await expect(page.locator('tbody')).not.toContainText('fixture-r');
});

test('mobile navigation is hidden until requested and the Dashboard does not overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/admin-design');
  await expect(page.getByLabel('Indicadores del período')).toBeVisible();
  await expect(page.getByRole('complementary')).not.toBeVisible();
  await expect(page.locator('h1')).toHaveCSS('font-size', '24px');
  await expect(page.getByRole('button', { name: 'Aplicar', exact: true })).toHaveCSS('font-size', '14px');
  expect(await page.locator('.dash-metric > strong').first().evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('admin_dashboard_mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await expect(page.getByRole('complementary')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary')).not.toBeVisible();
});

test('provider directory uses the new name throughout', async ({ page }, testInfo) => {
  await page.goto('/e2e/admin-design?screen=providers');
  await expect(page.getByRole('heading', { name: 'Proveedores', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Buscar proveedores' })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo proveedor', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).not.toContainText(/prestador|contraparte/i);
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('admin_proveedores_dialog.png'), fullPage: true });
});

test('directories, finance and advanced filters remain contained on small screens', async ({ page }) => {
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const screen of ['hotels', 'providers', 'finance', 'dashboard']) {
      await page.goto(`/e2e/admin-design?screen=${screen}`);
      await expect(page.locator('h1')).toBeVisible();
      if (screen === 'dashboard') {
        await expect(page.getByLabel('Indicadores del período')).toBeVisible();
        await page.getByRole('button', { name: 'Filtros', exact: false }).click();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test('legacy referral without commission currency still loads the Dashboard', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/e2e/admin-design?legacy=referral');
  await expect(page.getByLabel('Indicadores del período')).toBeVisible();
  await expect(page.getByText('No pudimos cargar el Dashboard.', { exact: true })).toHaveCount(0);
  await expect(page.locator('.dash-data-quality')).toContainText('costos o comisiones por completar');
  await expect(page.locator('.dash-metric').filter({ hasText: 'Margen operativo' }).locator('strong')).toHaveText('—');
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('admin_dashboard_legacy_referral.png'), fullPage: true });
});

test('unidentified currencies display an explicit warning in Dashboard and Finance', async ({ page }) => {
  for (const screen of ['dashboard', 'finance']) {
    await page.goto(`/e2e/admin-design?screen=${screen}&legacy=currencies`);
    const warning = page.getByRole('alert').filter({ hasText: 'Hay registros sin una moneda válida' });
    await expect(warning).toContainText('Los totales pueden estar incompletos');
    await expect(warning).toContainText('reservas (1), cobros o devoluciones (1)');
    if (screen === 'dashboard') await expect(page.getByLabel('Indicadores del período')).toBeVisible();
    else await expect(page.locator('.admin-finance-metrics')).toBeVisible();
  }
});

test('commission table uses Argentine dates and visible Spanish status badges', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/e2e/admin-design?screen=commissions');
  const table = page.getByRole('table', { name: 'Reservas y comisiones de vendedores' });
  await expect(table.getByRole('columnheader', { name: 'Seleccionar', exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Excursión', exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Estado de comisión', exact: true })).toBeVisible();
  await expect(table.getByText('15/10/2026', { exact: true })).toHaveCount(2);
  await expect(table.getByText('07/10/2026', { exact: true })).toBeVisible();
  await expect(table.getByText('19/09/2026', { exact: true })).toBeVisible();
  await expect(table.getByText('Sin fecha', { exact: true })).toHaveCount(2);
  for (const label of ['Pendiente', 'Lista para pagar', 'Pagada', 'Cancelada']) {
    const badge = table.locator('[data-slot="badge"]').filter({ hasText: label });
    await expect(badge).toBeVisible();
    await expect(badge).toHaveCSS('border-top-width', '0px');
    await expect(badge).toHaveCSS('font-size', '12px');
    expect(await badge.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  }
  await expect(table.getByText('Sin informar', { exact: true })).toHaveCount(2);
  await expect(table.getByText('Por completar', { exact: true })).toBeVisible();
  await expect(table).not.toContainText(/accrued|pending|cancelled|NaN|Invalid Date/);
  const checkbox = table.getByRole('checkbox').first();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('admin_comisiones_fechas_estados.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Dashboard uses a Spanish range calendar and shows dates and time consistently', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/e2e/admin-design');
  await expect(page.getByLabel('Indicadores del período')).toBeVisible();
  await expect(page.locator('input[type="date"], input[type="datetime-local"], input[type="time"]')).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Período del Dashboard' });
  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'Elegir período' });
  await expect(calendar).toBeVisible();
  await calendar.getByRole('combobox').nth(1).selectOption('2026');
  await calendar.getByRole('combobox').nth(0).selectOption('9');
  await calendar.getByRole('button', { name: /15 de octubre de 2026/ }).click();
  await calendar.getByRole('button', { name: /20 de octubre de 2026/ }).click();
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('admin_dashboard_datepicker.png'), fullPage: true });
  await calendar.getByRole('button', { name: 'Usar fechas', exact: true }).click();
  await expect(trigger).toHaveText('15/10/2026 — 20/10/2026');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('.dash-data-footer')).toContainText('15/10/2026 — 20/10/2026');
  await expect(page.locator('.dash-data-footer')).not.toContainText(/a\.\s*m\.|p\.\s*m\.|AM|PM/);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(calendar).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(calendar).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('shared datepicker preserves validation, allowed dates, form values and 24-hour time', async ({ page }) => {
  await page.goto('/e2e/admin-design?screen=datepickers');
  await page.getByRole('button', { name: 'Probar formulario', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Elegir fecha', exact: true });
  await expect(calendar).toBeVisible();
  await expect(page.getByLabel('Valores de prueba')).toHaveText('');
  await expect(calendar.getByRole('button', { name: /12 de octubre de 2026/ })).toBeDisabled();
  await expect(calendar.getByRole('button', { name: /21 de octubre de 2026/ })).toBeDisabled();
  await calendar.getByRole('button', { name: /15 de octubre de 2026/ }).click();
  await expect(page.getByRole('button', { name: 'Fecha obligatoria', exact: true })).toHaveText('15/10/2026');
  await page.getByRole('combobox', { name: 'Horario de retiro: hora', exact: true }).selectOption('23');
  await page.getByRole('combobox', { name: 'Horario de retiro: minutos', exact: true }).selectOption('45');
  await page.getByRole('button', { name: 'Probar formulario', exact: true }).click();
  await expect(page.getByLabel('Valores de prueba')).toHaveText('2026-10-15 23:45');
  await page.getByRole('button', { name: 'Restablecer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fecha obligatoria', exact: true })).toHaveText('DD/MM/AAAA');
});

test('datepickers open inside financial dialogs without breaking focus or optional clearing', async ({ page }) => {
  await page.goto('/e2e/admin-design?screen=finance');
  await page.getByRole('button', { name: 'Registrar pago a proveedor', exact: true }).click();
  await page.getByRole('button', { name: 'Fecha del movimiento', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Elegir fecha', exact: true });
  await expect(calendar).toBeVisible();
  await calendar.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fecha del movimiento', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
});

test('payment tasks constrain parties and reset forms without mixing payment concepts', async ({ page }) => {
  await page.goto('/e2e/admin-design?screen=finance');
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Registrar pago a proveedor', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Pago a proveedor', exact: true })).toBeVisible();
  const supplier = dialog.getByRole('combobox', { name: 'Proveedor del pago', exact: true });
  await expect(supplier).not.toContainText('Hotel Lago Austral');
  await supplier.selectOption('fixture-p1');
  await dialog.getByRole('combobox', { name: 'Reserva del movimiento', exact: true }).selectOption('fixture-r1');
  const amount = dialog.getByRole('spinbutton', { name: 'Importe del movimiento', exact: true });
  await expect(amount).toHaveValue('31000');
  await expect(amount).toHaveAttribute('max', '31000');
  await amount.fill('40000');
  expect(await amount.evaluate((el) => (el as HTMLInputElement).validity.rangeOverflow)).toBe(true);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Pagos realizados', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('Pago a proveedor');
  await expect(page.locator('tbody')).not.toContainText('Pago a hotel');
  await page.getByRole('button', { name: 'Pagos a hoteles', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar pago a hotel', exact: true }).click();
  const hotel = dialog.getByRole('combobox', { name: 'Hotel del movimiento', exact: true });
  await expect(hotel).toHaveValue('');
  await expect(hotel).not.toContainText('Navegaciones del Sur');
  await expect(amount).toHaveValue('');
  await hotel.selectOption('fixture-h3');
  await dialog.getByRole('combobox', { name: 'Reserva del movimiento', exact: true }).selectOption('fixture-r2');
  await expect(amount).toHaveValue('15100');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Pagos de hoteles a Baftravel', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar pago de hotel', exact: true }).click();
  await hotel.selectOption('fixture-h1');
  await dialog.getByRole('combobox', { name: 'Reserva del movimiento', exact: true }).selectOption('fixture-r0');
  await expect(amount).toHaveValue('55000');
  await expect(dialog.getByRole('button', { name: 'Confirmar cobro', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Pagos recibidos', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('Pago de hotel a Baftravel');
  await expect(page.locator('tbody')).not.toContainText('Pago a proveedor');
});

test('hotel balances lead to the matching settlement and offsets stay with the same hotel', async ({ page }, testInfo) => {
  await page.goto('/e2e/admin-design?screen=finance');
  await page.getByRole('button', { name: 'Balance Hotel / Baftravel', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Hotel Lago Austral' });
  await row.getByRole('button', { name: 'Ver liquidación', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Liquidaciones Baftravel', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Hotel', exact: true })).toHaveValue('fixture-h1');
  const settlement = page.getByRole('row').filter({ hasText: 'DEMO-1003' });
  await settlement.getByRole('button', { name: 'Compensar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Compensación con hotel', exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Hotel del movimiento', exact: true })).toHaveValue('fixture-h1');
  await expect(dialog.getByRole('combobox', { name: 'Reserva a compensar', exact: true })).not.toContainText('DEMO-1001');
  await expect(dialog.getByRole('combobox', { name: 'Medio del movimiento', exact: true })).toHaveCount(0);
  await expect(dialog).toContainText('sin entregar dinero');
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('admin_pagos_liquidacion_dialog.png'), fullPage: true });
});

test('payment receipts are files only with Spanish controls and no editable URL', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/e2e/admin-design?screen=finance');
  await page.getByRole('button', { name: 'Registrar pago a proveedor', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('input[type="url"]')).toHaveCount(0);
  await expect(dialog).not.toContainText(/Enlace al comprobante|Choose File|No file chosen/);
  const input = dialog.locator('input[type="file"]');
  await expect(input).toHaveCSS('display', 'none');
  await expect(dialog.getByRole('button', { name: 'Seleccionar archivo', exact: true })).toBeVisible();
  await input.setInputFiles({ name: 'pago_proveedor.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nComprobante de prueba') });
  await expect(dialog.getByText('pago_proveedor.pdf', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Seleccionado en vista de prueba, sin subir', { exact: true })).toBeVisible();
  await readyForScreenshot(page);
  await dialog.screenshot({ path: testInfo.outputPath('admin_comprobante_sin_enlace.png') });
  await dialog.getByRole('button', { name: 'Quitar pago_proveedor.pdf', exact: true }).click();
  await expect(dialog.getByText('pago_proveedor.pdf', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
});

test('dropzone validates formats and size, supports dragging, and shows progress, errors and retry in Spanish', async ({ page }) => {
  await page.goto('/e2e/admin-design?screen=uploads');
  const alert = page.locator('.admin-file-picker').getByRole('alert');
  const input = page.locator('input[type="file"][aria-label="Comprobante de prueba"]');
  await input.setInputFiles({ name: 'programa.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') });
  await expect(alert).toContainText('formato no está permitido');
  await input.setInputFiles({ name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(alert).toContainText('máximo de 5 MB');
  await input.setInputFiles({ name: 'vacio.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) });
  await expect(alert).toContainText('vacío');
  await expect(page.getByRole('button', { name: 'Completar prueba', exact: true })).toBeDisabled();
  const zone = page.getByRole('group', { name: 'Comprobante de prueba', exact: true });
  await zone.evaluate((element) => { const data = new DataTransfer(); data.items.add(new File(['%PDF-1.4\nPrueba'], 'arrastrado.pdf', { type: 'application/pdf' })); element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: data })); });
  await expect(page.getByText('Subiendo comprobante de prueba…', { exact: true })).toBeVisible();
  await expect(zone.getByRole('button', { name: 'Seleccionar archivo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Completar prueba', exact: true }).click();
  await expect(page.getByText('Adjunto de prueba, sin subir a ningún servidor', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Quitar arrastrado.pdf', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Simular un error', exact: true }).check();
  await input.setInputFiles({ name: 'reintento.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nPrueba') });
  await page.getByRole('button', { name: 'Completar prueba', exact: true }).click();
  await expect(alert).toContainText('No se pudo adjuntar');
  await page.getByRole('checkbox', { name: 'Simular un error', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await page.getByRole('button', { name: 'Completar prueba', exact: true }).click();
  await expect(page.getByText('Adjunto de prueba, sin subir a ningún servidor', { exact: true })).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test('file selection works with a keyboard and independent image pickers on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/admin-design?screen=uploads');
  const zone = page.getByRole('group', { name: 'Comprobante de prueba', exact: true });
  await zone.getByRole('button', { name: 'Seleccionar archivo', exact: true }).focus();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'comprobante_con_un_nombre_largo_para_comprobar_que_no_desborda.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nPrueba') });
  await page.getByRole('button', { name: 'Completar prueba', exact: true }).click();
  await expect(page.getByText('Adjunto de prueba, sin subir a ningún servidor', { exact: true })).toBeVisible();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlPAAAAAASUVORK5CYII=', 'base64');
  await page.locator('input[type="file"][aria-label="Seleccionar imágenes de tarjeta"]').setInputFiles({ name: 'tarjeta.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('Imagen 1', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Imagen de portada', { exact: true })).toHaveCount(0);
  await page.locator('input[type="file"][aria-label="Seleccionar imagen de portada"]').setInputFiles({ name: 'portada.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('Imagen de portada', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('body')).not.toContainText(/Choose File|No file chosen/);
});

test('seller hotel uses a select of all existing active hotels without free text on desktop and mobile', async ({ page }, testInfo) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/e2e/admin-design?screen=manual-reservation');
    await page.getByRole('button', { name: 'Hotel', exact: true }).first().click();
    const select = page.getByRole('combobox', { name: 'Hotel que realizó la venta', exact: true });
    await expect(select).toBeEnabled();
    await expect(select).toHaveValue('');
    await expect(select).toHaveAttribute('required', '');
    await expect(select.locator('option')).toHaveCount(12);
    await expect(select.locator('option').filter({ hasText: 'Hotel inactivo de prueba' })).toHaveCount(0);
    await expect(select.locator('option').filter({ hasText: 'Proveedor de prueba' })).toHaveCount(0);
    const labels = await select.locator('option:not([value=""])').allTextContents();
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'es')));
    await expect(page.getByRole('textbox', { name: 'Buscar hotel vendedor', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cambiar hotel vendedor', exact: true })).toHaveCount(0);
    await select.selectOption('extra-8');
    await page.getByRole('combobox', { name: 'Medio de pago de la reserva', exact: true }).selectOption('cash');
    await select.focus();
    await expect(select).toBeFocused();
    await expect(select).toHaveValue('extra-8');
    await expect(page.getByRole('complementary', { name: 'Resumen de venta y retiro' })).toContainText('Hotel de prueba 9');
    await page.getByRole('button', { name: 'Probar reserva sin guardar', exact: true }).click();
    const output = page.getByLabel('Datos de reserva de prueba');
    await expect(output).toContainText('"sellerHotelId":"extra-8"');
    await expect(output).toContainText('"pickupHotelId":""');
    await expect(output).toContainText('"pickupAddress":""');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await readyForScreenshot(page);
      await page.locator('#reservation-pickup').screenshot({ path: testInfo.outputPath('hotel_vendedor_selector_datos_de_prueba.png') });
    }
  }
});

test('hotel seller and pickup are independent without recording a collection or changing the sales channel', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/e2e/admin-design?screen=manual-reservation');
  const channel = page.getByRole('combobox', { name: 'Canal de venta', exact: true });
  await expect(channel.locator('option')).toHaveText(['Front', 'Web', 'WhatsApp', 'Amigo', 'Liberado']);
  await channel.selectOption('whatsapp');
  await page.getByRole('button', { name: 'Hotel', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Hotel que realizó la venta', exact: true }).selectOption('hotel-0');
  await page.getByRole('combobox', { name: 'Medio de pago de la reserva', exact: true }).selectOption('transfer');
  await expect(channel).toHaveValue('whatsapp');
  await expect(page.getByRole('button', { name: 'En ese mismo hotel', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Otro', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'Hotel de retiro', exact: true })).toHaveCount(0);
  const summary = page.getByRole('complementary', { name: 'Resumen de venta y retiro' });
  await expect(summary).toContainText('Hotel Lago Austral');
  await expect(page.getByRole('button', { name: 'Todavía no', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Medio de cobro', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sí, registrar cobro', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Probar reserva sin guardar', exact: true }).click();
  const output = page.getByLabel('Datos de reserva de prueba');
  await expect(output).toContainText('"sellerHotelId":"hotel-0"');
  await expect(output).toContainText('"pickupHotelId":""');
  await expect(output).toContainText('"initialPayment":{"method":"pending"}');
  await expect(output).toContainText('"channel":"whatsapp"');
  await page.getByRole('button', { name: 'Hotel', exact: true }).last().click();
  await page.getByRole('combobox', { name: 'Hotel de retiro', exact: true }).selectOption('hotel-1');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await readyForScreenshot(page);
  await page.screenshot({ path: testInfo.outputPath('admin_reserva_hotel_flujo.png'), fullPage: true });
  await page.getByRole('button', { name: 'Probar reserva sin guardar', exact: true }).click();
  await expect(output).toContainText('"sellerHotelId":"hotel-0"');
  await expect(output).toContainText('"pickupHotelId":"hotel-1"');
  await page.getByRole('button', { name: 'Baftravel', exact: true }).first().click();
  await expect(page.getByRole('combobox', { name: 'Hotel de retiro', exact: true })).toHaveValue('hotel-1');
  await expect(page.getByRole('button', { name: 'Todavía no', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'En ese mismo hotel', exact: true })).toHaveCount(0);
  await expect(channel).toHaveValue('whatsapp');
});

test('manual reservation preserves explicit no-payment, optional details and mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/admin-design?screen=manual-reservation');
  await page.getByRole('combobox', { name: 'Canal de venta', exact: true }).selectOption('released');
  await page.getByRole('button', { name: 'Probar reserva sin guardar', exact: true }).click();
  await expect(page.getByLabel('Datos de reserva de prueba')).toContainText('"method":"pending"');
  await expect(page.getByLabel('Datos de reserva de prueba')).toContainText('"channel":"released"');
  await expect(page.getByRole('combobox', { name: 'Horario de retiro: hora', exact: true })).toBeVisible();
  await expect(page.getByText('Detalles opcionales:', { exact: false })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Horario de retiro: hora', exact: true }).selectOption('07');
  await page.getByRole('combobox', { name: 'Horario de retiro: minutos', exact: true }).selectOption('30');
  await page.getByRole('button', { name: 'Probar reserva sin guardar', exact: true }).click();
  await expect(page.getByLabel('Datos de reserva de prueba')).toContainText('"pickupTime":"07:30"');
  await expect(page.getByLabel('Datos de reserva de prueba')).toContainText('"automaticEmails":true');
  await expect(page.getByText('Servicio realizado', { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('manual hotel pickup requires an independent selection and changing the seller never assigns it', async ({ page }) => {
  await page.goto('/e2e/admin-design?screen=manual-reservation');
  await page.getByRole('button', { name: 'Hotel', exact: true }).first().click();
  await page.getByRole('button', { name: 'Probar reserva sin guardar', exact: true }).click();
  await expect(page.getByLabel('Datos de reserva de prueba')).toHaveText('');
  await expect(page.getByRole('alert').filter({ hasText: 'Seleccioná el hotel vendedor' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Hotel que realizó la venta', exact: true }).selectOption('hotel-0');
  await page.getByRole('combobox', { name: 'Medio de pago de la reserva', exact: true }).selectOption('cash');
  await expect(page.getByRole('textbox', { name: 'Buscar hotel vendedor', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Probar reserva sin guardar', exact: true }).click();
  await expect(page.getByLabel('Datos de reserva de prueba')).toContainText('"initialPayment":{"method":"pending"}');
  const before = await page.getByLabel('Datos de reserva de prueba').textContent();
  await page.getByRole('button', { name: 'Hotel', exact: true }).last().click();
  await expect(page.getByRole('combobox', { name: 'Hotel de retiro', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Probar reserva sin guardar', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Seleccioná el hotel de retiro' })).toBeVisible();
  await expect(page.getByLabel('Datos de reserva de prueba')).toHaveText(before || '');
  await page.getByRole('combobox', { name: 'Hotel que realizó la venta', exact: true }).selectOption('hotel-1');
  await page.getByRole('combobox', { name: 'Medio de pago de la reserva', exact: true }).selectOption('cash');
  await expect(page.getByRole('combobox', { name: 'Hotel de retiro', exact: true })).toHaveValue('');
  await page.getByRole('combobox', { name: 'Hotel de retiro', exact: true }).selectOption('hotel-0');
  await expect(page.getByRole('combobox', { name: 'Medio de cobro', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Probar reserva sin guardar', exact: true }).click();
  await expect(page.getByLabel('Datos de reserva de prueba')).toContainText('"sellerHotelId":"hotel-1"');
  await expect(page.getByLabel('Datos de reserva de prueba')).toContainText('"pickupHotelId":"hotel-0"');
  await expect(page.getByLabel('Datos de reserva de prueba')).toContainText('"method":"pending"');
});

test('seller changes preserve a custom pickup address and time, and a hotel pickup can explicitly match the seller', async ({ page }, testInfo) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/e2e/admin-design?screen=manual-reservation');
    await page.getByRole('textbox', { name: 'Punto de encuentro', exact: false }).fill('Terminal de ómnibus');
    await page.getByRole('combobox', { name: 'Horario de retiro: hora', exact: true }).selectOption('09');
    await page.getByRole('combobox', { name: 'Horario de retiro: minutos', exact: true }).selectOption('15');
    await page.getByRole('button', { name: 'Hotel', exact: true }).first().click();
    const seller = page.getByRole('combobox', { name: 'Hotel que realizó la venta', exact: true });
    await seller.selectOption('hotel-0');
    await page.getByRole('combobox', { name: 'Medio de pago de la reserva', exact: true }).selectOption('transfer');
    await seller.selectOption('hotel-1');
    await expect(page.getByRole('textbox', { name: 'Punto de encuentro', exact: false })).toHaveValue('Terminal de ómnibus');
    await page.getByRole('button', { name: 'Probar reserva sin guardar', exact: true }).click();
    const output = page.getByLabel('Datos de reserva de prueba');
    await expect(output).toContainText('"pickupAddress":"Terminal de ómnibus"');
    await expect(output).toContainText('"pickupTime":"09:15"');
    await expect(output).toContainText('"pickupHotelId":""');
    await page.getByRole('button', { name: 'Baftravel', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Punto de encuentro', exact: false })).toHaveValue('Terminal de ómnibus');
    await page.getByRole('button', { name: 'Hotel', exact: true }).last().click();
    const pickup = page.getByRole('combobox', { name: 'Hotel de retiro', exact: true });
    await pickup.selectOption('hotel-0');
    await page.getByRole('button', { name: 'Hotel', exact: true }).first().click();
    await seller.selectOption('hotel-1');
    await expect(pickup).toHaveValue('hotel-0');
    if (width === 1440) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await readyForScreenshot(page);
      await page.locator('#reservation-pickup').screenshot({ path: testInfo.outputPath('hotel_vendedor_y_retiro_independientes.png') });
    }
    await seller.selectOption('hotel-0');
    await page.getByRole('combobox', { name: 'Medio de pago de la reserva', exact: true }).selectOption('transfer');
    await page.getByRole('button', { name: 'Hotel', exact: true }).last().click();
    await expect(pickup).toHaveValue('hotel-0');
    await page.getByRole('button', { name: 'Probar reserva sin guardar', exact: true }).click();
    await expect(output).toContainText('"sellerHotelId":"hotel-0"');
    await expect(output).toContainText('"pickupHotelId":"hotel-0"');
    await expect(output).toContainText('"pickupTime":"09:15"');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
