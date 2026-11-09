import { Timestamp } from 'firebase/firestore';
import type { FaqItem as LandingFaqItem } from '@/components/landing-reserva/types';

export type { Experience, Testimonial } from '@/components/landing-reserva/types';
export type FaqItem = LandingFaqItem;

export interface Categoria {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string;
  orden: number;
  destacada: boolean;
  activa: boolean;
  imagen?: string;
  imagenKey?: string;
  fechaCreacion: Timestamp | Date;
}

export interface Salida {
  id: string;
  fecha: string; // YYYY-MM-DD (fecha de ida)
  fechaVuelta?: string; // YYYY-MM-DD (fecha de vuelta)
  ciudadSalida: string;
  precio: number;
  moneda: 'USD' | 'ARS' | 'EUR';
  cupo?: number;
  observaciones?: string;
  seatSelectionEnabled?: boolean;
  seatLayoutId?: string;
}

export type ReservationExtraCode = 'cocheCama' | 'panoramicos' | 'cafeteras' | 'packageAddon' | 'manualExtra';

export type ReservationExtraSelection = {
  code: ReservationExtraCode;
  label: string;
  amount: number;
  source?: 'seatLayout' | string | null;
  scope?: 'per_person' | 'per_booking' | string | null;
};

export type SeatLayoutAmenityConfig = {
  enabled?: boolean;
  amount?: number;
};

export type SeatLayoutAmenities = {
  cocheCama?: SeatLayoutAmenityConfig;
  panoramicos?: SeatLayoutAmenityConfig;
  cafeteras?: SeatLayoutAmenityConfig;
};

export type ReservationTravelerDetails = {
  nationality?: string;
  diet?: string;
  firstName: string;
  lastName: string;
  age: number;
  birthDate: string;
  phone: string;
  document: string;
  travelerType?: 'adult' | 'minor' | null;
};

export type ReservationPricingMode = 'fixed' | 'percent';

export type ReservationPricingConfig = {
  mode: ReservationPricingMode;
  fixedUnitAmount?: number | null;
  single?: { adultPercent: number; minorPercent?: number | null } | null;
  group?: { adultPercent: number; minorPercent?: number | null } | null;
  allowCustomPercent?: boolean | null;
};

export interface TicketPack {
  id: string;
  titulo: string;
  descripcion: string;
  moneda: 'USD' | 'ARS' | 'EUR';
  valor: number;
  imagenUrl?: string;
}

export interface PaqueteCondicion {
  titulo: string;
  texto: string;
}

/**
 * Adicional vendible de un paquete (ecosistema de upsell en el modal de reserva).
 * Precio en moneda mayor (ej. 15000 = $15.000 ARS); la imagen es URL pública o dataURL en edición.
 */
export interface PackageAddon {
  id: string;
  title: string;
  description: string;
  /** Precio total por reserva (una sola vez, no por persona). */
  price: number;
  /** URL pública de la imagen de tarjeta. */
  image?: string;
  /** Clave del blob en storage (para limpieza al reemplazar/eliminar). */
  imageKey?: string | null;
  enabled: boolean;
}

// FaqItem is re-exported from landing-reserva/types
export interface PaqueteBookingConfig {
  enabled: boolean;
  title: string;
  subtitle1: string;
  subtitle2: string;
  hasSpecificDates: boolean;
  peopleCategories?: Array<{
    key: string;
    label: string;
    min: number;
    max: number;
  }>;
  dates?: Array<{
    date: string;
    /** Legacy field; ignored by booking availability. */
    capacity?: number;
    enabled: boolean;
    price?: number;
    seatSelectionEnabled?: boolean;
    seatLayoutId?: string;
  }>;
  maxPeoplePerBooking?: number;
  /** Anticipación mínima (en horas) para reservar una fecha. Default 48. 0 = sin mínimo. */
  minLeadHours?: number;
  currency: 'ars' | 'usd' | 'brl';
  depositAmount: number;
  paymentMethods: {
    mercadoPago: boolean;
  };
  referralCommission?: {
    type: 'percent' | 'fixed';
    value: number;
    currency: 'ars' | 'brl' | 'usd';
  };
}

export interface Testimonio {
  nombre: string;
  comentario: string;
  rol?: string;
}

export type PaqueteItineraryStep = {
  id: string;
  titulo?: string;
  descripcion?: string;
};

