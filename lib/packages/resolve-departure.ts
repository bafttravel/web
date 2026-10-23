import type {
  CartCurrency,
  Paquete,
  ReservationExtraCode,
  ReservationExtraSelection,
  Salida,
  SeatLayoutAmenities,
  SeatLayoutTemplate,
} from '@/types';

export type ResolvedDepartureConfig = {
  date: string;
  isNoDate: boolean;
  exists: boolean;
  enabled: boolean;
  salida: Salida | null;
  /** Precio base (por persona) en centavos. Usado para reglas por porcentaje. */
  baseUnitAmount: number;
  unitAmount: number;
  currency: CartCurrency | null;
  displayCurrency: 'USD' | 'ARS' | 'EUR' | null;
  maxPeople: number;
  seatsEnabled: boolean;
  seatLayoutId: string | null;
};

export type ReservationPricingMode = 'fixed' | 'percent';

export type ReservationPricingConfig = {
  mode: ReservationPricingMode;
  /**
   * Si mode = fixed, este es el precio unitario (por persona) a cobrar como reserva (en centavos).
   * Si no está, se usa bookingConfig.depositAmount (si existe) o el precio base del paquete/salida.
   */
  fixedUnitAmount?: number | null;
  /**
   * Regla cuando la reserva es para 1 persona (en porcentaje 0-100).
   */
  single?: { adultPercent: number; minorPercent?: number | null } | null;
  /**
   * Regla cuando la reserva es para 2+ personas (en porcentaje 0-100).
   */
  group?: { adultPercent: number; minorPercent?: number | null } | null;
  /** Si true, se permite override de % por adultos/menores desde el carrito/admin. */
  allowCustomPercent?: boolean | null;
};

export type ComputedReservationPricing = {
  pricingMode: ReservationPricingMode;
  currency: CartCurrency | null;
  displayCurrency: 'USD' | 'ARS' | 'EUR' | null;
  baseUnitAmount: number;
  people: number;
  peopleAdults: number | null;
  peopleMinors: number | null;
  depositPercentAdults: number | null;
  depositPercentMinors: number | null;
  unitAmountAdults: number;
  unitAmountMinors: number;
  /** Compat: unitAmount se mantiene como "unitario adultos". */
  unitAmount: number;
  baseSubtotalAmount: number;
  extrasTotalAmount: number;
  subtotalAmount: number;
};

