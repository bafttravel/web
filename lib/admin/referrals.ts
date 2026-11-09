const dateFormat = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires',
});

/** Firestore timestamps and ISO dates; never substitute today's date for missing data. */
export function referralDateLabel(value: unknown): string {
  try {
    if (typeof value === 'string') {
      const match = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(value);
      if (!match) return 'Sin fecha';
      const [, year, month, day, rest] = match;
      const calendarDate = `${year}-${month}-${day}`;
      const check = new Date(`${calendarDate}T12:00:00Z`);
      if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== calendarDate) return 'Sin fecha';
      if (!rest) return `${day}/${month}/${year}`;
      if (!/^T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(rest)) return 'Sin fecha';
      value = new Date(value);
    } else if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('toDate' in value && typeof value.toDate === 'function') value = value.toDate();
      else {
        const seconds = 'seconds' in value ? value.seconds : '_seconds' in value ? value._seconds : undefined;
        if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 'Sin fecha';
        value = new Date(seconds * 1000);
      }
    } else if (typeof value === 'number' && Number.isFinite(value)) value = new Date(value);
    return value instanceof Date && Number.isFinite(value.getTime()) ? dateFormat.format(value) : 'Sin fecha';
  } catch {
    return 'Sin fecha';
  }
}

export const referralStatuses = [
  { value: 'pending', label: 'Pendiente', tone: 'pending' },
  { value: 'accrued', label: 'Lista para pagar', tone: 'ready' },
  { value: 'paid', label: 'Pagada', tone: 'paid' },
  { value: 'cancelled', label: 'Cancelada', tone: 'cancelled' },
] as const;

export function referralStatus(status: unknown) {
  return referralStatuses.find((item) => item.value === status) ?? { label: 'Sin informar', tone: 'unknown' };
}
