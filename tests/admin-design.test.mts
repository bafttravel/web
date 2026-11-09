import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { adminNavigation, canonicalAdminPath, isAdminNavigationActive } from '../lib/admin/navigation.ts';
import { referralDateLabel, referralStatus, referralStatuses } from '../lib/admin/referrals.ts';
import { adminTimeLabel, adminDateTimeLabel, dateOnly, dateOnlyKey, adminReportDate } from '../lib/admin/dates.ts';
import { paymentSections, paymentKindForView, paymentPartyKind, paymentLimit, parsePaymentView } from '../lib/admin/payments.ts';
import { fileSizeLabel, fileRejectionLabel, RECEIPT_MAX_SIZE, RECEIPT_ACCEPT } from '../lib/admin/files.ts';
import { salesChannels, salesChannelLabel } from '../lib/admin/sales-channels.ts';
import { manualReservationPaymentFields } from '../lib/admin/manual-reservation.ts';

test('manual creation explicitly has no collection and editing never resets stored payments', () => {
  assert.deepEqual(manualReservationPaymentFields(false), { initialPayment: { method: 'pending' } });
  assert.deepEqual(manualReservationPaymentFields(true), {});
  const existing = { initialPayment: { method: 'cash', amount: 5000 }, payments: [{ amount: 5000 }], paidAt: '2026-11-06' };
  assert.deepEqual({ ...existing, ...manualReservationPaymentFields(true) }, existing);
  const flow = readFileSync('components/admin/ManualReservationFlow.tsx', 'utf8');
  assert.doesNotMatch(flow, /reservation-payment|¿Se recibió dinero|registrar cobro|onPaymentChange|InitialCollection/);
  const form = readFileSync('components/admin/AdminReservaForm.tsx', 'utf8');
  assert.doesNotMatch(form, /href="#reservation-payment"|admin-reservation-balance|initialPartial/);
  assert.match(form, /manualReservationPaymentFields\(!!initialData\)/);
  const detail = readFileSync('app/admin/reservas/[id]/page.tsx', 'utf8');
  assert.match(detail, /computeVentaFinance/);
  assert.match(detail, /paymentRows\.map/);
});
import { EMPTY_RESERVATION_OPERATIONS } from '../lib/operations/types.ts';
import { reservationOperationsSchema } from '../lib/operations/schemas.ts';

test('retired room field is neither requested nor displayed or exported', () => {
  assert.equal('room' in EMPTY_RESERVATION_OPERATIONS, false);
  const parsed = reservationOperationsSchema.parse({ ...EMPTY_RESERVATION_OPERATIONS, room: 'LEGACY-ROOM-SECRET' });
  assert.equal('room' in parsed, false);
  for (const file of [
    'components/admin/ManualReservationFlow.tsx', 'components/admin/ReservationOperationsFields.tsx',
    'components/admin/ReservationOperationsPanel.tsx', 'app/admin/reservas/[id]/page.tsx',
    'lib/vouchers/model.ts', 'lib/operations/email-content.ts', 'lib/operations/lifecycle.ts', 'lib/emails/reserva-confirmada.ts',
  ]) assert.doesNotMatch(readFileSync(file, 'utf8'), /habitaci[oó]n|\broom\b|\broomType\b/i, file);
  assert.match(readFileSync('app/api/admin/reservation-operations/route.ts', 'utf8'), /'room' in previous \? \{ room: previous.room \}/, 'editing other data preserves historical storage');
});

test('reservation detail has only one additional toggle and one form, independently of base subtotal', () => {
  const code = readFileSync('app/admin/reservas/[id]/page.tsx', 'utf8');
  for (const pattern of [/<AddonDisclosureButton /g, /id="sale-addon-form"/g, /<Label>Buscar adicional<\/Label>/g, /onClick=\{handleAddAddon\}/g]) assert.equal((code.match(pattern) ?? []).length, 1);
  assert.doesNotMatch(code, /extras.length > 0 \|\| typeof r.baseSubtotalAmount/);
});

