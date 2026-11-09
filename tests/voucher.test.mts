import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { voucherData, voucherFilename } from '../lib/vouchers/model.ts';
import { voucherConditions, voucherIssuer } from '../lib/vouchers/conditions.ts';
import { renderVoucherPdf } from '../lib/vouchers/pdf.ts';
import { buildReservationVoucher } from '../lib/vouchers/server.ts';
import { buildVoucherReminder } from '../lib/vouchers/delivery.ts';
import { reminderHtml, reminderText } from '../lib/emails/voucher-reminder.ts';
import { calculateVoucherReminderSchedule, decideVoucherDelivery } from '../lib/vouchers/schedule.ts';

const source = {
  reservationCode: 'BAFT-5806', customerName: 'Ana María Righetti', packageTitle: 'Discovery C/T',
  date: '2027-01-17', people: 2, peopleAdults: 2, peopleMinors: 0,
  confirmedByName: 'Administradora de prueba', createdByName: 'Operador de prueba',
  operations: { pickupHotelName: 'Hosteria los Ñires', pickupTime: '07:30' },
};
const logo = readFileSync('public/images/logo.png');
function streams(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes); const raw = buffer.toString('latin1'); const result: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n/g)) {
    const end = raw.indexOf('endstream', match.index);
    try { result.push(inflateSync(buffer.subarray(match.index + match[0].length, end)).toString('latin1')); } catch { /* Image data is not a content stream. */ }
  }
  return result.join('\n');
}

test('voucher maps real counts, date, pickup and named actors without inventing missing data', () => {
  const data = voucherData(source);
  assert.equal(data.date, '17/01/2027'); assert.equal(data.time, '07:30');
  assert.equal(data.adults, '2'); assert.equal(data.minors, '0'); assert.equal(data.people, '2');
  assert.equal(data.customer, source.customerName); assert.equal(data.confirmedBy, source.confirmedByName);
  for (const missing of [{}, { people: 2 }, { people: 2, peopleAdults: 3, peopleMinors: 0 }]) {
    const legacy = voucherData(missing);
    assert.equal(legacy.adults, 'Sin informar'); assert.equal(legacy.minors, 'Sin informar');
    assert.equal(legacy.code, 'Sin código'); assert.equal(legacy.bookedBy, 'Sin informar');
    assert.equal(legacy.pickup, 'A confirmar'); assert.equal(legacy.time, 'A confirmar');
  }
  for (const date of ['2027-02-30', 'sin-fecha', 'invalid']) assert.equal(voucherData({ date }).date, 'A coordinar');
  assert.equal(voucherData({ operations: { pickupTime: '25:00' } }).time, 'A confirmar');
  assert.equal(voucherData({ operations: { pickupTime: '00:00' } }).time, '00:00');
  assert.equal(voucherData({ createdByAdmin: true, statusHistory: [{ status: 'reserved', actor: 'admin' }] }).confirmedBy, 'Administración');
  assert.equal(voucherData({ createdByAdmin: false }).bookedBy, 'Web');
  assert.equal(voucherData({ createdByAdmin: true, createdByVendorId: 'vendor1' }).bookedBy, 'Vendedor');
  assert.equal(voucherData({ status: 'cancelled' }).status, 'CANCELADA / CANCELLED');
});

test('PDF is a single Letter page with the new logo, full grid and every bilingual condition', async () => {
  const pdf = await buildReservationVoucher(source);
  const raw = Buffer.from(pdf.bytes).toString('latin1'); const text = streams(pdf.bytes);
  assert.ok(raw.startsWith('%PDF-')); assert.equal(pdf.filename, 'voucher-BAFT-5806.pdf');
  assert.equal((raw.match(/\/Type \/Page\b/g) ?? []).length, 1);
  assert.match(raw, /\/MediaBox \[0 0 612\. 792\.\]/);
  assert.match(raw, /\/Subtype \/Image/);
  for (const value of ['Dirigido a / To', 'Punto de retiro / Pick up', 'Servicios a prestar / Services to be rendered', 'DOCUMENTO NO VALIDO COMO FACTURA', 'Confirmó:', 'Reservó:', 'Disfrute su día / Have nice day', '17/01/2027', '07:30', source.customerName, source.packageTitle, source.confirmedByName, source.createdByName, ...Object.values(voucherIssuer)]) {
    // PDF literal strings escape parentheses.
    assert.ok(text.replace(/\\([()])/g, '$1').includes(value), `Missing PDF text: ${value}`);
  }
  for (const condition of voucherConditions) {
    assert.ok(text.includes(condition.esTitle)); assert.ok(text.includes(condition.enTitle));
  }
  assert.match(text, /24 hs antes/); assert.match(text, /100 %/); assert.match(text, /passport/);
});

