import * as z from 'zod';
import { packageOperationsSchema } from '@/lib/operations/schemas';
import type { Categoria, Salida } from '@/types';
import { normalizePackageCategoryIds } from '@/lib/packages/category-utils';
import { extractGoogleMapsEmbedUrl } from '@/lib/packages/google-maps';
import { normalizeExcursionTypeValue, normalizePackageTypes } from '@/lib/packages/package-types';
import { normalizePeopleCategories } from '@/lib/packages/people-categories';
import { DEFAULT_MIN_LEAD_HOURS, MAX_MIN_LEAD_HOURS } from '@/lib/packages/booking-rules';
import { MAX_PACKAGE_ADDONS, packageAddonsSchema } from '@/lib/packages/package-addons';
import {
  extractPlainTextFromRichText,
  hasMeaningfulRichText,
  normalizeRichTextContent,
} from '@/lib/packages/rich-text-validation';
import { sanitizePackageRichHtml } from '@/lib/packages/rich-text-sanitize';

export { normalizePackageCategoryIds } from '@/lib/packages/category-utils';
export { normalizePackageTypes } from '@/lib/packages/package-types';

export const TRANSPORTE_OPTIONS = [
  { value: 'bus', label: 'Bus' },
  { value: 'avion', label: 'Avion' },
  { value: 'barco', label: 'Barco' },
] as const;

export const DEFAULT_CONDICIONES = [
  { titulo: 'Reserva', texto: 'Sena del 40% para asegurar tu lugar.' },
  { titulo: 'Pagos', texto: 'Consulta nuestras cuotas y medios de pago disponibles.' },
  { titulo: 'Confirmacion', texto: 'Salida sujeta a la conformacion del grupo minimo.' },
  { titulo: 'Flexibilidad', texto: 'Excursiones condicionadas por clima o imprevistos.' },
  { titulo: 'Seguridad', texto: 'Recomendamos contratar asistencia al viajero.' },
  { titulo: 'Gastos extra', texto: 'No incluye comidas en ruta, bebidas ni opcionales.' },
  { titulo: 'Ingresos', texto: 'No incluye tickets a parques nacionales ni museos.' },
] as const;

export type CondicionItem = { titulo: string; texto: string };

export type ItineraryStepFormItem = {
  id: string;
  titulo: string;
  descripcion: string;
};

const itineraryStepSchema = z.object({
  id: z.string().min(1, 'Falta el identificador del paso'),
  titulo: z
    .string()
    .max(120, 'El titulo del paso es demasiado largo')
    .optional()
    .or(z.literal(''))
    .transform((val) => String(val ?? '').trim()),
  descripcion: z
    .string()
    .max(100000, 'La descripcion del paso es demasiado larga')
    .optional()
    .or(z.literal(''))
    .transform((val) => normalizeRichTextContent(val)),
});

const peopleCategorySchema = z
  .object({
    key: z
      .string()
      .min(1, 'Falta el identificador de la categoria')
      .max(32, 'El identificador es demasiado largo')
      .transform((val) => String(val ?? '').trim()),
    label: z
      .string()
      .min(1, 'Falta el nombre de la categoria')
      .max(60, 'El nombre es demasiado largo')
      .transform((val) => String(val ?? '').trim()),
    min: z.number().int('Debes ingresar un numero entero').min(0, 'Minimo 0').max(50, 'Maximo 50'),
    max: z.number().int('Debes ingresar un numero entero').min(0, 'Minimo 0').max(50, 'Maximo 50'),
  })
  .refine((data) => data.max >= data.min, { message: 'El máximo no puede ser menor al mínimo', path: ['max'] });

