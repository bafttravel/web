'use client';
import AdminReservaForm from '@/components/admin/AdminReservaForm';
import type { Paquete } from '@/types';
import { loadManualReservationFixtureHotels } from './manual-reservation';

const excursion: Paquete = {
  id: 'fixture-trekking', titulo: 'Minitrekking', slug: 'fixture-trekking', descripcion: '', tipo: 'excursion',
  precio: 395000, moneda: 'ARS', mostrarDesde: false, duracion: '8 horas', incluye: [], noIncluye: [],
  salidas: [{ id: 'departure-1', fecha: '2030-01-17', ciudadSalida: 'El Calafate', precio: 395000, moneda: 'ARS' }],
  imagenPrincipal: '', galeria: [], visible: true, destacado: false, fechaCreacion: new Date('2026-01-01'), orden: 0, ctaWhatsApp: false,
  addons: [{ id: 'transfer', title: 'Traslado a la excursión', description: '', price: 80000, enabled: true }],
};
const packages: Paquete[] = [excursion, {
  ...excursion, id: 'fixture-glaciers', titulo: 'Todo Glaciares', slug: 'fixture-glaciers', precio: 175000, addons: [],
  salidas: ['2030-02-10', '2030-02-12'].map((fecha, i) => ({ id: `glaciers-${i}`, fecha, ciudadSalida: 'El Calafate', precio: 175000, moneda: 'ARS' })),
}, { ...excursion, id: 'fixture-no-date', titulo: 'Servicio a coordinar', slug: 'fixture-no-date', salidas: [], addons: [] }];
const loadAddonPackages = async () => packages;

/** Real form and pricing engine, synthetic catalog. No real catalog reads or writes. */
export default function ReservationFormPreview() {
  return <AdminReservaForm paquetes={packages} loadAddonPackages={loadAddonPackages} loadManualHotels={loadManualReservationFixtureHotels} />;
}
