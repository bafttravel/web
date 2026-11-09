'use client';
import AdminDatePicker from '@/components/admin/AdminDatePicker';
import { adminDateLabel, adminDateTimeLabel } from '@/lib/admin/dates';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Ban,
  Calendar,
  Copy,
  CopyPlus,
  Eye,
  FileDown,
  Loader2,
  Mail,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { getPaquetes } from '@/lib/paquetes';
import { useAuth } from '@/hooks/useAuth';

import type { Reservation, ReservationStatus } from '@/components/landing-reserva/types';
import type { Order, Paquete } from '@/types';
import {
  buildVentaStatuses,
  paymentMethodLabel,
} from '@/lib/sales/status';

import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminPagination from '@/components/admin/AdminPagination';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function formatDate(iso: string): string {
  return iso === 'sin-fecha' ? 'A coordinar' : adminDateLabel(iso);
}

function formatDateTime(date: unknown): string {
  return adminDateTimeLabel(date);
}

function toTimestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return Number((value as { seconds?: number }).seconds ?? 0) * 1000;
  }
  return 0;
}

function formatAmount(amountTotal: number, currency: string): string {
  const value = (amountTotal ?? 0) / 100;
  if (currency?.toUpperCase() === 'ARS') return `$${value.toLocaleString('es-AR')}`;
  if (currency?.toUpperCase() === 'BRL') return `R$ ${value.toLocaleString('pt-BR')}`;
  return `${value.toFixed(2)} ${String(currency ?? '').toUpperCase()}`;
}

function formatShortDate(iso: string): string {
  return formatDate(iso);
}

function getUnitAmountFromReservation(r: Reservation): number | null {
  const snapshot = r.pricingSnapshot;
  if (typeof snapshot?.unitAmount === 'number' && snapshot.unitAmount > 0) return snapshot.unitAmount;
  if (typeof r.amountTotal === 'number' && r.amountTotal > 0 && typeof r.people === 'number' && r.people > 0) {
    if (r.amountTotal % r.people === 0) return Math.round(r.amountTotal / r.people);
  }
  return null;
}

const statusBadgeVariant: Record<
  Reservation['status'],
  'default' | 'outline' | 'secondary' | 'destructive'
> = {
  completed: 'default',
  reserved: 'secondary',
  pending: 'outline',
  cancelled: 'destructive',
};

