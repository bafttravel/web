import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PaqueteSidebar from '@/components/PaqueteSidebar';
import type { Paquete } from '@/types';
import type { BookingAvailabilityItem } from '@/lib/packages/booking-calendar';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type SearchParams = Promise<{ mode?: string }>;

function buildMockPaquete(hasDates: boolean): Paquete {
  return {
    id: 'e2e-mock',
    titulo: 'Excursión E2E',
    slug: 'e2e-mock',
    descripcion: 'Mock',
    tipo: 'grupal',
    tipos: ['grupal'],
    precio: 85000,
    moneda: 'ARS',
    mostrarDesde: true,
    duracion: '2 días',
    incluye: [],
    noIncluye: [],
    salidas: [],
    galeria: [],
    imagenPrincipal: '',
    visible: true,
    destacado: false,
    fechaCreacion: new Date(),
    orden: 1,
    ctaWhatsApp: false,
    bookingConfig: {
      enabled: true,
      title: 'Reserva',
      subtitle1: '',
      subtitle2: '',
      hasSpecificDates: hasDates,
      maxPeoplePerBooking: 6,
      currency: 'ars',
      depositAmount: 85000,
      paymentMethods: { mercadoPago: true },
      peopleCategories: [
        { key: 'adults', label: 'Adultos', min: 1, max: 6 },
        { key: 'children', label: 'Niños', min: 0, max: 6 },
        { key: 'minors', label: 'Menores', min: 0, max: 6 },
      ],
      dates: [],
    },
  };
}

function buildMockAvailability(): BookingAvailabilityItem[] {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const d1 = new Date(today);
  d1.setDate(d1.getDate() + 10);
  const d2 = new Date(today);
  d2.setDate(d2.getDate() + 12);
  return [
    { date: iso(d1) },
    { date: iso(d2) },
  ];
}

export default async function BookingE2EPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  const mode = String(params.mode ?? '').trim();
  const hasDates = mode === 'dates';
  const paquete = buildMockPaquete(hasDates);
  const bookingDates = hasDates ? buildMockAvailability() : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="text-sm font-bold text-slate-900">BAFT E2E</div>
          <div className="mt-2 text-2xl font-black text-slate-900">Booking Sandbox</div>
          <div className="mt-2 text-sm text-slate-600">
            Esta página es solo para pruebas automáticas. No está indexada por buscadores.
          </div>
        </div>
        <PaqueteSidebar paquete={paquete} bookingDates={bookingDates} />
      </div>
    </div>
  );
}
