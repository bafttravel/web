'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import AdminReservaForm from '@/components/admin/AdminReservaForm';
import { getPaquetes } from '@/lib/paquetes';
import type { Paquete } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import type { Reservation } from '@/components/landing-reserva/types';

type ReservationInitialData = NonNullable<ComponentProps<typeof AdminReservaForm>['initialData']>;

const copyableExtraCodes = new Set(['cocheCama', 'panoramicos', 'cafeteras']);

function buildDuplicateData(reservation: Reservation): ReservationInitialData {
  const people = Math.max(1, Number(reservation.people) || 1);
  const minors = Math.max(0, Number(reservation.peopleMinors) || 0);
  const sourceExtras = Array.isArray(reservation.selectedExtras) ? reservation.selectedExtras : [];
  const sourceData = reservation as Reservation & { selectedExtraCodes?: string[] };
  const selectedExtraCodes = [
    ...(Array.isArray(sourceData.selectedExtraCodes) ? sourceData.selectedExtraCodes : []),
    ...sourceExtras.map((extra) => String(extra.code ?? '')),
  ].filter((code, index, all) => copyableExtraCodes.has(code) && all.indexOf(code) === index);

  return {
    packageId: reservation.packageId || reservation.experienceId,
    date: reservation.date,
    peopleAdults: typeof reservation.peopleAdults === 'number' ? reservation.peopleAdults : Math.max(0, people - minors),
    peopleMinors: typeof reservation.peopleMinors === 'number' ? reservation.peopleMinors : 0,
    customerName: reservation.customerName,
    customerEmail: reservation.customerEmail,
    customerPhone: reservation.customerPhone ?? '',
    customerCountry: reservation.customerCountry ?? '',
    customerDocument: reservation.customerDocument ?? '',
    customerBirthDate: reservation.customerBirthDate ?? '',
    customerComments: reservation.customerComments ?? '',
    selectedExtraCodes,
    manualExtras: sourceExtras
      .filter((extra) => String(extra.code) === 'manualExtra')
      .map((extra) => ({ title: extra.label, price: Math.max(0, Number(extra.amount) || 0) / 100 })),
    passengerDetails: Array.isArray(reservation.passengerDetails) ? reservation.passengerDetails : [],
  };
}

export default function AdminReservaNuevaPage() {
  const { user, loading: authLoading } = useAuth();
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeReady, setRouteReady] = useState(false);
  const [duplicateFrom, setDuplicateFrom] = useState<string | null>(null);
  const [duplicateData, setDuplicateData] = useState<ReservationInitialData | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('duplicateFrom')?.trim();
    setDuplicateFrom(id || null);
    setRouteReady(true);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const fetchPaquetes = async () => {
      try {
        const data = await getPaquetes();
        if (!isCancelled) {
          setPaquetes(data);
        }
      } catch (error) {
        console.error('[admin/reservas/nueva] Error cargando paquetes:', error);
        toast.error('No pudimos cargar los paquetes disponibles');
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchPaquetes();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!routeReady || !duplicateFrom || authLoading) return;
    if (!user) {
      setDuplicateError('Iniciá sesión nuevamente para cargar los datos de la reserva original.');
      return;
    }

    let cancelled = false;
    setDuplicateLoading(true);
    setDuplicateError(null);
    const loadReservation = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/admin/reservas/${encodeURIComponent(duplicateFrom)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? 'No se pudo cargar la reserva original');
        if (!payload?.reservation) throw new Error('No se encontró la reserva original');
        if (!cancelled) setDuplicateData(buildDuplicateData(payload.reservation as Reservation));
      } catch (error) {
        if (!cancelled) setDuplicateError(error instanceof Error ? error.message : 'No se pudo cargar la reserva original');
      } finally {
        if (!cancelled) setDuplicateLoading(false);
      }
    };

    void loadReservation();
    return () => {
      cancelled = true;
    };
  }, [authLoading, duplicateFrom, routeReady, user]);

  const waitingForDuplicate = Boolean(duplicateFrom && !duplicateData && !duplicateError);

  return (
    <ProtectedRoute>
      <AdminLayout>
        <div className="space-y-6">
          {loading || !routeReady || waitingForDuplicate || duplicateLoading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-9 w-24 bg-gray-200 rounded-lg animate-pulse" />
                <div className="space-y-2">
                  <div className="h-6 w-40 bg-gray-200 rounded-md animate-pulse" />
                  <div className="h-4 w-60 bg-gray-200 rounded-md animate-pulse" />
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={`exp-skel-${i}`} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              </div>
            </div>
          ) : duplicateError ? (
            <Card className="mx-auto max-w-xl border border-rose-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900">No se pudo duplicar la reserva</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-gray-600">
                <p>{duplicateError}</p>
                <Button asChild variant="outline"><Link href="/admin/ventas">Volver a ventas</Link></Button>
              </CardContent>
            </Card>
          ) : paquetes.length === 0 ? (
            <Card className="mx-auto max-w-xl border border-dashed border-gray-200 bg-white/80 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900">
                  No hay paquetes aún
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-gray-600">
                <p>
                  Primero necesitás crear al menos un paquete en el panel. Una vez listo, vas
                  a poder crear ventas manuales sin pasar por el checkout.
                </p>
                <Button asChild variant="default">
                  <Link href="/admin/paquetes/nuevo">Crear nuevo paquete</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <AdminReservaForm paquetes={paquetes} initialData={duplicateData ?? undefined} />
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