export interface Paquete {
  operations?: import('@/lib/operations/types').PackageOperations;
  id: string;
  titulo: string;
  slug: string;
  descripcion: string;
  descripcionCorta?: string;
  descripcionLarga?: string;
  itinerario?: string;
  itinerarioSteps?: PaqueteItineraryStep[];
  mostrarItinerario?: boolean;
  mapaGoogleEmbedUrl?: string;
  subtitulo?: string;
  etiqueta?: string;
  tags?: string[];
  eventoLugar?: string;
  eventoFecha?: string; // YYYY-MM-DD
  destino?: string;
  categoriaId?: string;
  categoriaIds?: string[];
  tipo: string;
  tipos?: string[];
  precio: number;
  precioDescuentoPrimerosCupos?: number;
  tarifaEspecialFechaLimite?: string;
  moneda: 'USD' | 'ARS' | 'EUR';
  
  // Para landing pages
  imagenCard?: string;
  imagenes?: string[];
  capacidadMaxima?: number;
  faqs?: FaqItem[];
  testimonios?: Testimonio[];
  
  // Booking
  bookingConfig?: PaqueteBookingConfig;
  reservationPricing?: ReservationPricingConfig;
  seatSelectionEnabled?: boolean;
  seatLayoutId?: string;
  fechaVencimiento?: string;
  mostrarDesde: boolean;
  duracion: string;
  incluye: string[];
  tiposTransporte?: string[];
  noIncluye: string[];
  salidas: Salida[];
  imagenPrincipal: string;
  imagenPrincipalKey?: string;
  imagenTarjeta?: string;
  imagenTarjetaKey?: string;
  imagenPortada?: string;
  imagenPortadaKey?: string;
  imagenPortadaMobile?: string;
  imagenPortadaMobileKey?: string;
  imagenPortadaDesktop?: string;
  imagenPortadaDesktopKey?: string;
  galeria: string[];
  galeriaKeys?: string[];
  tickets?: TicketPack[];
  condiciones?: PaqueteCondicion[];
  /** Adicionales vendibles del paquete (ecosistema upsell). Máx. 20. */
  addons?: PackageAddon[];
  visible: boolean;
  destacado: boolean;
  fechaCreacion: Timestamp | Date;
  orden: number;
  ctaWhatsApp: boolean;
}

export type CartStatus = 'active' | 'checkout_started' | 'paid' | 'expired' | 'cancelled';
export type CartCurrency = 'ars' | 'brl' | 'usd';

export interface Cart {
  id: string;
  status: CartStatus;
  currency: CartCurrency;
  expiresAt: Timestamp | Date;
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  referral?: { code: string } | null;
  orderId?: string | null;
  checkoutIntentId?: string | null;
  mercadoPagoPreferenceId?: string | null;
  mercadoPagoPaymentId?: string | null;
}

export interface CartItem {
  id: string;
  cartId: string;
  packageId: string;
  packageSlug: string;
  packageTitle: string;
  date: string;
  people: number;
  peopleAdults?: number | null;
  peopleMinors?: number | null;
  selectedExtras?: ReservationExtraSelection[] | null;
  unitAmount: number;
  pricingMode?: ReservationPricingMode | null;
  pricingBaseUnitAmount?: number | null;
  unitAmountAdults?: number | null;
  unitAmountMinors?: number | null;
  depositPercentAdults?: number | null;
  depositPercentMinors?: number | null;
  baseSubtotalAmount?: number | null;
  extrasTotalAmount?: number | null;
  subtotalAmount: number;
  currency: CartCurrency;
  holdId: string;
  expiresAt: Timestamp | Date;
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  referralCode?: string | null;
  seatLayoutId?: string | null;
  selectedSeats?: string[] | null;
}

export type ReservationHoldStatus = 'active' | 'released' | 'consumed' | 'expired';

export interface ReservationHold {
  id: string;
  cartId: string;
  cartItemId: string;
  packageId: string;
  date: string;
  people: number;
  peopleAdults?: number | null;
  peopleMinors?: number | null;
  selectedExtras?: ReservationExtraSelection[] | null;
  pricingMode?: ReservationPricingMode | null;
  pricingBaseUnitAmount?: number | null;
  unitAmountAdults?: number | null;
  unitAmountMinors?: number | null;
  depositPercentAdults?: number | null;
  depositPercentMinors?: number | null;
  baseSubtotalAmount?: number | null;
  extrasTotalAmount?: number | null;
  status: ReservationHoldStatus;
  expiresAt: Timestamp | Date;
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  consumedAt?: Timestamp | Date | null;
  releasedAt?: Timestamp | Date | null;
  seatLayoutId?: string | null;
  selectedSeats?: string[] | null;
}

export type OrderStatus =
  | 'created'
  | 'checkout_started'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'needs_review';