test('long operational notes paginate without dropping the final conditions or exposing internal data', () => {
  const legacy = { ...source, operations: { ...source.operations, room: 'LEGACY-ROOM-SECRET', notes: 'Indicaciones largas de retiro. '.repeat(600) }, selectedSeats: ['A1', 'A2'] };
  const pdf = renderVoucherPdf(voucherData(legacy), logo);
  const raw = Buffer.from(pdf).toString('latin1'); const text = streams(pdf);
  assert.ok((raw.match(/\/Type \/Page\b/g) ?? []).length > 1);
  assert.match(text, /RESTRICTIONS FOR EXCURSIONS/); assert.match(text, /A1, A2/);
  assert.doesNotMatch(text, /LEGACY-ROOM-SECRET|Habitación|Room/);
  assert.equal(voucherFilename('../../x\r\nheader'), 'voucher-------x--header.pdf');
});

test('legacy room data is absent from both the voucher model and customer reminder', async () => {
  const legacy = { ...source, roomType: 'LEGACY-TYPE-SECRET', operations: { ...source.operations, room: 'LEGACY-ROOM-SECRET' } };
  assert.deepEqual(voucherData(legacy).details, []);
  const reminder = await buildVoucherReminder(legacy, { name: 'BAFT', email: 'contact@example.test', whatsapp: '' });
  assert.doesNotMatch(reminder.html + reminder.text + streams(reminder.attachments[0].content), /LEGACY-ROOM-SECRET|LEGACY-TYPE-SECRET|Habitación|Room/);
});

test('minimal reminder escapes customer data and promises the attached voucher without decorative panels', () => {
  const data = { customerName: '<script>test</script>', experienceTitle: 'Discovery C/T', dateFormatted: '17/01/2027', pickupTime: '07:30', reservationCode: 'BAFT-5806', lookupUrl: 'javascript:alert(1)' };
  const brand = { name: 'BAFT', email: 'contact@example.test', whatsapp: '+54 9 2966 701907' };
  const html = reminderHtml(data, brand); const text = reminderText(data, brand);
  assert.match(html, /&lt;script&gt;test&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>|linear-gradient|box-shadow|<table|javascript:/);
  assert.match(text, /adjuntamos el voucher/); assert.match(text, /07:30/); assert.match(text, /A confirmar/);
  assert.match(text, /BAFT-5806/); assert.match(text, /5492966701907/);
});