const EXTRA_LABELS: Record<ReservationExtraCode, string> = {
  cocheCama: 'Coche cama',
  panoramicos: 'Panorámicos',
  cafeteras: 'Cafeteras',
  packageAddon: 'Adicional',
  manualExtra: 'Adicional',
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStoredMoney(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function toAmountCents(value: unknown): number {
  const normalized = normalizeStoredMoney(value);
  if (normalized <= 0) return 0;
  return Math.round(normalized * 100);
}

function normalizeDate(value: string): string {
  const next = normalizeText(value);
  return next || 'sin-fecha';
}

function normalizeAmenityConfig(value: any) {
  return {
    enabled: Boolean(value?.enabled),
    amount: typeof value?.amount === 'number' ? Math.max(0, Number(value.amount) || 0) : 0,
  };
}

export function getPackageAddonOptions(paquete: Paquete): Array<{
  id: string;
  title: string;
  description: string;
  image: string;
  price: number;
  enabled: boolean;
}> {
  const raw = (paquete as any)?.addons;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const options: Array<{ id: string; title: string; description: string; image: string; price: number; enabled: boolean }> = [];
  for (const item of raw) {
    const id = String((item as any)?.id ?? '').trim();
    const title = String((item as any)?.title ?? (item as any)?.titulo ?? '').trim();
    const price = Math.max(0, Number((item as any)?.price ?? (item as any)?.precio ?? 0) || 0);
    const enabled = (item as any)?.enabled !== false;
    if (!id || !title || price <= 0 || !enabled || seen.has(id)) continue;
    seen.add(id);
    options.push({
      id,
      title,
      description: String((item as any)?.description ?? (item as any)?.descripcion ?? '').trim(),
      image: String((item as any)?.image ?? (item as any)?.imagen ?? '').trim(),
      price,
      enabled,
    });
  }
  return options;
}

/**
 * Convierte adicionales elegidos por el cliente en selecciones de extras tarifables.
 * Los adicionales se cobran por pasajero (scope per_person) y se validan
 * contra el catálogo del paquete: ids desconocidos, deshabilitados o con precio
 * cambiado se ignoran/recalculan del lado servidor.
 */
export function getPackageAddonExtraSelections(
  paquete: Paquete,
  addonIds: Array<string> | null | undefined
): ReservationExtraSelection[] {
  const requested = new Set(
    Array.isArray(addonIds) ? addonIds.map((id) => String(id ?? '').trim()).filter(Boolean) : []
  );
  if (requested.size === 0) return [];
  const catalog = new Map(getPackageAddonOptions(paquete).map((option) => [option.id, option]));
  const selections: ReservationExtraSelection[] = [];
  for (const id of requested) {
    const option = catalog.get(id);
    if (!option) continue;
    selections.push({
      code: 'packageAddon',
      label: option.title,
      amount: toAmountCents(option.price),
      source: `packageAddon:${option.id}`,
      scope: 'per_person',
    });
  }
  return selections;
}

export function getSeatLayoutExtraOptions(template: Pick<SeatLayoutTemplate, 'amenities'> | null | undefined): ReservationExtraSelection[] {
  const amenities = (template?.amenities ?? {}) as SeatLayoutAmenities;
  const options: ReservationExtraSelection[] = [];
  (['cocheCama', 'panoramicos', 'cafeteras'] as ReservationExtraCode[]).forEach((code) => {
    const config = normalizeAmenityConfig((amenities as any)?.[code]);
    if (!config.enabled || !config.amount || config.amount <= 0) return;
    options.push({
      code,
      label: EXTRA_LABELS[code],
      amount: toAmountCents(config.amount),
      source: 'seatLayout',
      scope: 'per_person',
    });
  });
  return options;
}

export function resolveReservationExtraSelections(params: {
  paquete: Paquete;
  selectedExtraCodes?: Array<string | ReservationExtraCode> | null;
  addonIds?: Array<string> | null;
  /**
   * Adicionales libres definidos por el admin (no atados al catálogo del
   * paquete). Precio en unidades (pesos/dólares/reales, como los addons).
   * Permite sumar a cualquier reserva un adicional creado para otra excursión.
   */
  manualExtras?: Array<{ label: string; amount: number; perPerson?: boolean }> | null;
  seatLayoutTemplate?: Pick<SeatLayoutTemplate, 'amenities'> | null;
}): ReservationExtraSelection[] {
  const requested = new Set(
    Array.isArray(params.selectedExtraCodes)
      ? params.selectedExtraCodes.map((code) => String(code).trim()).filter(Boolean)
      : []
  );
  const selections: ReservationExtraSelection[] = [];
  getSeatLayoutExtraOptions(params.seatLayoutTemplate).forEach((option) => {
    if (requested.has(option.code)) selections.push(option);
  });
  getPackageAddonExtraSelections(params.paquete, params.addonIds).forEach((option) => selections.push(option));
  if (Array.isArray(params.manualExtras)) {
    for (const extra of params.manualExtras) {
      const label = String(extra?.label ?? '').trim();
      const amount = Math.max(0, Number(extra?.amount ?? 0) || 0);
      if (!label || amount <= 0) continue;
      selections.push({
        code: 'manualExtra',
        label,
        amount: toAmountCents(amount),
        source: 'manualExtra',
        scope: 'per_person',
      });
    }
  }
  return selections;
}

function toDisplayCurrency(paquete: Paquete, salida: Salida | null): 'USD' | 'ARS' | 'EUR' | null {
  const moneda = paquete.moneda ?? salida?.moneda ?? null;
  if (moneda === 'USD' || moneda === 'ARS' || moneda === 'EUR') return moneda;
  return null;
}

function toCartCurrency(paquete: Paquete, salida: Salida | null): CartCurrency | null {
  const bookingCurrency = paquete.bookingConfig?.currency;
  if (bookingCurrency === 'ars' || bookingCurrency === 'brl' || bookingCurrency === 'usd') return bookingCurrency;
  const moneda = toDisplayCurrency(paquete, salida);
  if (moneda === 'ARS') return 'ars';
  if (moneda === 'USD') return 'usd';
  if (moneda === 'EUR') return 'usd';
  return null;
}

function normalizePercent(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, Math.min(100, n));
  return clamped;
}

function resolvePackagePricingConfig(paquete: Paquete): ReservationPricingConfig | null {
  const raw = (paquete as any)?.reservationPricing;
  if (!raw || typeof raw !== 'object') return null;
  const mode = String((raw as any).mode ?? '').trim().toLowerCase();
  const normalizedMode: ReservationPricingMode | null = mode === 'percent' ? 'percent' : mode === 'fixed' ? 'fixed' : null;
  if (!normalizedMode) return null;
  const fixedUnitAmount =
    typeof (raw as any).fixedUnitAmount === 'number' && Number.isFinite((raw as any).fixedUnitAmount)
      ? toAmountCents((raw as any).fixedUnitAmount)
      : null;
  const singleAdult = normalizePercent((raw as any)?.single?.adultPercent);
  const singleMinor = normalizePercent((raw as any)?.single?.minorPercent);
  const groupAdult = normalizePercent((raw as any)?.group?.adultPercent);
  const groupMinor = normalizePercent((raw as any)?.group?.minorPercent);

  const single = singleAdult !== null ? { adultPercent: singleAdult, minorPercent: singleMinor } : null;
  const group = groupAdult !== null ? { adultPercent: groupAdult, minorPercent: groupMinor } : null;
  const allowCustomPercent = Boolean((raw as any).allowCustomPercent);
  return {
    mode: normalizedMode,
    fixedUnitAmount,
    single,
    group,
    allowCustomPercent,
  };
}

export function computeReservationPricing(paquete: Paquete, rawDate: string, input?: {
  people?: number | null;
  peopleAdults?: number | null;
  peopleMinors?: number | null;
  depositPercentAdults?: number | null;
  depositPercentMinors?: number | null;
  selectedExtras?: ReservationExtraSelection[] | null;
}): ComputedReservationPricing {
  const departure = resolveDepartureConfig(paquete, rawDate);
  const adultsRaw = typeof input?.peopleAdults === 'number' ? Math.max(0, Math.floor(input!.peopleAdults)) : null;
  const minorsRaw = typeof input?.peopleMinors === 'number' ? Math.max(0, Math.floor(input!.peopleMinors)) : null;
  const derivedPeople = (adultsRaw ?? 0) + (minorsRaw ?? 0);
  const people = derivedPeople > 0 ? derivedPeople : Math.max(1, Math.floor(Number(input?.people ?? 1) || 1));
  const adults = derivedPeople > 0 ? Math.min(people, adultsRaw ?? 0) : people;
  const minors = derivedPeople > 0 ? Math.min(people - adults, minorsRaw ?? 0) : 0;

  const pricingCfg = resolvePackagePricingConfig(paquete);
  const baseUnitAmount = departure.baseUnitAmount;
  const fixedFallback =
    typeof paquete.bookingConfig?.depositAmount === 'number' && paquete.bookingConfig.depositAmount > 0
      ? toAmountCents(paquete.bookingConfig.depositAmount)
      : departure.unitAmount > 0
        ? Math.round(departure.unitAmount)
        : baseUnitAmount;

  if (!pricingCfg || pricingCfg.mode === 'fixed') {
    const fixedUnitAmount =
      pricingCfg?.fixedUnitAmount && pricingCfg.fixedUnitAmount > 0
        ? Math.round(pricingCfg.fixedUnitAmount)
        : fixedFallback;
    const unitAmountAdults = Math.max(0, fixedUnitAmount);
    const unitAmountMinors = Math.max(0, fixedUnitAmount);
    const baseSubtotalAmount = unitAmountAdults * adults + unitAmountMinors * minors;
    const extrasTotalAmount = (input?.selectedExtras ?? []).reduce((sum, extra) => {
      const amount = Math.max(0, Number(extra?.amount ?? 0) || 0);
      const scope = String(extra?.scope ?? 'per_person');
      return sum + (scope === 'per_booking' ? amount : amount * people);
    }, 0);
    const subtotalAmount = baseSubtotalAmount + extrasTotalAmount;
    return {
      pricingMode: 'fixed',
      currency: departure.currency,
      displayCurrency: departure.displayCurrency,
      baseUnitAmount,
      people,
      peopleAdults: derivedPeople > 0 ? adults : null,
      peopleMinors: derivedPeople > 0 ? minors : null,
      depositPercentAdults: null,
      depositPercentMinors: null,
      unitAmountAdults,
      unitAmountMinors,
      unitAmount: unitAmountAdults,
      baseSubtotalAmount,
      extrasTotalAmount,
      subtotalAmount,
    };
  }

  const rule = people <= 1 ? pricingCfg.single : pricingCfg.group;
  const fallbackRule = rule ?? pricingCfg.group ?? pricingCfg.single;
  const baseAdultPercent = fallbackRule ? fallbackRule.adultPercent : 0;
  const baseMinorPercent =
    fallbackRule && fallbackRule.minorPercent != null ? fallbackRule.minorPercent : baseAdultPercent;

  const overrideAdults = normalizePercent(input?.depositPercentAdults);
  const overrideMinors = normalizePercent(input?.depositPercentMinors);
  const depositPercentAdults = overrideAdults !== null ? overrideAdults : baseAdultPercent;
  const depositPercentMinors = overrideMinors !== null ? overrideMinors : baseMinorPercent;

  const unitAmountAdults = Math.max(0, Math.round((baseUnitAmount * depositPercentAdults) / 100));
  const unitAmountMinors = Math.max(0, Math.round((baseUnitAmount * depositPercentMinors) / 100));
  const baseSubtotalAmount = unitAmountAdults * adults + unitAmountMinors * minors;
  const extrasTotalAmount = (input?.selectedExtras ?? []).reduce((sum, extra) => {
    const amount = Math.max(0, Number(extra?.amount ?? 0) || 0);
    const scope = String(extra?.scope ?? 'per_person');
    return sum + (scope === 'per_booking' ? amount : amount * people);
  }, 0);
  const subtotalAmount = baseSubtotalAmount + extrasTotalAmount;
  return {
    pricingMode: 'percent',
    currency: departure.currency,
    displayCurrency: departure.displayCurrency,
    baseUnitAmount,
    people,
    peopleAdults: derivedPeople > 0 ? adults : null,
    peopleMinors: derivedPeople > 0 ? minors : null,
    depositPercentAdults,
    depositPercentMinors,
    unitAmountAdults,
    unitAmountMinors,
    unitAmount: unitAmountAdults,
    baseSubtotalAmount,
    extrasTotalAmount,
    subtotalAmount,
  };
}

export function getOperationalSalidas(paquete: Paquete): Salida[] {
  if (!Array.isArray(paquete.salidas)) return [];

  const uniqueByDate = new Map<string, Salida>();
  for (const salida of paquete.salidas) {
    const fecha = normalizeText(salida?.fecha);
    if (!fecha) continue;
    if (!uniqueByDate.has(fecha)) {
      uniqueByDate.set(fecha, {
        ...salida,
        fecha,
        fechaVuelta: normalizeText(salida?.fechaVuelta),
        ciudadSalida: normalizeText(salida?.ciudadSalida),
        observaciones: normalizeText(salida?.observaciones),
        seatLayoutId: normalizeText(salida?.seatLayoutId),
      });
    }
  }

  return Array.from(uniqueByDate.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function getOperationalDepartureDates(paquete: Paquete): string[] {
  return getOperationalSalidas(paquete).map((salida) => salida.fecha);
}

export function resolveDepartureConfig(paquete: Paquete, rawDate: string): ResolvedDepartureConfig {
  const date = normalizeDate(rawDate);
  const isNoDate = date === 'sin-fecha';
  const salida = isNoDate
    ? null
    : getOperationalSalidas(paquete).find((item) => item.fecha === date) ?? null;
  const globalEnabled = paquete.bookingConfig?.enabled !== false;
  const displayCurrency = toDisplayCurrency(paquete, salida);
  const currency = toCartCurrency(paquete, salida);
  const baseUnitAmount =
    typeof salida?.precio === 'number' && salida.precio > 0
      ? toAmountCents(salida.precio)
      : typeof paquete.precio === 'number' && paquete.precio > 0
        ? toAmountCents(paquete.precio)
        : 0;
  const unitAmount =
    typeof paquete.bookingConfig?.depositAmount === 'number' && paquete.bookingConfig.depositAmount > 0
      ? toAmountCents(paquete.bookingConfig.depositAmount)
      : typeof salida?.precio === 'number' && salida.precio > 0
        ? toAmountCents(salida.precio)
        : typeof paquete.precio === 'number' && paquete.precio > 0
          ? toAmountCents(paquete.precio)
          : 0;
  const maxPeople =
    typeof paquete.bookingConfig?.maxPeoplePerBooking === 'number' && paquete.bookingConfig.maxPeoplePerBooking > 0
      ? paquete.bookingConfig.maxPeoplePerBooking
      : 50;
  const seatsEnabled = Boolean(salida?.seatSelectionEnabled ?? paquete.seatSelectionEnabled);
  const seatLayoutId = normalizeText(salida?.seatLayoutId) || normalizeText(paquete.seatLayoutId) || null;

  return {
    date,
    isNoDate,
    exists: isNoDate ? true : Boolean(salida),
    enabled: globalEnabled && (isNoDate ? true : Boolean(salida)),
    salida,
    baseUnitAmount,
    unitAmount,
    currency,
    displayCurrency,
    maxPeople,
    seatsEnabled,
    seatLayoutId,
  };
}