export type OrderPaymentStatus = 'created' | 'pending' | 'approved' | 'rejected' | 'failed' | 'unknown';

export interface OrderItemSnapshot {
  cartItemId: string;
  holdId: string;
  packageId: string;
  packageSlug: string;
  packageTitle: string;
  date: string;
  people: number;
  peopleAdults?: number | null;
  peopleMinors?: number | null;
  selectedExtras?: ReservationExtraSelection[] | null;
  unitAmount: number;
  pricingMode?: ReservationPricingMode | null;
  pricingBaseUnitAmount?: number | null;
  unitAmountAdults?: number | null;
  unitAmountMinors?: number | null;
  depositPercentAdults?: number | null;
  depositPercentMinors?: number | null;
  baseSubtotalAmount?: number | null;
  extrasTotalAmount?: number | null;
  subtotalAmount: number;
  currency: CartCurrency;
  referralCode?: string | null;
  image?: string | null;
  seatLayoutId?: string | null;
  selectedSeats?: string[] | null;
}

export type SeatStatus = 'available' | 'held' | 'reserved' | 'paid' | 'blocked' | 'disabled';

export type SeatSpecialCellType = 'wc' | 'stairs' | 'driver' | 'empty';

export interface SeatLayoutSpecialCell {
  floor: number;
  row: number;
  col: number;
  type: SeatSpecialCellType;
  label?: string;
}

export interface SeatLayoutSeat {
  seatId: string;
  label: string;
  floor: number;
  row: number;
  col: number;
  disabled?: boolean;
  defaultBlocked?: boolean;
}

export interface SeatLayoutTemplate {
  id: string;
  name: string;
  busType: string;
  status?: 'draft' | 'published';
  floors: number;
  rows: number;
  cols: number;
  aisleCols?: number[];
  startNumber?: number;
  autoNumbering?: boolean;
  showRowLabels?: boolean;
  seats: SeatLayoutSeat[];
  specialCells?: SeatLayoutSpecialCell[];
  amenities?: SeatLayoutAmenities;
  notes?: string;
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface DepartureSeat {
  id: string;
  seatId: string;
  label: string;
  floor: number;
  row: number;
  col: number;
  baseStatus: 'available' | 'blocked' | 'disabled';
  status: SeatStatus;
  holdId?: string | null;
  cartId?: string | null;
  cartItemId?: string | null;
  orderId?: string | null;
  reservationId?: string | null;
  expiresAt?: Timestamp | Date | null;
  blockedBy?: 'default' | 'admin' | null;
  blockReason?: string | null;
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface OrderPayment {
  provider: 'mercadopago';
  externalReference: string;
  preferenceId?: string | null;
  initPoint?: string | null;
  paymentId?: string | null;
  status?: OrderPaymentStatus;
  statusDetail?: string | null;
  updatedAt?: Timestamp | Date | null;
}

export interface Order {
  id: string;
  status: OrderStatus;
  cartId: string;
  checkoutIntentId?: string | null;
  currency: CartCurrency;
  amountTotal: number;
  items: OrderItemSnapshot[];
  referral?: { code: string } | null;
  customer?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    document?: string | null;
    birthDate?: string | null;
    comments?: string | null;
  } | null;
  passengerDetails?: ReservationTravelerDetails[] | null;
  expiresAt: Timestamp | Date;
  payment: OrderPayment;
  processedPaymentIds?: string[];
  reservationIds?: string[];
  failureReason?: string | null;
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  paidAt?: Timestamp | Date | null;
}

export interface BlogPost {
  id: string;
  titulo: string;
  slug: string;
  extracto: string;
  contenido: string;
  imagenPrincipal?: string;
  imagenTarjeta?: string;
  imagenPortada?: string;
  visible: boolean;
  destacado: boolean;
  orden: number;
  fechaPublicacion: Timestamp | Date;
  fechaCreacion: Timestamp | Date;
}

export interface Consulta {
  id?: string;
  nombre: string;
  email: string;
  telefono: string;
  mensaje: string;
  paquete?: string;
  paqueteId?: string; // Slug del paquete para construir la URL
  ticketId?: string;
  cantidadPersonas?: number;
  ciudad?: string;
  codigoPostal?: string;
  fechaCreacion: Timestamp | Date;
  leida: boolean;
}
export interface Cliente {
  id: string; // UID de Firebase Auth
  nombre?: string;
  apellido?: string;
  nombreCompleto?: string;
  email: string;
  telefono?: string;
  ciudad?: string;
  codigoPostal?: string;
  cantidadPersonas?: number;
  photoURL?: string;
  provider?: 'password' | 'google';
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}