export const packageAdminFormSchema = z.object({
  operations: packageOperationsSchema.optional(),
  titulo: z.string().min(5, 'El titulo debe tener al menos 5 caracteres').max(100, 'El titulo no puede exceder 100 caracteres').transform((val) => val.trim()),
  descripcion: z.string().max(50000, 'La descripcion es demasiado larga').transform((val) => normalizeRichTextContent(val)),
  descripcionCorta: z.string().max(160, 'La descripcion corta no puede exceder 160 caracteres').optional().or(z.literal('')).transform((val) => val?.trim() || ''),
  mostrarItinerario: z.boolean().transform((val) => Boolean(val)),
  itinerarioSteps: z.array(itineraryStepSchema).max(60, 'El itinerario tiene demasiados pasos').optional().default([]),
  mapaGoogleEmbedUrl: z
    .string()
    .max(20000, 'La URL o iframe del mapa es demasiado largo')
    .optional()
    .or(z.literal(''))
    .transform((val) => extractGoogleMapsEmbedUrl(val ?? '')),
  categoriaIds: z.array(z.string()).min(1, 'Debes seleccionar al menos una categoria'),
  tipos: z
    .array(z.string().transform((val) => normalizeExcursionTypeValue(val)))
    .min(1, 'Debes seleccionar al menos un tipo')
    .transform((values) => normalizePackageTypes(values)),
  precio: z.number().min(0, 'El precio debe ser mayor o igual a 0').max(999999999, 'El precio es demasiado alto').transform((val) => Number(val) || 0),
  tarifaEspecialHabilitada: z.boolean().transform((val) => Boolean(val)),
  tarifaEspecialPrecio: z.number().min(0, 'La tarifa especial debe ser mayor o igual a 0').max(999999999, 'La tarifa especial es demasiado alta').transform((val) => Number(val) || 0),
  tarifaEspecialFechaLimite: z.string().optional(),
  moneda: z.enum(['USD', 'ARS', 'EUR']),
  mostrarDesde: z.boolean().transform((val) => Boolean(val)),
  duracion: z.string().min(1, 'La duracion es requerida').max(50, 'La duracion no puede exceder 50 caracteres').transform((val) => val.trim()),
  reservasHabilitadas: z.boolean().transform((val) => Boolean(val)),
  maxPersonasPorReserva: z.number().int('Debes ingresar un numero entero').min(1, 'Minimo 1 persona').max(50, 'Maximo 50 personas'),
  minLeadHours: z
    .number()
    .int('Debes ingresar un numero entero')
    .min(0, 'Minimo 0 horas (sin anticipacion minima)')
    .max(MAX_MIN_LEAD_HOURS, `Maximo ${MAX_MIN_LEAD_HOURS} horas`),
  peopleCategories: z.array(peopleCategorySchema).max(10, 'Hay demasiadas categorias').optional().default([]),
  incluye: z.string().optional().default(''),
  visible: z.boolean().transform((val) => Boolean(val)),
  destacado: z.boolean().transform((val) => Boolean(val)),
  ctaWhatsApp: z.boolean().transform((val) => Boolean(val)),
}).superRefine((data, ctx) => {
  const descripcionLength = extractPlainTextFromRichText(data.descripcion).length;
  const itinerarioLength = (data.itinerarioSteps ?? []).reduce(
    (acc, step) => acc + extractPlainTextFromRichText(step.descripcion).length,
    0
  );

  if (descripcionLength < 20) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['descripcion'],
      message: 'La descripcion debe tener al menos 20 caracteres de contenido',
    });
  }

  if (descripcionLength > 5000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['descripcion'],
      message: 'La descripcion no puede exceder 5000 caracteres de contenido',
    });
  }

  if (itinerarioLength > 20000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['itinerarioSteps'],
      message: 'El itinerario no puede exceder 20000 caracteres de contenido',
    });
  }

  const hasAnyStep = Array.isArray(data.itinerarioSteps) && data.itinerarioSteps.length > 0;
  const hasMeaningfulSteps = (data.itinerarioSteps ?? []).some((step) => hasMeaningfulRichText(step.descripcion) || Boolean(step.titulo?.trim()));

  if (data.mostrarItinerario && (!hasAnyStep || !hasMeaningfulSteps)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['itinerarioSteps'],
      message: 'Debes cargar al menos un paso del itinerario si la visualizacion publica esta activada',
    });
  }

  if (!data.tarifaEspecialHabilitada) return;

  if (!data.tarifaEspecialPrecio || data.tarifaEspecialPrecio <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tarifaEspecialPrecio'],
      message: 'Ingresa un valor valido para la tarifa especial',
    });
  }

  if (!data.tarifaEspecialFechaLimite?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tarifaEspecialFechaLimite'],
      message: 'Debes indicar la fecha limite de la tarifa especial',
    });
  }

  const categories = normalizePeopleCategories(data.peopleCategories, data.maxPersonasPorReserva);
  if (categories.length > 0) {
    const keys = categories.map((item) => item.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['peopleCategories'],
        message: 'No se permiten categorias duplicadas',
      });
    }
    const sumMin = categories.reduce((acc, item) => acc + Math.max(0, Number(item.min) || 0), 0);
    if (sumMin > data.maxPersonasPorReserva) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['peopleCategories'],
        message: 'La suma de mínimos supera el máximo por reserva',
      });
    }
  }
});

