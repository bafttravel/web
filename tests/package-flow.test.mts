import test from 'node:test';
import assert from 'node:assert/strict';
import { extractGoogleMapsEmbedUrl, isGoogleMapsEmbedUrl } from '../lib/packages/google-maps.ts';
import {
  buildBookingCalendarMonth,
  buildBookingWindowMonths,
  filterAvailabilityToBookingWindow,
} from '../lib/packages/booking-calendar.ts';
import {
  clampPeopleBreakdownToMax,
  getDefaultPeopleCategories,
  getPeopleBreakdownTotal,
  normalizePeopleBreakdown,
  normalizePeopleCategories,
} from '../lib/packages/people-categories.ts';

test('extrae el src de un iframe de Google Maps', () => {
  const iframe = '<iframe src="https://www.google.com/maps/embed?pb=!1m18!2m3"></iframe>';
  assert.equal(extractGoogleMapsEmbedUrl(iframe), 'https://www.google.com/maps/embed?pb=!1m18!2m3');
  assert.equal(isGoogleMapsEmbedUrl(iframe), true);
});

test('convierte una URL con query en una URL embed válida', () => {
  const rawUrl = 'https://www.google.com/maps?q=El%20Calafate';
  assert.equal(
    extractGoogleMapsEmbedUrl(rawUrl),
    'https://www.google.com/maps?q=El%20Calafate&output=embed'
  );
});

test('acepta mapas en modo embed de Google My Maps', () => {
  const rawUrl = 'https://www.google.com/maps/d/embed?mid=1YoK4qkrza8ehIbUp0cZj_7IJH_fiu2Wy&ehbc=2E312F';
  assert.equal(extractGoogleMapsEmbedUrl(rawUrl), rawUrl);
  assert.equal(isGoogleMapsEmbedUrl(rawUrl), true);
});

test('rechaza URLs que no son de Google Maps', () => {
  assert.equal(extractGoogleMapsEmbedUrl('https://example.com/mapa'), '');
  assert.equal(isGoogleMapsEmbedUrl('https://example.com/mapa'), false);
});

test('filtra las fechas cargadas excluyendo las pasadas', () => {
  const baseDate = new Date('2026-08-03T12:00:00');
  const filtered = filterAvailabilityToBookingWindow(
    [
      { date: '2026-08-05' },
      { date: '2026-09-10' },
      { date: '2026-10-02' },
    ],
    baseDate
  );

  assert.deepEqual(
    filtered.map((item) => item.date),
    ['2026-08-05', '2026-09-10', '2026-10-02']
  );
});

test('genera los meses visibles del calendario', () => {
  const months = buildBookingWindowMonths(new Date('2026-12-18T12:00:00'));
  assert.deepEqual(months, [
    { year: 2026, month: 11 },
    { year: 2027, month: 0 },
  ]);
});

test('permite seleccionar fechas cargadas sin consultar cupos o stock', () => {
  const cells = buildBookingCalendarMonth({
    year: 2026,
    month: 7,
    entries: [
      { date: '2026-08-05' },
      { date: '2026-08-06' },
    ],
  });

  const firstDeparture = cells.find((cell) => cell.isoDate === '2026-08-05');
  const secondDeparture = cells.find((cell) => cell.isoDate === '2026-08-06');

  assert.ok(firstDeparture);
  assert.equal(firstDeparture?.isSelectable, true);

  assert.ok(secondDeparture);
  assert.equal(secondDeparture?.isSelectable, true);
});

test('solo bloquea fechas que no están cargadas o no cumplen la anticipación', () => {
  const cells = buildBookingCalendarMonth({
    year: 2026,
    month: 7,
    entries: [{ date: '2026-08-05' }],
    minBookableDateIso: '2026-08-06',
  });
  const tooSoon = cells.find((item) => item.isoDate === '2026-08-05');
  const noDeparture = cells.find((item) => item.isoDate === '2026-08-06');
  assert.ok(tooSoon);
  assert.equal(tooSoon?.isSelectable, false);
  assert.ok(noDeparture);
  assert.equal(noDeparture?.isSelectable, false);
});

test('normaliza categorías de pasajeros y evita duplicados', () => {
  const cats = normalizePeopleCategories(
    [
      { key: 'Adults', label: 'Adultos', min: 1, max: 6 },
      { key: 'adults', label: 'Duplicado', min: 0, max: 6 },
      { key: 'minors', label: 'Menores', min: 0, max: 6 },
    ],
    6
  );
  assert.equal(cats.length, 2);
  assert.equal(cats[0].key, 'adults');
  assert.equal(cats[1].key, 'minors');
});

test('normaliza pax por mínimos y clampa al máximo por reserva', () => {
  const categories = getDefaultPeopleCategories(4);
  const base = normalizePeopleBreakdown({ breakdown: null, categories });
  assert.equal(getPeopleBreakdownTotal(base), 1);

  const pax = normalizePeopleBreakdown({ breakdown: { adults: 3, minors: 3 }, categories });
  const clamped = clampPeopleBreakdownToMax({ breakdown: pax, categories, maxPeoplePerBooking: 4 });
  assert.equal(getPeopleBreakdownTotal(clamped), 4);
  assert.equal(clamped.adults >= 1, true);
});