test('manual creation keeps pickup time visible, removes optional logistics and embeds one review panel', () => {
  const flow = readFileSync('components/admin/ManualReservationFlow.tsx', 'utf8');
  assert.doesNotMatch(flow, /<details|Detalles opcionales|Dieta \/ alergias|Enviar confirmación y voucher|value\.diet|value\.notes|value\.automaticEmails/);
  assert.match(flow, /<AdminTimePicker id="reservation-pickup-time"/);
  const form = readFileSync('components/admin/AdminReservaForm.tsx', 'utf8');
  assert.match(form, /<ManualReservationFlow embedded/);
  assert.match(form, /dateOptions.length > 1/);
  assert.match(form, /allowedDates=\{dateOptions.length \? dateOptions : undefined\}/);
  assert.equal(EMPTY_RESERVATION_OPERATIONS.automaticEmails, true);
  assert.match(readFileSync('components/admin/ManualReservationFlow.tsx', 'utf8'), /¿Quién realizó la venta\?/);
  assert.match(readFileSync('components/admin/ManualReservationFlow.tsx', 'utf8'), /Medio de pago de la reserva/);
});

test('manual seller selection never assigns or clears pickup fields', () => {
  const flow = readFileSync('components/admin/ManualReservationFlow.tsx', 'utf8');
  assert.doesNotMatch(flow, /'same'|setPickupMode|En ese mismo hotel|Otro hotel|En un hotel/);
  assert.match(flow, /const pickupMode = value.pickupType/);
  assert.match(flow, /onChange\(\{ \.\.\.value, sellerHotelId: hotel.id \}\)/);
  assert.match(flow, /onChange\(\{ \.\.\.value, sellerHotelId: '', commissionMethod: '' \}\)/);
  assert.match(flow, />Hotel<\/button>/);
  assert.match(flow, />Otro<\/button>/);
});

