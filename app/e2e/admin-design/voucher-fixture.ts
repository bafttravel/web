import type { Reservation } from '@/components/landing-reserva/types';
import { EMPTY_RESERVATION_OPERATIONS } from '@/lib/operations/types';

/** Synthetic customer data; never read or write a business reservation here. */
export const voucherFixture: Reservation & { reservationCode: string; createdByName: string; confirmedByName: string } = {
  id: 'fixture-voucher', reservationCode: 'DEMO-5806', customerName: 'María de Prueba', customerEmail: 'demo@example.test',
  packageTitle: 'Discovery C/T', experienceTitle: 'Discovery C/T', experienceId: 'fixture-package', experienceSlug: 'fixture',
  date: '2027-01-17', people: 2, peopleAdults: 2, peopleMinors: 0, amountTotal: 20000000, currency: 'ARS',
  paymentMethod: 'admin', status: 'reserved', createdAt: {},
  createdByName: 'Operador de prueba', confirmedByName: 'Administradora de prueba',
  operations: { ...EMPTY_RESERVATION_OPERATIONS, room: 'LEGACY-ROOM-SECRET', pickupType: 'hotel', pickupHotelId: 'fixture-hotel', pickupHotelName: 'Hostería de Prueba', pickupAddress: 'Avenida del Lago 100', pickupTime: '07:30', sellerHotelName: '', commissions: null, providers: [], costsComplete: false, version: 1 },
};
