'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import VendorProtectedRoute from '@/components/vendor/VendorProtectedRoute';
import VendorLayout from '@/components/vendor/VendorLayout';
import { useVendor } from '@/components/vendor/VendorContext';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Panel } from '@/components/vendor/parts';
import AdminReservaForm from '@/components/admin/AdminReservaForm';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { vendorFetch } from '@/lib/vendor-client';
import { SITE_NAME } from '@/lib/constants';
import type { Paquete } from '@/types';

function NuevaReserva() {
  const { user } = useAuth();
  const vendor = useVendor();
  const [packages, setPackages] = useState<Paquete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await vendorFetch<{ packages: Paquete[] }>(user, '/api/vendor/packages');
      setPackages(data.packages);
    } catch (e: any) {
      setError(e.message || 'No pudimos cargar las excursiones');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Nueva reserva"
        description={`Cargá una venta manual a tu nombre${vendor.defaultCommission ? '. La comisión se calcula automáticamente.' : '.'}`}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/vendedor/reservas">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Link>
          </Button>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <Panel>
          <LoadingBlock rows={6} />
        </Panel>
      ) : packages.length === 0 ? (
        <Panel>
          <EmptyState title="No tenés excursiones habilitadas" description={`Consultá con el equipo de ${SITE_NAME} para que te habiliten excursiones y poder cargar reservas manuales.`} />
        </Panel>
      ) : (
        <AdminReservaForm
          paquetes={packages}
          hideReferral
          hideVendorSelect
          hideStatus
          apiEndpoint="/api/vendor/reservas"
          successRedirect="/vendedor/reservas/:id"
        />
      )}
    </div>
  );
}

export default function VendorNuevaReservaPage() {
  return (
    <VendorProtectedRoute>
      <VendorLayout>
        <NuevaReserva />
      </VendorLayout>
    </VendorProtectedRoute>
  );
}