const statusOptions: { label: string; value: Reservation['status'] }[] = [
  { label: 'Reservadas', value: 'reserved' },
  { label: 'Completadas', value: 'completed' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Canceladas', value: 'cancelled' },
];

const paymentOptions = [
  { label: 'Todas', value: 'all' },
  { label: 'Mercado Pago', value: 'mercadopago' },
  { label: 'Manual', value: 'admin' },
] as const;

type DialogState =
  | { type: 'none' }
  | { type: 'cancel'; reserva: Reservation }
  | { type: 'reprogram'; reserva: Reservation }
  | { type: 'upload'; reserva: Reservation };

type SaleRow =
  | {
      kind: 'reservation';
      id: string;
      sortAt: number;
      filterStatus: Reservation['status'];
      packageId: string;
      date: string;
      paymentMethod: 'mercadopago' | 'admin';
      amountTotal: number;
      people: number;
      searchIndex: string;
      reservation: Reservation;
    }
  | {
      kind: 'order';
      id: string;
      sortAt: number;
      filterStatus: Reservation['status'];
      packageId: string;
      date: string;
      paymentMethod: 'mercadopago';
      amountTotal: number;
      people: number;
      searchIndex: string;
      order: Order;
    };

function mapOrderToFilterStatus(order: Order): Reservation['status'] {
  if (order.status === 'paid') return 'completed';
  if (order.status === 'failed' || order.status === 'cancelled' || order.status === 'expired') return 'cancelled';
  if (order.status === 'needs_review') return 'reserved';
  return 'pending';
}

function getOrderCommercialStatusLabel(order: Order): string {
  switch (order.status) {
    case 'paid':
      return 'Pago aprobado';
    case 'pending':
      return 'Pago pendiente';
    case 'failed':
      return 'Pago fallido';
    case 'cancelled':
      return 'Cancelada';
    case 'expired':
      return 'Expirada';
    case 'needs_review':
      return 'Revisión manual';
    case 'checkout_started':
      return 'Checkout iniciado';
    default:
      return 'Creada';
  }
}

function getOrderStatusBadgeVariant(order: Order): 'default' | 'outline' | 'secondary' | 'destructive' {
  if (order.status === 'paid') return 'default';
  if (order.status === 'needs_review') return 'secondary';
  if (order.status === 'failed' || order.status === 'cancelled' || order.status === 'expired') return 'destructive';
  return 'outline';
}

export default function ReservasPage() {
  const { user } = useAuth();

  const [reservas, setReservas] = useState<Reservation[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPackageId, setFilterPackageId] = useState<string>('all');
  const [filterDate, setFilterDate] = useState('');
  const [statusFilters, setStatusFilters] = useState<Reservation['status'][]>(['reserved', 'completed', 'pending']);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<(typeof paymentOptions)[number]['value']>('all');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [dialog, setDialog] = useState<DialogState>({ type: 'none' });
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionLoadingType, setActionLoadingType] = useState<'cancel' | 'pdf' | 'delete' | null>(null);
  const [selectedReservationIds, setSelectedReservationIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const fetchData = async (opts?: { keepLoading?: boolean }) => {
    if (!user) return;
    try {
      if (!opts?.keepLoading) setLoading(true);
      const token = await user.getIdToken();
      const [salesResponse, paquetesData] = await Promise.all([
        fetch('/api/admin/ventas', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        }),
        getPaquetes(),
      ]);
      const salesPayload = await salesResponse.json().catch(() => null);
      if (!salesResponse.ok) {
        throw new Error(salesPayload?.error ?? 'No se pudieron cargar las ventas');
      }
      const reservasData = Array.isArray(salesPayload?.reservas) ? salesPayload.reservas : [];
      const ordersData = Array.isArray(salesPayload?.orders) ? salesPayload.orders : [];
      setReservas(reservasData);
      setOrders(ordersData);
      setPaquetes(paquetesData);
    } catch (error) {
      console.error('Error cargando ventas:', error);
      toast.error('Error al cargar ventas');
    } finally {
      if (!opts?.keepLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const ventas = useMemo<SaleRow[]>(() => {
    const reservationRows: SaleRow[] = reservas.map((reservation) => ({
      kind: 'reservation',
      id: reservation.id,
      sortAt: toTimestampMs(reservation.createdAt),
      filterStatus: reservation.status,
      packageId: reservation.packageId || reservation.experienceId || '',
      date: reservation.date,
      paymentMethod: reservation.createdByAdmin ? 'admin' : (reservation.paymentMethod ?? 'mercadopago'),
      amountTotal: reservation.amountTotal ?? 0,
      people: reservation.people ?? 0,
      searchIndex: [
        reservation.id,
        reservation.customerName,
        reservation.customerEmail,
        reservation.experienceTitle,
        reservation.mercadoPagoPaymentId,
        reservation.referredBy?.vendorName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
      reservation,
    }));

    const orderRows: SaleRow[] = orders
      .filter((order) => !Array.isArray(order.reservationIds) || order.reservationIds.length === 0)
      .map((order) => {
        const firstItem = order.items?.[0];
        return {
          kind: 'order',
          id: order.id,
          sortAt: toTimestampMs(order.createdAt),
          filterStatus: mapOrderToFilterStatus(order),
          packageId: firstItem?.packageId ?? '',
          date: firstItem?.date ?? '',
          paymentMethod: 'mercadopago',
          amountTotal: order.amountTotal ?? 0,
          people: firstItem?.people ?? order.items?.reduce((sum, item) => sum + (item.people ?? 0), 0) ?? 0,
          searchIndex: [
            order.id,
            order.customer?.name,
            order.customer?.email,
            order.payment?.paymentId,
            order.payment?.externalReference,
            firstItem?.packageTitle,
            firstItem?.holdId,
            ...(firstItem?.selectedSeats ?? []),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
          order,
        };
      });

    return [...reservationRows, ...orderRows].sort((a, b) => b.sortAt - a.sortAt);
  }, [orders, reservas]);

  const ventasFiltradas = useMemo(() => {
    let list = ventas;
    if (filterPackageId !== 'all') {
      list = list.filter((sale) => sale.packageId === filterPackageId);
    }
    if (filterDate.trim()) {
      list = list.filter((sale) => sale.date === filterDate.trim());
    }
    if (statusFilters.length > 0) {
      list = list.filter((sale) => statusFilters.includes(sale.filterStatus));
    }
    if (paymentMethodFilter !== 'all') {
      list = list.filter((sale) => sale.paymentMethod === paymentMethodFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter((sale) => sale.searchIndex.includes(q));
    }
    return list;
  }, [ventas, filterPackageId, filterDate, statusFilters, paymentMethodFilter, searchTerm]);

  const ventasPaginadas = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return ventasFiltradas.slice(start, start + itemsPerPage);
  }, [ventasFiltradas, currentPage, itemsPerPage]);

  const selectablePageIds = ventasPaginadas
    .filter((sale): sale is Extract<SaleRow, { kind: 'reservation' }> => sale.kind === 'reservation')
    .map((sale) => sale.id);
  const selectedOnPage = selectablePageIds.filter((id) => selectedReservationIds.has(id)).length;
  const pageCheckboxState = selectablePageIds.length > 0 && selectedOnPage === selectablePageIds.length
    ? true
    : selectedOnPage > 0
      ? 'indeterminate'
      : false;

  useEffect(() => {
    setCurrentPage(1);
    setSelectedReservationIds(new Set());
  }, [searchTerm, filterPackageId, filterDate, statusFilters, paymentMethodFilter]);

  const totalAmount = useMemo(
    () => ventasFiltradas.reduce((acc, sale) => acc + (sale.amountTotal ?? 0), 0),
    [ventasFiltradas]
  );
  const totalPeople = useMemo(
    () => ventasFiltradas.reduce((acc, sale) => acc + (sale.people ?? 0), 0),
    [ventasFiltradas]
  );

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todaySales = useMemo(
    () =>
      ventas.filter((sale) => sale.date === todayIso && sale.filterStatus !== 'cancelled'),
    [todayIso, ventas]
  );
  const todayAmount = useMemo(
    () => todaySales.reduce((acc, sale) => acc + (sale.amountTotal ?? 0), 0),
    [todaySales]
  );
  const todayPeople = useMemo(
    () => todaySales.reduce((acc, sale) => acc + (sale.people ?? 0), 0),
    [todaySales]
  );

  const toggleStatus = (status: Reservation['status']) => {
    setStatusFilters((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  };

  const toggleReservationSelection = (reservationId: string, checked: boolean) => {
    setSelectedReservationIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(reservationId);
      else next.delete(reservationId);
      return next;
    });
  };

  const togglePageSelection = (checked: boolean) => {
    setSelectedReservationIds((previous) => {
      const next = new Set(previous);
      selectablePageIds.forEach((id) => checked ? next.add(id) : next.delete(id));
      return next;
    });
  };

  const openBulkDelete = () => {
    const count = selectedReservationIds.size;
    if (count === 0 || bulkDeleteLoading) return;
    const confirmationMessage = count === 1
      ? '¿Eliminar definitivamente la reserva seleccionada?'
      : `¿Eliminar definitivamente las ${count} reservas seleccionadas?`;
    if (!window.confirm(confirmationMessage)) return;
    void runBulkDelete();
  };

  const updateReservation = async (payload: {
    reservationId: string;
    status?: ReservationStatus;
    note?: string;
  }) => {
    if (!user) {
      toast.error('Debés iniciar sesión para ejecutar esta acción');
      return false;
    }
    setActionLoadingId(payload.reservationId);
    setActionLoadingType('cancel');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/reservas', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'No se pudo actualizar la reserva');
      }

      // Recarga parcial (optimista): actualizamos solo lo que sabemos.
      setReservas((prev) =>
        prev.map((r) => {
          if (r.id !== payload.reservationId) return r;
          const next: Reservation = { ...r };
          if (payload.status) next.status = payload.status;
          return next;
        })
      );

      toast.success('Venta actualizada');
      fetchData({ keepLoading: true }).catch(() => null);
      return true;
    } catch (error) {
      console.error('[Ventas] Error actualizando venta:', error);
      toast.error('No pudimos actualizar la venta');
      return false;
    } finally {
      setActionLoadingId(null);
      setActionLoadingType(null);
    }
  };

  const openCancel = (reserva: Reservation) => setDialog({ type: 'cancel', reserva });
  const openDelete = (reserva: Reservation) => {
    const reservationCode = String((reserva as any).reservationCode || reserva.id);
    if (!window.confirm(`¿Eliminar definitivamente la reserva ${reservationCode}?`)) return;
    void runDelete(reserva);
  };

  const downloadVoucher = async (reserva: Reservation) => {
    if (!user) {
      toast.error('Debés iniciar sesión para descargar el PDF');
      return;
    }
    setActionLoadingId(reserva.id);
    setActionLoadingType('pdf');
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/reservas/${encodeURIComponent(reserva.id)}/voucher`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'No se pudo generar el PDF');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const reservationCode = String((reserva as any).reservationCode || reserva.id).replace(/[^\w.-]+/g, '-');
      link.href = url;
      link.download = `voucher-${reservationCode}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('PDF descargado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo descargar el PDF');
    } finally {
      setActionLoadingId(null);
      setActionLoadingType(null);
    }
  };

  const runDelete = async (reserva: Reservation) => {
    if (!user) {
      toast.error('Debés iniciar sesión para ejecutar esta acción');
      return;
    }
    setActionLoadingId(reserva.id);
    setActionLoadingType('delete');
    try {
      const token = await user.getIdToken();
      const confirmationCode = String((reserva as any).reservationCode || reserva.id);
      const response = await fetch(`/api/admin/reservas/${encodeURIComponent(reserva.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationCode }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? 'No se pudo borrar la reserva');

      setSelectedReservationIds((previous) => {
        if (!previous.has(reserva.id)) return previous;
        const next = new Set(previous);
        next.delete(reserva.id);
        return next;
      });
      await fetchData({ keepLoading: true });
      toast.success('Reserva eliminada', {
        description: 'Se conservó la evidencia financiera y contable asociada.',
      });
      if (Number(body?.fileDeletionWarnings) > 0) {
        toast.warning('Algunos archivos no pudieron eliminarse', {
          description: 'La reserva fue borrada; revisá el registro del servidor para limpiar esos archivos.',
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo borrar la reserva');
    } finally {
      setActionLoadingId(null);
      setActionLoadingType(null);
    }
  };

  const runBulkDelete = async () => {
    if (!user || selectedReservationIds.size === 0 || bulkDeleteLoading) return;
    const ids = Array.from(selectedReservationIds);
    const expectedConfirmation = `ELIMINAR ${ids.length}`;

    const completedIds = new Set<string>();
    const failures: string[] = [];
    let fileDeletionWarnings = 0;
    let requestError = '';
    setBulkDeleteLoading(true);

    try {
      const token = await user.getIdToken();
      const chunkSize = 25;
      for (let offset = 0; offset < ids.length; offset += chunkSize) {
        const chunk = ids.slice(offset, offset + chunkSize);
        const response = await fetch('/api/admin/reservas/bulk-delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ids: chunk, totalCount: ids.length, confirmationCode: expectedConfirmation }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? 'No se pudo completar el borrado masivo');

        const resultById = new Map<string, any>(
          (Array.isArray(body?.results) ? body.results : []).map((result: any) => [String(result.id), result]),
        );
        for (const id of chunk) {
          const result = resultById.get(id);
          if (!result) {
            failures.push(id);
            continue;
          }
          if (result.error) {
            failures.push(id);
            continue;
          }
          completedIds.add(id);
          fileDeletionWarnings += Number(result.fileDeletionWarnings ?? 0);
        }
      }
    } catch (error) {
      requestError = error instanceof Error ? error.message : 'No se pudo completar el borrado masivo';
    } finally {
      if (completedIds.size > 0) {
        setSelectedReservationIds((previous) => {
          const next = new Set(previous);
          completedIds.forEach((id) => next.delete(id));
          return next;
        });
        await fetchData({ keepLoading: true });
      }
      setBulkDeleteLoading(false);
    }

    if (completedIds.size > 0) {
      if (failures.length || requestError) {
        toast.warning(`${completedIds.size} de ${ids.length} reservas procesadas`, {
          description: `${failures.length + (requestError ? ids.length - completedIds.size - failures.length : 0)} reserva(s) no se pudieron confirmar. La selección restante se conservó para reintentar.`,
        });
      } else {
        toast.success(`${completedIds.size} reservas eliminadas`, {
          description: 'Se conservó la evidencia financiera y contable asociada.',
        });
      }
    } else if (requestError) {
      toast.error(requestError);
    } else if (failures.length) {
      toast.error(`No se pudieron eliminar ${failures.length} reservas`, {
        description: 'La selección se conservó para que puedas reintentar.',
      });
    }

    if (fileDeletionWarnings > 0) {
      toast.warning('Algunos archivos no pudieron eliminarse', {
        description: 'Las reservas fueron borradas; revisá el registro del servidor para limpiar esos archivos.',
      });
    }
  };

  const runCancel = async () => {
    if (dialog.type !== 'cancel') return;
    const updated = await updateReservation({
      reservationId: dialog.reserva.id,
      status: 'cancelled',
      note: 'Cancelada desde el panel admin',
    });
    if (updated) setDialog({ type: 'none' });
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout>
          <div className="w-full space-y-5 pb-10">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className="h-6 w-32 bg-gray-200 rounded-md animate-pulse" />
                <div className="h-4 w-60 bg-gray-200 rounded-md animate-pulse" />
              </div>
              <div className="h-9 w-40 bg-gray-200 rounded-lg animate-pulse" />
            </header>

            <section className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`stat-skel-${i}`} className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 p-4">
                  <div className="h-3 w-28 bg-gray-200 rounded-md animate-pulse" />
                  <div className="mt-3 h-7 w-24 bg-gray-200 rounded-md animate-pulse" />
                  <div className="mt-2 h-3 w-32 bg-gray-200 rounded-md animate-pulse" />
                </div>
              ))}
            </section>

            <section className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-72">
                  <div className="h-9 w-full bg-gray-200 rounded-xl animate-pulse" />
                </div>
                <div className="h-9 w-56 bg-gray-200 rounded-xl animate-pulse" />
                <div className="h-9 w-40 bg-gray-200 rounded-xl animate-pulse" />
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={`chip-skel-${i}`} className="h-8 w-24 bg-gray-200 rounded-full animate-pulse" />
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
              <div className="overflow-x-auto">
                <Table className="min-w-[1040px] text-sm">
                <TableHeader className="[&_tr]:border-black/5">
                  <TableRow className="border-black/5 hover:bg-transparent">
                    <TableHead className="w-12 px-3" />
                    <TableHead className="px-4">Paquete</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead className="w-[220px] px-4 text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`row-skel-${i}`} className="border-black/5">
                      <TableCell className="px-3"><div className="mx-auto h-4 w-4 rounded border border-gray-200 bg-gray-100 animate-pulse" /></TableCell>
                      <TableCell className="px-4">
                        <div className="space-y-2">
                          <div className="h-4 w-64 bg-gray-200 rounded-md animate-pulse" />
                          <div className="flex gap-2">
                            <div className="h-5 w-14 bg-gray-200 rounded-md animate-pulse" />
                            <div className="h-5 w-20 bg-gray-200 rounded-md animate-pulse" />
                            <div className="h-4 w-24 bg-gray-200 rounded-md animate-pulse" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="h-4 w-40 bg-gray-200 rounded-md animate-pulse" />
                          <div className="h-4 w-48 bg-gray-200 rounded-md animate-pulse" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="h-4 w-24 bg-gray-200 rounded-md animate-pulse" />
                          <div className="h-3 w-28 bg-gray-200 rounded-md animate-pulse" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="h-4 w-20 bg-gray-200 rounded-md animate-pulse" />
                          <div className="h-3 w-24 bg-gray-200 rounded-md animate-pulse" />
                        </div>
                      </TableCell>
                      <TableCell className="w-[220px] px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {Array.from({ length: 5 }).map((_, actionIndex) => (
                            <div key={`action-skel-${i}-${actionIndex}`} className="h-8 w-8 rounded-lg bg-gray-200 animate-pulse" />
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              </div>
            </section>
          </div>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AdminLayout>
        <div className="w-full space-y-5 pb-10">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Ventas</h1>
            </div>
            <div className="flex items-center gap-2">
              {/* <Button asChild variant="outline" size="sm">
                <Link href="/admin/ventas/buscar">Búsqueda avanzada</Link>
              </Button> */}
              <Button asChild variant="success" size="sm">
                <Link href="/admin/ventas/nueva">Crear venta manual</Link>
              </Button>
            </div>
          </header>

          {/* <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 p-4">
              <p className="text-[11px] uppercase tracking-widest text-gray-500">Total vendido</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">{formatAmount(totalAmount, 'ARS')}</p>
              <p className="text-xs text-gray-400">Según filtros actuales</p>
            </div>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 p-4">
              <p className="text-[11px] uppercase tracking-widest text-gray-500">Personas</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">{totalPeople}</p>
              <p className="text-xs text-gray-400">Total de pasajeros en las ventas listadas</p>
            </div>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 p-4">
              <p className="text-[11px] uppercase tracking-widest text-gray-500">Estados</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(
                  ventasFiltradas.reduce<Record<string, number>>((acc, sale) => {
                    acc[sale.filterStatus] = (acc[sale.filterStatus] ?? 0) + 1;
                    return acc;
                  }, {})
                ).map(([k, v]) => (
                  <Badge key={k} variant="outline" className="capitalize px-3 py-1 text-[11px] font-mono">
                    {k}: {v}
                  </Badge>
                ))}
              </div>
            </div>
          </section> */}

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-emerald-500/20 p-4">
              <p className="admin-eyebrow text-emerald-700">Ventas de hoy</p>
              <p className="admin-metric mt-2 text-gray-900">{todaySales.length}</p>
              <p className="text-xs text-gray-500">
                Excursiones programadas para hoy ({formatShortDate(todayIso)})
              </p>
            </div>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-emerald-500/20 p-4">
              <p className="admin-eyebrow text-emerald-700">Personas de hoy</p>
              <p className="admin-metric mt-2 text-gray-900">{todayPeople}</p>
              <p className="text-xs text-gray-500">Sumando todas las ventas de hoy</p>
            </div>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-emerald-500/20 p-4">
              <p className="admin-eyebrow text-emerald-700">Monto de hoy</p>
              <p className="admin-metric mt-2 text-gray-900">
                {formatAmount(todayAmount, 'ARS')}
              </p>
              <p className="text-xs text-gray-500">Ventas de hoy (todas las monedas convertidas a ARS visual)</p>
            </div>
          </section>

          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, email, paquete o ID..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10"
                />
                {searchInput && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => {
                      setSearchInput('');
                      setSearchTerm('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <Select value={filterPackageId} onValueChange={setFilterPackageId}>
                <SelectTrigger className="w-full sm:w-56 bg-white shadow-none ring-1 ring-black/5 rounded-xl">
                  <SelectValue placeholder="Paquete" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {paquetes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <AdminDatePicker
                aria-label="Filtrar por fecha de excursión"
                value={filterDate}
                onValueChange={setFilterDate}
                className="w-full sm:w-40 bg-white shadow-none ring-1 ring-black/5 rounded-xl"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {statusOptions.map((opt) => (
                <Button
                  key={opt.value}
                  variant={statusFilters.includes(opt.value) ? 'secondary' : 'outline'}
                  size="sm"
                  className="text-xs rounded-full"
                  onClick={() => toggleStatus(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}

              <div className="h-8 w-px bg-black/5 mx-1" />

              {paymentOptions.map((opt) => (
                <Button
                  key={opt.value}
                  variant={paymentMethodFilter === opt.value ? 'secondary' : 'outline'}
                  size="sm"
                  className="text-xs rounded-full"
                  onClick={() => setPaymentMethodFilter(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-4 py-3">
              <p className="text-sm text-gray-600" aria-live="polite">
                {selectedReservationIds.size > 0
                  ? `${selectedReservationIds.size} reserva${selectedReservationIds.size === 1 ? '' : 's'} seleccionada${selectedReservationIds.size === 1 ? '' : 's'}`
                  : 'Seleccioná reservas para eliminarlas en lote'}
              </p>
              {selectedReservationIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={bulkDeleteLoading}
                    onClick={() => setSelectedReservationIds(new Set())}
                  >
                    Limpiar selección
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={bulkDeleteLoading}
                    onClick={openBulkDelete}
                  >
                    {bulkDeleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    {bulkDeleteLoading ? 'Eliminando…' : 'Eliminar seleccionadas'}
                  </Button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[1040px] text-sm">
              <TableHeader className="[&_tr]:border-black/5">
                <TableRow className="border-black/5 hover:bg-transparent">
                  <TableHead className="w-12 px-3 text-center">
                    <Checkbox
                      aria-label="Seleccionar todas las reservas de esta página"
                      checked={pageCheckboxState}
                      disabled={selectablePageIds.length === 0 || bulkDeleteLoading}
                      onCheckedChange={(checked) => togglePageSelection(checked === true)}
                    />
                  </TableHead>
                  <TableHead className="px-4">Paquete</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead className="w-[220px] px-4 text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventasPaginadas.length === 0 ? (
                  <TableRow className="border-black/5">
                    <TableCell colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      No hay ventas para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  ventasPaginadas.map((sale) => {
                    if (sale.kind === 'order') {
                      const order = sale.order;
                      const firstItem = order.items?.[0];

                      return (
                        <TableRow key={`order-${order.id}`} className="border-black/5 bg-amber-50/30 hover:bg-amber-50/50">
                          <TableCell className="px-3" aria-label="Las órdenes de pago no se pueden seleccionar para borrar" />
                          <TableCell className="px-4">
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900 truncate max-w-[320px]">
                                {firstItem?.packageTitle || 'Orden sin paquete'}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="text-[11px]">
                                  {paymentMethodLabel('mercadopago')}
                                </Badge>
                                <Badge variant="outline" className="text-[11px]">
                                  Orden
                                </Badge>
                                <span className="text-[11px] text-gray-400 font-mono">{order.id}</span>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900 truncate max-w-[220px]">
                                {order.customer?.name || '—'}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500 truncate max-w-[220px]">
                                <Mail className="h-3.5 w-3.5" />
                                {order.customer?.email || 'Email no registrado'}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1 text-gray-700">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                <span>{formatDate(firstItem?.date)}</span>
                              </div>
                              <div className="text-[11px] text-gray-400">Compra: {formatDateTime(order.createdAt)}</div>
                            </div>
                          </TableCell>

                          <TableCell className="font-medium text-gray-900">
                            {formatAmount(order.amountTotal, order.currency)}
                            <div className="mt-0.5 text-[11px] text-gray-400">
                              {sale.people} persona{sale.people !== 1 ? 's' : ''}
                            </div>
                            {firstItem?.selectedSeats?.length ? (
                              <div className="mt-1 text-[11px] text-gray-400 truncate max-w-[220px]">
                                Butacas: {firstItem.selectedSeats.join(', ')}
                              </div>
                            ) : null}
                          </TableCell>

                          <TableCell className="w-[220px] px-4 text-center">
                            <div className="mx-auto inline-flex w-full items-center justify-center">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="rounded-full"
                                title="Copiar ID de orden"
                                aria-label="Copiar ID de orden"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(order.id);
                                    toast.success('ID de orden copiado');
                                  } catch {
                                    toast.error('No pudimos copiar el ID');
                                  }
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const r = sale.reservation;
                    const isBusy = actionLoadingId === r.id;
                    const ventaStatuses = buildVentaStatuses(r);
                    const paymentLabel = paymentMethodLabel(r.pricingSnapshot?.paymentMethod ?? r.paymentMethod);
                    const paymentVariant =
                      ventaStatuses.paymentMethod === 'mercadopago'
                        ? 'default'
                        : ventaStatuses.paymentMethod === 'admin'
                          ? 'outline'
                          : 'secondary';
                    return (
                      <TableRow key={r.id} className="border-black/5 hover:bg-black/[0.02]">
                        <TableCell className="px-3 text-center">
                          <Checkbox
                            aria-label={`Seleccionar reserva ${r.customerName || r.id}`}
                            checked={selectedReservationIds.has(r.id)}
                            disabled={bulkDeleteLoading}
                            onCheckedChange={(checked) => toggleReservationSelection(r.id, checked === true)}
                          />
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate max-w-[320px]">
                              {r.experienceTitle}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <Badge variant={paymentVariant} className="text-[11px]">
                                {paymentLabel}
                              </Badge>
                              <Badge variant="outline" className="text-[11px]">
                                Reserva
                              </Badge>
                              {r.referredBy?.vendorName ? (
                                <Badge variant="outline" className="text-[11px]">
                                  {r.referredBy.vendorName}
                                </Badge>
                              ) : null}
                              <span className="text-[11px] text-gray-400 font-mono">
                                {(r as any).reservationCode ? String((r as any).reservationCode) : r.id}
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate max-w-[220px]">
                              {r.customerName || '—'}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500 truncate max-w-[220px]">
                              <Mail className="h-3.5 w-3.5" />
                              {r.customerEmail || 'Email no registrado'}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-gray-700">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              <span>{formatDate(r.date)}</span>
                            </div>
                            <div className="text-[11px] text-gray-400">Compra: {formatDateTime(r.createdAt)}</div>
                          </div>
                        </TableCell>

                        <TableCell className="font-medium text-gray-900">
                          {formatAmount(r.amountTotal, r.currency)}
                          <div className="mt-0.5 text-[11px] text-gray-400">
                            {r.people} persona{r.people !== 1 ? 's' : ''}
                          </div>
                          {(() => {
                            const unitAmount = getUnitAmountFromReservation(r);
                            if (!unitAmount) return null;
                            return (
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400">
                                {unitAmount ? (
                                  <span>Unit: {formatAmount(unitAmount, r.currency)}</span>
                                ) : null}
                              </div>
                            );
                          })()}
                        </TableCell>

                        <TableCell className="w-[220px] px-4">
                          <div role="group" aria-label={`Acciones para ${r.customerName || 'reserva'}`} className="flex flex-nowrap items-center justify-center gap-1.5">
                            <Button asChild variant="outline" size="icon-sm" className="rounded-lg" title="Ver reserva" aria-label="Ver reserva">
                              <Link href={`/admin/ventas/${r.id}`}>
                                <Eye className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button asChild variant="outline" size="icon-sm" className="rounded-lg" title="Duplicar reserva" aria-label="Duplicar reserva">
                              <Link href={`/admin/ventas/nueva?duplicateFrom=${encodeURIComponent(r.id)}`}>
                                <CopyPlus className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button variant="outline" size="icon-sm" className="rounded-lg" title="Descargar voucher PDF" aria-label="Descargar voucher PDF" disabled={isBusy} onClick={() => void downloadVoucher(r)}>
                              {isBusy && actionLoadingType === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                            </Button>
                            {r.status !== 'cancelled' && (
                              <Button variant="outline" size="icon-sm" className="rounded-lg border-amber-200 text-amber-800 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900" title="Anular reserva" aria-label="Anular reserva" disabled={isBusy} onClick={() => openCancel(r)}>
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="outline" size="icon-sm" className="rounded-lg border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800" title="Borrar reserva" aria-label="Borrar reserva" disabled={isBusy} onClick={() => openDelete(r)}>
                              {isBusy && actionLoadingType === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              </Table>
            </div>
          </section>

          {ventasFiltradas.length > 0 && (
            <AdminPagination
              currentPage={currentPage}
              totalItems={ventasFiltradas.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="ventas"
            />
          )}
        </div>
      </AdminLayout>

      {/* Alert: Cancelar */}
      <AlertDialog open={dialog.type === 'cancel'} onOpenChange={(open) => !open && setDialog({ type: 'none' })}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar la venta?</AlertDialogTitle>
            <AlertDialogDescription>
              La reserva pasará a anulada y se liberarán las butacas asociadas. El registro y su historial permanecerán disponibles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dialog.type === 'cancel' && actionLoadingId === dialog.reserva.id}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={dialog.type === 'cancel' && actionLoadingId === dialog.reserva.id}
              onClick={(event) => {
                event.preventDefault();
                void runCancel();
              }}
              className="bg-amber-700 hover:bg-amber-800"
            >
              {dialog.type === 'cancel' && actionLoadingId === dialog.reserva.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Anular venta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </ProtectedRoute>
  );
}