test('all reminder send paths forward generated attachments and ADMIN downloads the same server renderer', () => {
  for (const file of ['lib/sales/send-email-job.ts', 'app/api/cron/email/route.ts']) {
    const code = readFileSync(file, 'utf8');
    assert.match(code, /currentReservationEmail\(/); assert.match(code, /attachments/);
    assert.match(code, /El recordatorio no tiene una reserva asociada/);
  }
  assert.match(readFileSync('app/api/admin/emails/route.ts', 'utf8'), /sendEmailJobNow\(/);
  assert.match(readFileSync('lib/operations/email-content.ts', 'utf8'), /buildVoucherReminder\(r,/);
  assert.match(readFileSync('app/api/admin/reservas/[id]/voucher/route.ts', 'utf8'), /guardAdmin\(request\)/);
  assert.match(readFileSync('app/api/admin/reservas/[id]/voucher/route.ts', 'utf8'), /buildReservationVoucher\(snap.data\(\)!\)/);
  assert.doesNotMatch(readFileSync('components/admin/ReservationOperationsPanel.tsx', 'utf8'), /import\('jspdf'\)/);
});

test('reminder attachment and exported voucher contain the same PDF data, refreshed at delivery', async () => {
  const brand = { name: 'BAFT', email: 'contact@example.test', whatsapp: '5492966701907' };
  const direct = await buildReservationVoucher(source);
  const reminder = await buildVoucherReminder(source, brand);
  assert.equal(reminder.attachments.length, 1);
  assert.equal(reminder.attachments[0].filename, direct.filename);
  assert.equal(streams(reminder.attachments[0].content), streams(direct.bytes));
  const updated = await buildVoucherReminder({ ...source, operations: { pickupHotelName: 'Otro hotel', pickupTime: '08:45' } }, brand);
  assert.match(updated.text, /Otro hotel/); assert.match(updated.text, /08:45/);
  assert.match(streams(updated.attachments[0].content), /Otro hotel/); assert.match(streams(updated.attachments[0].content), /08:45/);
});

test('voucher reminder is calculated 48 hours before the local departure time', () => {
  const nowMs = Date.parse('2027-01-14T10:30:00.000Z');
  const result = calculateVoucherReminderSchedule({ date: '2027-01-17', departureTime: '07:30', nowMs });
  assert.equal(result.kind, 'scheduled');
  if (result.kind !== 'scheduled') return;
  assert.equal(result.departureAtMs, Date.parse('2027-01-17T10:30:00.000Z'));
  assert.equal(result.reminderAtMs, Date.parse('2027-01-15T10:30:00.000Z'));
  assert.equal(result.nextAttemptAtMs, result.reminderAtMs);
  assert.equal(result.timeZone, 'America/Argentina/Buenos_Aires');

  const defaultTime = calculateVoucherReminderSchedule({ date: '2027-01-17', nowMs });
  assert.equal(defaultTime.kind, 'scheduled');
  if (defaultTime.kind === 'scheduled') {
    assert.equal(defaultTime.departureTime, '09:00');
    assert.equal(defaultTime.departureAtMs, Date.parse('2027-01-17T12:00:00.000Z'));
  }
});

test('last-minute departures send at once only while the excursion is still in the future', () => {
  const nowMs = Date.parse('2027-01-17T08:00:00.000Z');
  const result = calculateVoucherReminderSchedule({ date: '2027-01-17', departureTime: '07:30', nowMs });
  assert.equal(result.kind, 'scheduled');
  if (result.kind === 'scheduled') assert.equal(result.nextAttemptAtMs, nowMs);
  assert.equal(calculateVoucherReminderSchedule({ date: '2027-01-17', departureTime: '07:30', nowMs: Date.parse('2027-01-17T10:30:00.000Z') }).kind, 'skipped');
});

test('invalid, missing and past departures are never scheduled', () => {
  const nowMs = Date.parse('2027-01-14T10:30:00.000Z');
  assert.deepEqual(calculateVoucherReminderSchedule({ date: 'sin-fecha', nowMs }), { kind: 'skipped', reason: 'missing_departure_date' });
  assert.equal(calculateVoucherReminderSchedule({ date: '2027-02-30', nowMs }).kind, 'skipped');
  assert.deepEqual(calculateVoucherReminderSchedule({ date: '2027-01-17', departureTime: '99:00', nowMs }), { kind: 'skipped', reason: 'invalid_departure_time' });
  assert.deepEqual(calculateVoucherReminderSchedule({ date: '2027-01-17', timeZone: 'Mars/Olympus', nowMs }), { kind: 'skipped', reason: 'invalid_time_zone' });
});

test('delivery revalidates reservation status and defers early jobs to the recalculated due time', () => {
  const nowMs = Date.parse('2027-01-14T10:30:00.000Z');
  assert.equal(decideVoucherDelivery({ reservationStatus: 'completed', date: '2027-01-17', nowMs }).action, 'cancel');
  assert.equal(decideVoucherDelivery({ reservationStatus: 'cancelled', date: '2027-01-17', nowMs }).action, 'cancel');
  const deferred = decideVoucherDelivery({ reservationStatus: 'reserved', date: '2027-01-17', departureTime: '07:30', nowMs });
  assert.equal(deferred.action, 'defer');
  if (deferred.action === 'defer') assert.equal(deferred.schedule.nextAttemptAtMs, Date.parse('2027-01-15T10:30:00.000Z'));
  assert.equal(decideVoucherDelivery({ reservationStatus: 'reserved', date: '2027-01-17', nowMs }).action, 'defer');
});
