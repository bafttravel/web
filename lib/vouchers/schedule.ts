export const VOUCHER_REMINDER_HOURS = 48;
export const DEFAULT_VOUCHER_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const DEFAULT_VOUCHER_DEPARTURE_TIME = '09:00';

export type VoucherScheduleSkipReason =
  | 'missing_departure_date'
  | 'invalid_departure_date'
  | 'invalid_departure_time'
  | 'invalid_time_zone'
  | 'departure_already_passed';

export type VoucherReminderSchedule =
  | {
      kind: 'scheduled';
      departureAtMs: number;
      reminderAtMs: number;
      nextAttemptAtMs: number;
      timeZone: string;
      departureTime: string;
    }
  | { kind: 'skipped'; reason: VoucherScheduleSkipReason };

export type VoucherDeliveryDecision =
  | { action: 'send'; schedule: Extract<VoucherReminderSchedule, { kind: 'scheduled' }> }
  | { action: 'defer'; schedule: Extract<VoucherReminderSchedule, { kind: 'scheduled' }> }
  | { action: 'cancel'; reason: string; schedule?: VoucherReminderSchedule };

type WallClockParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function readWallClockParts(timestampMs: number, timeZone: string): WallClockParts | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestampMs)).map((part) => [part.type, part.value]));
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  } catch {
    return null;
  }
}

function sameWallClock(a: WallClockParts, b: WallClockParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day &&
    a.hour === b.hour && a.minute === b.minute && a.second === b.second;
}

/** Convert a local date/time in an IANA zone to UTC without assuming the server timezone. */
function wallClockToEpoch(date: string, time: string, timeZone: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const desired: WallClockParts = {
    year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]), minute: Number(timeMatch[2]), second: 0,
  };
  const wallClockAsUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute);
  const calendarCheck = new Date(wallClockAsUtc);
  if (calendarCheck.getUTCFullYear() !== desired.year || calendarCheck.getUTCMonth() + 1 !== desired.month || calendarCheck.getUTCDate() !== desired.day) return null;

  let candidate = wallClockAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = readWallClockParts(candidate, timeZone);
    if (!local) return null;
    const offsetMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - candidate;
    const next = wallClockAsUtc - offsetMs;
    if (next === candidate) break;
    candidate = next;
  }

  const roundTrip = readWallClockParts(candidate, timeZone);
  return roundTrip && sameWallClock(roundTrip, desired) ? candidate : null;
}

export function calculateVoucherReminderSchedule(input: {
  date: unknown;
  departureTime?: unknown;
  timeZone?: unknown;
  nowMs?: number;
}): VoucherReminderSchedule {
  const date = typeof input.date === 'string' ? input.date.trim() : '';
  if (!date || date === 'sin-fecha') return { kind: 'skipped', reason: 'missing_departure_date' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { kind: 'skipped', reason: 'invalid_departure_date' };

  const rawTime = typeof input.departureTime === 'string' ? input.departureTime.trim() : '';
  const departureTime = rawTime || DEFAULT_VOUCHER_DEPARTURE_TIME;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(departureTime)) return { kind: 'skipped', reason: 'invalid_departure_time' };

  const timeZone = typeof input.timeZone === 'string' && input.timeZone.trim()
    ? input.timeZone.trim()
    : DEFAULT_VOUCHER_TIME_ZONE;
  const departureAtMs = wallClockToEpoch(date, departureTime, timeZone);
  if (departureAtMs === null) {
    // Distinguish a malformed local date from an invalid IANA timezone.
    if (!readWallClockParts(Date.now(), timeZone)) return { kind: 'skipped', reason: 'invalid_time_zone' };
    return { kind: 'skipped', reason: 'invalid_departure_date' };
  }

  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs) || departureAtMs <= nowMs) return { kind: 'skipped', reason: 'departure_already_passed' };
  const reminderAtMs = departureAtMs - VOUCHER_REMINDER_HOURS * 60 * 60 * 1000;
  return {
    kind: 'scheduled',
    departureAtMs,
    reminderAtMs,
    nextAttemptAtMs: Math.max(nowMs, reminderAtMs),
    timeZone,
    departureTime,
  };
}

export function decideVoucherDelivery(input: {
  reservationStatus: unknown;
  date: unknown;
  departureTime?: unknown;
  timeZone?: unknown;
  nowMs?: number;
}): VoucherDeliveryDecision {
  if (input.reservationStatus !== 'reserved') {
    return { action: 'cancel', reason: `La reserva no está activa (estado: ${String(input.reservationStatus ?? 'desconocido')}).` };
  }

  const schedule = calculateVoucherReminderSchedule(input);
  if (schedule.kind === 'skipped') {
    const messages: Record<VoucherScheduleSkipReason, string> = {
      missing_departure_date: 'La reserva no tiene una fecha de salida.',
      invalid_departure_date: 'La fecha u hora de salida no es válida.',
      invalid_departure_time: 'La hora de salida no es válida.',
      invalid_time_zone: 'La zona horaria de la salida no es válida.',
      departure_already_passed: 'La salida ya ocurrió; no se envía un recordatorio vencido.',
    };
    return { action: 'cancel', reason: messages[schedule.reason], schedule };
  }

  if (schedule.nextAttemptAtMs > (input.nowMs ?? Date.now())) {
    return { action: 'defer', schedule };
  }
  return { action: 'send', schedule };
}