export type PackageAdminFormData = z.infer<typeof packageAdminFormSchema>;

export const packageAdminDefaultValues: PackageAdminFormData = {
  visible: true,
  destacado: true,
  ctaWhatsApp: true,
  mostrarDesde: true,
  tipos: [],
  categoriaIds: [],
  moneda: 'ARS',
  incluye: '',
  itinerarioSteps: [],
  mostrarItinerario: false,
  mapaGoogleEmbedUrl: '',
  descripcionCorta: '',
  precio: 0,
  tarifaEspecialHabilitada: false,
  tarifaEspecialPrecio: 0,
  tarifaEspecialFechaLimite: '',
  reservasHabilitadas: true,
  maxPersonasPorReserva: 6,
  minLeadHours: DEFAULT_MIN_LEAD_HOURS,
  peopleCategories: [
    { key: 'adults', label: 'Adultos', min: 1, max: 6 },
    { key: 'minors', label: 'Menores', min: 0, max: 6 },
  ],
  titulo: '',
  descripcion: '',
  duracion: '',
};

export function dataURLtoFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

export function hasValidPackageSalida(salidas: Salida[]): boolean {
  return salidas.some((salida) => Boolean(salida?.fecha?.trim()));
}

export function getInvalidPackageSalidasSummary(salidas: Salida[]): {
  invalidCount: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let invalidCount = 0;

  salidas.forEach((salida, index) => {
    const fecha = String((salida as any)?.fecha ?? '').trim();
    const fechaVuelta = String((salida as any)?.fechaVuelta ?? '').trim() || fecha;
    const precio = Number((salida as any)?.precio ?? 0);

    let reason = '';
    if (!fecha) {
      reason = 'Falta la fecha de salida';
    } else if (fechaVuelta < fecha) {
      reason = 'Vuelta anterior a ida';
    } else if (!Number.isFinite(precio) || precio <= 0) {
      reason = 'Precio inválido';
    }

    if (reason) {
      invalidCount += 1;
      reasons.push(`Salida ${index + 1}: ${reason}`);
    }
  });

  return { invalidCount, reasons };
}

export function sanitizePackageSalidas(salidas: Salida[]): Salida[] {
  return salidas.map((salida) => {
    const fecha = String((salida as any)?.fecha ?? '').trim();
    const id = String((salida as any)?.id ?? '').trim();
    const moneda = String((salida as any)?.moneda ?? 'ARS').trim().toUpperCase();
    return {
      ...(id ? { id } : {}),
      fecha,
      fechaVuelta: String((salida as any)?.fechaVuelta ?? '').trim() || fecha,
      ciudadSalida: String((salida as any)?.ciudadSalida ?? '').trim(),
      precio: Number((salida as any)?.precio ?? 0) || 0,
      observaciones: String((salida as any)?.observaciones ?? '').trim(),
      moneda: moneda === 'USD' || moneda === 'EUR' ? moneda : 'ARS',
    } as Salida;
  });
}