test('admin navigation has a single Dashboard and no duplicated or legacy redirect destinations', () => {
  const items = adminNavigation.flatMap((g) => [...g.items]);
  assert.equal(items.filter((i) => i.href === '/admin').length, 1);
  assert.equal(new Set(items.map((i) => i.href)).size, items.length);
  assert.ok(!items.some((i) => String(i.href) === '/admin/blog'));
  assert.equal(items.find((i) => i.href === '/admin/proveedores')?.label, 'Proveedores');
  assert.equal(items.find((i) => i.href === '/admin/pagos')?.label, 'Pagos');
  assert.ok(!items.some((i) => String(i.href) === '/admin/finanzas'));
  for (const item of items) {
    assert.ok(existsSync(`app${item.href}/page.tsx`), `Missing destination: ${item.href}`);
    assert.notEqual(String(item.href), '/admin/reportes');
    assert.ok(!['/admin/stock', '/admin/butacas', '/admin/plantillas-micro'].includes(item.href));
  }
});
test('reservation and excursion aliases preserve one navigation identity', () => {
  assert.equal(canonicalAdminPath('/admin/reservas/test'), '/admin/ventas/test');
  assert.equal(isAdminNavigationActive('/admin/reservas/nueva', '/admin/ventas'), true);
  assert.equal(isAdminNavigationActive('/admin/ventas-extra', '/admin/ventas'), false);
  assert.equal(isAdminNavigationActive('/admin/excursiones/test', '/admin/paquetes'), true);
  assert.equal(isAdminNavigationActive('/admin/finanzas', '/admin'), false);
  assert.equal(canonicalAdminPath('/admin/prestadores'), '/admin/proveedores');
  assert.equal(isAdminNavigationActive('/admin/prestadores', '/admin/proveedores'), true);
  assert.match(readFileSync('app/admin/prestadores/page.tsx', 'utf8'), /redirect\('\/admin\/proveedores'\)/);
  assert.equal(canonicalAdminPath('/admin/finanzas'), '/admin/pagos');
  assert.equal(isAdminNavigationActive('/admin/finanzas', '/admin/pagos'), true);
  assert.equal(canonicalAdminPath('/admin/finanzas-extra'), '/admin/finanzas-extra');
  assert.match(readFileSync('app/admin/finanzas/page.tsx', 'utf8'), /redirect\('\/admin\/pagos'\)/);
});
test('former reports route redirects, while public component styles remain unchanged', () => {
  assert.match(readFileSync('app/admin/reportes/page.tsx', 'utf8'), /redirect\('\/admin'\)/);
  const css = readFileSync('app/admin/workspace.css', 'utf8');
  assert.match(css, /--admin-primary: #0f1f52/);
  assert.match(css, /body\[data-admin-ui='true'\]/);
  assert.match(readFileSync('components/ui/button.tsx', 'utf8'), /bg-\[#F6C000\]/);
});
test('admin typography uses one readable scale without smaller mobile overrides', () => {
  const css = readFileSync('app/admin/workspace.css', 'utf8');
  for (const [token, size] of Object.entries({ title: 24, section: 18, body: 14, caption: 12, metric: 28 })) {
    assert.match(css, new RegExp(`--admin-text-${token}: ${size}px`));
  }
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])px/);
  assert.doesNotMatch(css, /\[class\*='text-'\]/, 'color utilities must not reset typography');
  for (const role of ['admin-section-title', 'admin-caption', 'admin-eyebrow', 'admin-metric']) assert.ok(css.includes(`.admin-content .${role}`) || css.includes(`.${role})`));
  const form = readFileSync('components/admin/AdminReservaForm.tsx', 'utf8');
  assert.equal((form.match(/role="heading" aria-level=\{2\} className="admin-section-title/g) ?? []).length, 3);
});

test('referral dates use Argentine format for Firestore, serialized timestamps and ISO dates', () => {
  const seconds = Date.parse('2026-10-15T12:00:00Z') / 1000;
  for (const value of [{ seconds }, { _seconds: seconds }, { toDate: () => new Date(seconds * 1000) }, new Date(seconds * 1000), seconds * 1000, '2026-10-15T12:00:00Z', '2026-10-15']) {
    assert.equal(referralDateLabel(value), '15/10/2026');
  }
  assert.equal(referralDateLabel('2026-10-15T01:00:00Z'), '14/10/2026');
  assert.equal(referralDateLabel({ seconds: 0 }), '31/12/1969');
});
test('invalid or missing referral dates never become the current date', () => {
  for (const value of [undefined, null, '', {}, 'invalid', '10/15/2026', '2026-02-31', '2026-02-31T12:00:00Z', new Date(NaN), { seconds: 'invalid' }, { toDate: () => { throw new Error('invalid'); } }]) {
    assert.equal(referralDateLabel(value), 'Sin fecha');
  }
});
test('referral states have Spanish labels and unknown states never leak internal codes', () => {
  assert.deepEqual(referralStatuses.map((s) => s.label), ['Pendiente', 'Lista para pagar', 'Pagada', 'Cancelada']);
  for (const status of referralStatuses) assert.equal(referralStatus(status.value).label, status.label);
  for (const value of [undefined, null, '', 'internal_status']) assert.equal(referralStatus(value).label, 'Sin informar');
});

test('admin datepickers preserve date-only values and reject impossible dates', () => {
  for (const key of ['2026-11-06', '2024-02-29', '1991-04-03']) assert.equal(dateOnlyKey(dateOnly(key)), key);
  for (const key of ['2026-02-29', '2026-02-31', '06/11/2026', '', 'sin-fecha']) assert.equal(dateOnly(key), undefined);
});
test('admin times are always 24-hour Argentine time, including midnight', () => {
  assert.equal(adminTimeLabel('2026-11-06T03:00:00Z'), '00:00');
  assert.equal(adminTimeLabel('2026-11-06T18:45:00Z'), '15:45');
  assert.equal(adminTimeLabel('23:59'), '23:59');
  assert.equal(adminTimeLabel('24:00'), 'Sin hora');
  assert.equal(adminDateTimeLabel('2026-11-06T01:30:00Z'), '05/11/2026 22:30');
  assert.equal(adminDateTimeLabel(undefined), 'Sin fecha');
  assert.equal(adminReportDate('Fecha', '2026-11-06'), '06/11/2026');
  assert.equal(adminReportDate('Mes', '2026-11'), '11/2026');
  assert.equal(adminReportDate('Reserva', '2026-11-06'), '2026-11-06');
});
test('all administrative date and time controls use shared pickers, not native date inputs', () => {
  function check(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) check(path);
      else if (entry.name.endsWith('.tsx')) {
        const source = readFileSync(path, 'utf8');
        assert.doesNotMatch(source, /type\s*=\s*["'](?:date|datetime-local|time)["']/, path);
        assert.doesNotMatch(source, /ArgentineDateInput/, path);
      }
    }
  }
  check('app/admin'); check('components/admin');
});

test('payments use the familiar five tasks and keep operations separate', () => {
  assert.deepEqual(paymentSections.map((s) => s.label), ['Pagos a proveedores', 'Pagos a hoteles', 'Pagos de hoteles a Baftravel', 'Balance Hotel / Baftravel', 'Liquidaciones Baftravel']);
  assert.equal(paymentKindForView('proveedores'), 'provider_payment');
  assert.equal(paymentPartyKind('proveedores'), 'provider');
  assert.equal(paymentKindForView('hoteles'), 'hotel_payment');
  assert.equal(paymentKindForView('cobros-hoteles'), 'hotel_receipt');
  assert.equal(paymentPartyKind('liquidaciones'), 'hotel');
  assert.equal(paymentKindForView('balance'), null);
  assert.equal(paymentKindForView('caja'), null);
  assert.equal(parsePaymentView('liquidaciones'), 'liquidaciones');
  for (const value of [undefined, '', 'invalid', ['hoteles']]) assert.equal(parsePaymentView(value), 'proveedores');
});
test('task-specific payment amounts preserve payable, receivable and offset limits', () => {
  const balance = { payable: 12000, receivable: 5000 };
  assert.equal(paymentLimit('provider_payment', balance), 12000);
  assert.equal(paymentLimit('hotel_payment', balance), 12000);
  assert.equal(paymentLimit('hotel_receipt', balance), 5000);
  assert.equal(paymentLimit('offset', balance), 5000);
  assert.equal(paymentLimit('offset', { payable: 0, receivable: 5000 }), 0);
});

test('administrative attachments use the shared library picker and never editable receipt links', () => {
  function check(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) check(path);
      else if (entry.name.endsWith('.tsx')) {
        const source = readFileSync(path, 'utf8');
        assert.doesNotMatch(source, /type\s*=\s*["']file["']/, `Native file input outside dropzone: ${path}`);
        assert.doesNotMatch(source, /value\s*=\s*\{[^}]*receiptUrl[^}]*\}/, `Editable receipt URL: ${path}`);
        assert.doesNotMatch(source, /Enlace al comprobante/i, path);
      }
    }
  }
  check('app/admin'); check('components/admin');
  const picker = readFileSync('components/admin/AdminFilePicker.tsx', 'utf8');
  assert.match(picker, /useDropzone/);
  assert.match(picker, /getInputProps/);
  assert.match(picker, /display: 'none'/);
  assert.match(picker, /type="button"/);
});
test('file validation messages and sizes stay Spanish and match receipt limits', () => {
  assert.equal(fileSizeLabel(512), '512 B');
  assert.equal(fileSizeLabel(1024), '1 KB');
  assert.equal(fileSizeLabel(RECEIPT_MAX_SIZE), '5 MB');
  assert.match(fileRejectionLabel('file-too-large', RECEIPT_MAX_SIZE), /5 MB/);
  assert.match(fileRejectionLabel('file-invalid-type'), /formato no está permitido/);
  assert.match(fileRejectionLabel('file-too-small'), /vacío/);
  assert.match(fileRejectionLabel('too-many-files', undefined, 3), /hasta 3 archivos/);
  assert.deepEqual(Object.keys(RECEIPT_ACCEPT), ['application/pdf', 'image/jpeg', 'image/png']);
});
test('manual channels separate origin from hotel seller and do not reinterpret old data', () => {
  assert.deepEqual(salesChannels.map((channel) => channel.label), ['Front', 'Web', 'WhatsApp', 'Amigo', 'Liberado']);
  assert.equal(EMPTY_RESERVATION_OPERATIONS.channel, 'front');
  assert.equal(salesChannelLabel('backoffice'), 'Administración (anterior)');
  assert.equal(salesChannelLabel('hotel'), 'Hotel (anterior)');
});
