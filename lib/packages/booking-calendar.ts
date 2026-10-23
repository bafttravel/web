export type BookingAvailabilityItem = { date: string };

export type BookingCalendarCell = {
  isoDate: string;
  day: number;
  inMonth: boolean;
  /** La salida existe pero no cumple la anticipación mínima (ej: 48 hs). */
  isTooSoon: boolean;
  isSelectable: boolean;
};

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildBookingWindowMonths(baseDate = new Date()) {
  const currentMonth = getMonthStart(baseDate);
  const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  return [
    { year: currentMonth.getFullYear(), month: currentMonth.getMonth() },
    { year: nextMonth.getFullYear(), month: nextMonth.getMonth() },
  ];
}

export function filterAvailabilityToBookingWindow(
  entries: BookingAvailabilityItem[],
  baseDate = new Date()
) {
  const todayIso = toIsoDate(baseDate);
  return entries
    .filter((entry) => {
      const parsed = new Date(`${entry.date}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return false;
      // Las fechas pasadas nunca se muestran como disponibles.
      if (entry.date < todayIso) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildBookingCalendarMonth(args: {
  year: number;
  month: number;
  entries: BookingAvailabilityItem[];
  /** Primera fecha reservable (YYYY-MM-DD); los días anteriores quedan bloqueados por anticipación. */
  minBookableDateIso?: string;
}) {
  const { year, month, entries } = args;
  const minBookableDateIso = String(args.minBookableDateIso ?? '').trim();
  const departureDates = new Set(entries.map((entry) => entry.date));
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - startOffset);

  const cells: BookingCalendarCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index);
    const isoDate = toIsoDate(current);
    const isTooSoon = Boolean(minBookableDateIso) && isoDate < minBookableDateIso;
    const hasDeparture = departureDates.has(isoDate);

    cells.push({
      isoDate,
      day: current.getDate(),
      inMonth: current.getMonth() === month,
      isTooSoon,
      isSelectable: current.getMonth() === month && hasDeparture && !isTooSoon,
    });
  }

  return cells;
}