export function getPackagePrimaryCategoryData(categorias: Categoria[], categoriaIds: string[]) {
  const normalizedCategoriaIds = normalizePackageCategoryIds(categoriaIds);
  const primaryCategoriaId = normalizedCategoriaIds[0] ?? '';
  const categoriaSeleccionada = categorias.find((categoria) => categoria.id === primaryCategoriaId);
  return {
    normalizedCategoriaIds,
    primaryCategoriaId,
    nombreCategoria: categoriaSeleccionada?.nombre || 'Destino',
  };
}

export function buildPackageAdminPayload(args: {
  data: PackageAdminFormData;
  categorias: Categoria[];
  includeItems: string[];
  selectedTransportes: string[];
  tagItems: string[];
  noIncludeItems: string[];
  condicionesItems: CondicionItem[];
  addons: Array<{
    id: string;
    title: string;
    description: string;
    price: number;
    image: string;
    imageKey?: string | null;
    enabled: boolean;
  }>;
  salidas: Salida[];
  fechaVencimiento: string;
  imageData: {
    imagenPrincipal: string;
    imagenPrincipalKey?: string | null;
    imagenTarjeta: string;
    imagenTarjetaKey?: string | null;
    imagenPortada: string;
    imagenPortadaKey?: string | null;
    imagenPortadaMobile?: string;
    imagenPortadaMobileKey?: string | null;
    imagenPortadaDesktop?: string;
    imagenPortadaDesktopKey?: string | null;
    galeria: string[];
    galeriaKeys?: string[];
  };
  existingBookingConfig?: {
    depositAmount?: number;
    paymentMethods?: {
      mercadoPago?: boolean;
    };
    referralCommission?: {
      type: 'percent' | 'fixed';
      value: number;
      currency: 'ars' | 'brl' | 'usd';
    };
  } | null;
  extra?: Record<string, unknown>;
}) {
  const {
    data,
    categorias,
    includeItems,
    selectedTransportes,
    noIncludeItems,
    condicionesItems,
    addons,
    salidas,
    fechaVencimiento,
    imageData,
    existingBookingConfig,
    extra,
  } = args;

  const { normalizedCategoriaIds, primaryCategoriaId, nombreCategoria } = getPackagePrimaryCategoryData(categorias, data.categoriaIds);
  const normalizedTipos = normalizePackageTypes(data.tipos);
  const primaryTipo = normalizedTipos[0];
  const sanitizedSalidas = sanitizePackageSalidas(salidas);
  const bookingCurrency = data.moneda === 'USD' ? 'usd' : 'ars';
  const peopleCategories = normalizePeopleCategories(data.peopleCategories, data.maxPersonasPorReserva);

  const descripcionHtml = sanitizePackageRichHtml(data.descripcion);
  const itinerarioSteps = (data.itinerarioSteps ?? [])
    .map((step) => ({
      id: String(step.id ?? '').trim(),
      titulo: String(step.titulo ?? '').trim(),
      descripcion: sanitizePackageRichHtml(step.descripcion),
    }))
    .filter((step) => Boolean(step.id) && (Boolean(step.titulo) || hasMeaningfulRichText(step.descripcion)));

  const itinerarioLegacyHtml = itinerarioSteps
    .map((step) => {
      const safeTitle = sanitizePackageRichHtml(step.titulo ? `<h3>${step.titulo}</h3>` : '');
      return `${safeTitle}${step.descripcion}`;
    })
    .join('<hr />');

  return {
    titulo: data.titulo.trim(),
    descripcion: descripcionHtml,
    descripcionLarga: descripcionHtml,
    descripcionCorta: data.descripcionCorta?.trim() || '',
    itinerario: itinerarioLegacyHtml,
    itinerarioSteps,
    mostrarItinerario: Boolean(data.mostrarItinerario),
    mapaGoogleEmbedUrl: data.mapaGoogleEmbedUrl?.trim() || '',
    destino: nombreCategoria,
    categoriaId: primaryCategoriaId,
    categoriaIds: normalizedCategoriaIds,
    tipo: primaryTipo,
    tipos: normalizedTipos,
    precio: Number(data.precio) || 0,
    moneda: data.moneda,
    mostrarDesde: Boolean(data.mostrarDesde),
    duracion: data.duracion.trim(),
    incluye: includeItems.map((item) => item.trim()).filter(Boolean),
    tiposTransporte: selectedTransportes,
    noIncluye: noIncludeItems.map((item) => item.trim()).filter(Boolean),
    condiciones: condicionesItems
      .map((item) => ({
        titulo: item.titulo.trim(),
        texto: item.texto.trim(),
      }))
      .filter((item) => item.titulo.length > 0 && item.texto.length > 0),
    salidas: sanitizedSalidas,
    addons: (Array.isArray(addons) ? addons : [])
      .map((item) => ({
        id: String((item as any)?.id ?? '').trim(),
        title: String((item as any)?.title ?? '').trim(),
        description: String((item as any)?.description ?? '').trim(),
        price: Math.max(0, Number((item as any)?.price ?? 0) || 0),
        image: String((item as any)?.image ?? '').trim(),
        imageKey: String((item as any)?.imageKey ?? '').trim() || null,
        enabled: (item as any)?.enabled !== false,
      }))
      .filter((item) => Boolean(item.id) && Boolean(item.title) && item.price > 0)
      .slice(0, MAX_PACKAGE_ADDONS),
    seatSelectionEnabled: false,
    seatLayoutId: null,
    bookingConfig: {
      enabled: Boolean(data.reservasHabilitadas),
      title: data.titulo.trim(),
      subtitle1: data.descripcionCorta?.trim() || '',
      subtitle2: data.duracion.trim(),
      hasSpecificDates: sanitizedSalidas.length > 0,
      peopleCategories,
      dates: sanitizedSalidas.map((salida) => ({
        date: salida.fecha,
        enabled: true,
        price: Math.max(0, Number(salida.precio ?? 0) || 0),
      })),
      maxPeoplePerBooking: Math.max(1, Number(data.maxPersonasPorReserva) || 1),
      minLeadHours: Number.isFinite(Number(data.minLeadHours))
        ? Math.max(0, Math.min(MAX_MIN_LEAD_HOURS, Math.floor(Number(data.minLeadHours))))
        : DEFAULT_MIN_LEAD_HOURS,
      currency: bookingCurrency,
      depositAmount: Math.max(0, Number(existingBookingConfig?.depositAmount ?? 0) || 0),
      paymentMethods: {
        mercadoPago: existingBookingConfig?.paymentMethods?.mercadoPago !== false,
      },
      ...(existingBookingConfig?.referralCommission
        ? {
            referralCommission: existingBookingConfig.referralCommission,
          }
        : {}),
    },
    fechaVencimiento: fechaVencimiento.trim() || '',
    reservationPricing: null,
    imagenPrincipal: imageData.imagenPrincipal,
    imagenPrincipalKey: imageData.imagenPrincipalKey ?? null,
    imagenTarjeta: imageData.imagenTarjeta,
    imagenTarjetaKey: imageData.imagenTarjetaKey ?? null,
    imagenPortada: imageData.imagenPortada,
    imagenPortadaKey: imageData.imagenPortadaKey ?? null,
    imagenPortadaMobile: imageData.imagenPortadaMobile ?? imageData.imagenPortada,
    imagenPortadaMobileKey: imageData.imagenPortadaMobileKey ?? imageData.imagenPortadaKey ?? null,
    imagenPortadaDesktop: imageData.imagenPortadaDesktop ?? imageData.imagenPortada,
    imagenPortadaDesktopKey: imageData.imagenPortadaDesktopKey ?? imageData.imagenPortadaKey ?? null,
    galeria: imageData.galeria,
    galeriaKeys: imageData.galeriaKeys ?? [],
    visible: Boolean(data.visible),
    destacado: Boolean(data.destacado),
    ctaWhatsApp: Boolean(data.ctaWhatsApp),
    ...(data.tarifaEspecialHabilitada
      ? {
          precioDescuentoPrimerosCupos: Number(data.tarifaEspecialPrecio) || 0,
          tarifaEspecialFechaLimite: data.tarifaEspecialFechaLimite?.trim() || '',
        }
      : {}),
    ...(extra ?? {}),
  };
}
