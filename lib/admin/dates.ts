export { referralDateLabel as adminDateLabel } from './referrals.ts';

export const ADMIN_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function dateOnly(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

export function dateOnlyKey(date?: Date): string {
  if (!date || !Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function instant(value: unknown): Date | undefined {
  try {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('toDate' in value && typeof value.toDate === 'function') value = value.toDate();
      else {
        const seconds = 'seconds' in value ? value.seconds : '_seconds' in value ? value._seconds : undefined;
        if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return undefined;
        value = new Date(seconds * 1000);
      }
    }
    if (typeof value === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return undefined;
      if (!dateOnly(value.slice(0, 10))) return undefined;
      value = new Date(value);
    } else if (typeof value === 'number') value = new Date(value);
    return value instanceof Date && Number.isFinite(value.getTime()) ? value : undefined;
  } catch { return undefined; }
}

export function adminTimeLabel(value: unknown): string {
  if (typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  const date = instant(value);
  return date ? new Intl.DateTimeFormat('es-AR', { timeZone: ADMIN_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date) : 'Sin hora';
}

export function adminDateTimeLabel(value: unknown): string {
  const date = instant(value);
  return date ? `${new Intl.DateTimeFormat('es-AR', { timeZone: ADMIN_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)} ${adminTimeLabel(date)}` : 'Sin fecha';
}

/** Presentation boundary for report cells and export metadata, not stored values. */
export function adminReportDate<T>(key: string, value: T): T | string {
  if (typeof value !== 'string') return value;
  if (key === 'Mes' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) return `${value.slice(5)}/${value.slice(0, 4)}`;
  if (!/fecha|desde|hasta|generado|generatedAt|^from$|^to$/i.test(key) || !value) return value;
  if (dateOnly(value)) return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
  return instant(value) ? adminDateTimeLabel(value) : value;
}
