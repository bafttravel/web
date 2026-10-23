'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { getReservaById, getReservaPayments, type ReservaPaymentEvent } from '@/lib/reservas';
import type {
  Reservation,
  ReservationAttachment,
  ReservationStatus,
} from '@/components/landing-reserva/types';
import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  Loader2,
  Mail,
  MailCheck,
  MapPin,
  Paperclip,
  Plus,
  ReceiptText,
  Store,
  Ticket,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchAdminVendorLinks, type AdminVendorLink } from '@/lib/admin-vendors-client';
import VendorCombobox from '@/components/admin/VendorCombobox';
import { getAllPaquetesAdmin } from '@/lib/paquetes';
import { getPackageAddonOptions } from '@/lib/packages/resolve-departure';
import { getCountryByName } from '@/lib/countries';
import { buildVentaStatuses, ventaStatusLabel } from '@/lib/sales/status';
import { computeVentaFinance, financeStatusLabel, type VentaFinance } from '@/lib/sales/finance';

/* ---------------------------------- types --------------------------------- */

const reservationStatusOptions: { value: ReservationStatus; label: string }[] = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'reserved', label: 'Reservada' },
  { value: 'completed', label: 'Completada' },
  { value: 'cancelled', label: 'Cancelada' },
];

type PaymentMovementType = 'payment' | 'extra' | 'discount' | 'refund' | 'adjustment';
type PaymentFormState = { movementType: PaymentMovementType; amount: string; method: string; reference: string; message: string };

/* --------------------------------- helpers -------------------------------- */

const formatDate = (date: unknown): string => {
  if (!date) return '—';
  try {
    const d =
      typeof date === 'string'
        ? new Date(`${date}T12:00:00`)
        : typeof date === 'object' && date !== null && 'toDate' in date
          ? (date as { toDate: () => Date }).toDate()
          : new Date(date as Date);
    if (Number.isNaN(d.getTime())) return typeof date === 'string' ? date : '—';
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
};

const formatDateTime = (date: unknown): string => {
  if (!date) return '—';
  try {
    const d =
      typeof date === 'string'
        ? new Date(date)
        : typeof date === 'object' && date !== null && 'toDate' in date
          ? (date as { toDate: () => Date }).toDate()
          : new Date(date as Date);
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

const toMs = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  if (value && typeof value === 'object' && 'toDate' in value) return (value as { toDate: () => Date }).toDate().getTime();
  if (value && typeof value === 'object' && 'seconds' in value) return ((value as { seconds: number }).seconds ?? 0) * 1000;
  return 0;
};

const formatAmount = (cents: number, currency: string): string => {
  const value = (Number(cents) || 0) / 100;
  const cur = String(currency || 'ARS').toUpperCase();
  if (cur === 'ARS') return `$${value.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
  if (cur === 'BRL') return `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  if (cur === 'USD') return `USD ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `${value.toFixed(2)} ${cur}`;
};

const commercialBadge: Record<ReservationStatus, 'default' | 'outline' | 'destructive' | 'secondary'> = {
  pending: 'outline',
  reserved: 'secondary',
  completed: 'default',
  cancelled: 'destructive',
};

const financeBadge = (f: VentaFinance): 'default' | 'outline' | 'destructive' | 'secondary' =>
  f.status === 'settled' ? 'default' : f.status === 'overpaid' ? 'secondary' : f.status === 'partial' ? 'outline' : 'outline';

const emailLabel = (s: string) =>
  s === 'sent' ? 'Enviado' : s === 'queued' ? 'En cola' : s === 'sending' ? 'Enviando' : s === 'failed' ? 'Fallido' : 'Sin enviar';

const voucherLabel = (s: string) =>
  s === 'sent' ? 'Enviado' : s === 'generated' ? 'Generado' : s === 'queued' ? 'En cola' : s === 'failed' ? 'Fallido' : 'Sin voucher';

const movementLabels: Record<PaymentMovementType, string> = {
  payment: 'Pago',
  extra: 'Extra',
  discount: 'Descuento',
  refund: 'Reintegro',
  adjustment: 'Ajuste',
};

const methodLabels: Record<string, string> = {
  mercadopago: 'Mercado Pago',
  admin: 'Manual',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro',
};

const methodLabel = (v: string | null | undefined): string => {
  const k = String(v ?? '').trim().toLowerCase();
  return methodLabels[k] ?? (k ? k.charAt(0).toUpperCase() + k.slice(1) : '—');
};

const movementOf = (p: ReservaPaymentEvent): PaymentMovementType => {
  const v = String(p.movementType ?? '').trim().toLowerCase();
  return v === 'extra' || v === 'discount' || v === 'refund' || v === 'adjustment' ? v : 'payment';
};

const moneyToCents = (value: string): number => {
  const amount = Number(value.replace(/\./g, '').replace(',', '.').trim());
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
};

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{children}</p>
);

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 ${className}`}>{children}</section>
);

/* ---------------------------------- page ---------------------------------- */

export default function ReservaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [reserva, setReserva] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ReservationStatus>('completed');
  const [statusNote, setStatusNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [attachments, setAttachments] = useState<ReservationAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [payments, setPayments] = useState<ReservaPaymentEvent[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [otherPurchases, setOtherPurchases] = useState<Reservation[]>([]);
    const [vendorId, setVendorId] = useState('');
  const [links, setLinks] = useState<AdminVendorLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [pickedCode, setPickedCode] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [savingReferral, setSavingReferral] = useState(false);
  const [savingMovement, setSavingMovement] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [form, setForm] = useState<PaymentFormState>({ movementType: 'payment', amount: '', method: 'transfer', reference: '', message: '' });
  const [showAddonForm, setShowAddonForm] = useState(false);
  const [addonCatalog, setAddonCatalog] = useState<
    Array<{ key: string; packageTitle: string; addon: { id: string; title: string; price: number } }>
  >([]);
  const [loadingAddons, setLoadingAddons] = useState(false);
  const [addonQuery, setAddonQuery] = useState('');
  const [addonPickedKey, setAddonPickedKey] = useState('');
  const [addonTitle, setAddonTitle] = useState('');
  const [addonPrice, setAddonPrice] = useState('');
  const [savingAddon, setSavingAddon] = useState(false);

  const load = useCallback(async (withSkeleton = false) => {
    if (withSkeleton) setLoading(true);
    try {
      const data = await getReservaById(params.id);
      if (!data) {
        toast.error('Venta no encontrada');
        router.replace('/admin/ventas');
        return;
      }
      setReserva(data);
      setStatus(data.status);
      setAttachments(data.attachments ?? []);
      setPaymentsLoading(true);
      setPayments(await getReservaPayments(params.id, { limit: 50 }));
    } catch (e) {
      console.error(e);
      toast.error('No pudimos cargar la venta');
    } finally {
      if (withSkeleton) setLoading(false);
      setPaymentsLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => { load(true); }, [load]);

  // Catálogo de adicionales de esta + todas las excursiones (edición de la
  // venta: permite sumar un adicional creado para otro paquete).
  useEffect(() => {
    let off = false;
    setLoadingAddons(true);
    getAllPaquetesAdmin()
      .then((all) => {
        if (off) return;
        const entries: Array<{ key: string; packageTitle: string; addon: { id: string; title: string; price: number } }> = [];
        const currentId = String(reserva?.packageId ?? reserva?.experienceId ?? '');
        for (const pkg of all) {
          if (!pkg) continue;
          const isCurrent = currentId && pkg.id === currentId;
          const options = getPackageAddonOptions(pkg as any);
          for (const option of options) {
            entries.push({
              key: `${isCurrent ? 'pkg' : 'catalog'}:${pkg.id}:${option.id}`,
              packageTitle: isCurrent ? 'Esta excursión' : String(pkg.titulo ?? 'Sin título'),
              addon: { id: option.id, title: option.title, price: option.price },
            });
          }
        }
        entries.sort((a, b) => a.addon.title.localeCompare(b.addon.title, 'es'));
        setAddonCatalog(entries);
      })
      .catch(() => { if (!off) setAddonCatalog([]); })
      .finally(() => { if (!off) setLoadingAddons(false); });
    return () => { off = true; };
  }, [reserva?.experienceId, reserva?.packageId]);

  useEffect(() => {
    if (!reserva?.referredBy) { setVendorId(''); setPickedCode(''); setManualCode(''); setLinks([]); return; }
    setVendorId(reserva.referredBy.vendorId ?? '');
    setPickedCode(reserva.referredBy.code ?? '');
    setManualCode('');
  }, [reserva?.referredBy]);

  useEffect(() => {
    let off = false;
    if (!vendorId) { setLinks([]); setLinksLoading(false); return; }
    setLinksLoading(true);
    fetchAdminVendorLinks(vendorId).then((l) => { if (!off) setLinks(l); }).catch((e) => { if (!off) { setLinks([]); toast.error(e?.message || 'No pudimos cargar los códigos del vendedor'); } }).finally(() => { if (!off) setLinksLoading(false); });
    return () => { off = true; };
  }, [vendorId]);

  useEffect(() => {
    let off = false;
    (async () => {
      if (!reserva?.customerEmail || !user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/reservas/history?email=${encodeURIComponent(reserva.customerEmail)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const payload = await res.json();
        if (!off) setOtherPurchases((payload.reservations ?? []).filter((r: Reservation) => r.id !== reserva.id).slice(0, 4));
      } catch { /* noop */ }
    })();
    return () => { off = true; };
  }, [reserva?.customerEmail, reserva?.id, user]);

  const venta = useMemo(() => (reserva ? buildVentaStatuses(reserva) : null), [reserva]);
  const finance = useMemo(
    () => (reserva ? computeVentaFinance(reserva as Reservation & Record<string, unknown>, payments) : null),
    [reserva, payments],
  );

  const paymentRows = useMemo(
    () => payments.slice().sort((a, b) => toMs(b.occurredAt ?? b.createdAt) - toMs(a.occurredAt ?? a.createdAt)),
    [payments],
  );

  const linksForPackage = useMemo(() => {
    const pid = String(reserva?.packageId ?? reserva?.experienceId ?? '').trim();
    if (!pid) return links;
    return links.filter((l) => {
      const lp = String(l.packageId ?? l.experienceId ?? '').trim();
      return !lp || lp === pid;
    });
  }, [links, reserva?.experienceId, reserva?.packageId]);

  const filteredAddons = useMemo(() => {
    const query = addonQuery.trim().toLowerCase();
    const existingLabels = new Set(
      ((reserva?.selectedExtras ?? []) as Array<{ label?: string }>).map((x) => String(x?.label ?? '').trim().toLowerCase())
    );
    return addonCatalog.filter((entry) => {
      if (existingLabels.has(entry.addon.title.trim().toLowerCase())) return false;
      if (!query) return true;
      return (
        entry.addon.title.toLowerCase().includes(query) ||
        entry.packageTitle.toLowerCase().includes(query)
      );
    });
  }, [addonCatalog, addonQuery, reserva?.selectedExtras]);

  useEffect(() => {
    if (!addonPickedKey) return;
    const picked = addonCatalog.find((entry) => entry.key === addonPickedKey);
    if (picked) {
      setAddonTitle(picked.addon.title);
      setAddonPrice(String(picked.addon.price));
    }
  }, [addonCatalog, addonPickedKey]);

  const handleAddAddon = async () => {
    const token = await authed(); if (!token || !reserva) return;
    const title = addonTitle.trim().slice(0, 120);
    const price = Number(String(addonPrice).replace(/\./g, '').replace(',', '.').trim());
    if (!title) { toast.error('Elegí un adicional o escribí el título'); return; }
    if (!Number.isFinite(price) || price <= 0) { toast.error('Ingresá un precio válido'); return; }
    setSavingAddon(true);
    try {
      const res = await fetch('/api/admin/reservas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          reservationId: reserva.id,
          addAddonExtra: { title, price, scope: 'per_booking' },
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err?.error ?? ''); }
      toast.success(`Adicional sumado: ${title}`);
      setAddonTitle('');
      setAddonPrice('');
      setAddonPickedKey('');
      setShowAddonForm(false);
      await load(false);
    } catch { toast.error('No pudimos sumar el adicional'); } finally { setSavingAddon(false); }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout>
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="h-8 w-2/3 animate-pulse rounded-lg bg-slate-200" />
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="h-56 animate-pulse rounded-2xl bg-white ring-1 ring-black/5 lg:col-span-2" />
              <div className="h-56 animate-pulse rounded-2xl bg-white ring-1 ring-black/5" />
            </div>
            <div className="h-48 animate-pulse rounded-2xl bg-white ring-1 ring-black/5" />
          </div>
        </AdminLayout>
      </ProtectedRoute>
    );
  }
  if (!reserva || !finance) return null;

  const r = reserva as Reservation & Record<string, unknown>;
  const title = reserva.packageTitle || reserva.experienceTitle || 'Venta';
  const code = String(r.reservationCode ?? '').trim();
  const seats: string[] = Array.isArray(r.selectedSeats) ? r.selectedSeats.map(String) : [];
  const extras = (Array.isArray(r.selectedExtras) ? r.selectedExtras : []).filter((x: { label?: string }) => String(x?.label ?? '').trim());
  const travelers: Array<Record<string, unknown>> = Array.isArray(r.passengerDetails) ? (r.passengerDetails as unknown as Array<Record<string, unknown>>) : [];
  const pickup = String(r.pickupPoint ?? '').trim();
  const pickupTime = String(r.pickupPointTime ?? '').trim();
  const roomType = String(r.roomType ?? '').trim();
  const mpId = String(reserva.mercadoPagoPaymentId ?? '').trim();
  const progress = finance.billedTotal > 0 ? Math.min(100, Math.round((finance.totalPaid / finance.billedTotal) * 100)) : 0;
  const country = reserva.customerCountry ? getCountryByName(reserva.customerCountry) : null;

  const authed = async () => {
    if (!user) { toast.error('Sesión expirada'); return null; }
    return user.getIdToken();
  };

  const handleStatus = async (next: ReservationStatus, note?: string) => {
    const token = await authed(); if (!token) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/reservas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reservationId: reserva.id, status: next, note: note ?? statusNote }),
      });
      if (!res.ok) throw new Error();
      toast.success('Estado actualizado');
      await load(false);
    } catch { toast.error('No pudimos actualizar el estado'); } finally { setBusy(false); }
  };

  const handleReferral = async (clear = false) => {
    const token = await authed(); if (!token) return;
    setSavingReferral(true);
    try {
      const body: Record<string, unknown> = { reservationId: reserva.id };
      if (clear) body.clearReferredBy = true;
      else {
        if (vendorId) body.vendorId = vendorId;
        if (manualCode.trim()) body.referralCode = manualCode.trim();
        else if (pickedCode.trim()) body.referralCode = pickedCode.trim();
      }
      const res = await fetch('/api/admin/reservas', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e?.error ?? ''); }
      toast.success(clear ? 'Vendedor desvinculado' : 'Vendedor actualizado');
      await load(false);
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : 'No pudimos actualizar el vendedor'); } finally { setSavingReferral(false); }
  };

  const handleMovement = async () => {
    const token = await authed(); if (!token) return;
    const amount = moneyToCents(form.amount);
    if (!amount) { toast.error('Ingresá un monto válido'); return; }
    if (!form.message.trim()) { toast.error('Agregá un detalle'); return; }
    setSavingMovement(true);
    try {
      const res = await fetch('/api/admin/reservas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          reservationId: reserva.id,
          addPaymentEvent: { movementType: form.movementType, amount, currency: reserva.currency, method: form.method, reference: form.reference.trim() || undefined, message: form.message.trim() },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Movimiento registrado');
      setForm({ movementType: 'payment', amount: '', method: 'transfer', reference: '', message: '' });
      setShowMovementForm(false);
      await load(false);
    } catch { toast.error('No pudimos registrar el movimiento'); } finally { setSavingMovement(false); }
  };

  const enqueue = async (type: 'customer' | 'admin') => {
    const token = await authed(); if (!token) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/reservas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reservationId: reserva.id, sendEmailNow: true, ...(type === 'customer' ? { enqueueCustomerVoucherEmail: true } : { enqueueAdminNotificationEmail: true }) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No pudimos enviar el email');
      }
      toast.success(type === 'customer' ? 'Voucher enviado al cliente' : 'Aviso interno enviado');
      await load(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No pudimos enviar el email'); await load(false); } finally { setBusy(false); }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const token = await authed(); if (!token) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        if (!up.ok) throw new Error();
        const data = await up.json();
        uploaded.push({ url: data.url, name: file.name, type: file.type, uploadedBy: 'admin' });
      }
      const res = await fetch('/api/admin/reservas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reservationId: reserva.id, attachments: uploaded }),
      });
      if (!res.ok) throw new Error();
      toast.success('Comprobante agregado');
      await load(false);
    } catch { toast.error('No pudimos subir el comprobante'); } finally { setUploading(false); }
  };

  const deleteAttachment = async (id: string) => {
    const token = await authed(); if (!token) return;
    setRemovingIds((p) => [...p, id]);
    try {
      const res = await fetch('/api/admin/reservas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reservationId: reserva.id, removeAttachments: [{ id }] }),
      });
      if (!res.ok) throw new Error();
      toast.success('Comprobante eliminado');
      await load(false);
    } catch { toast.error('No pudimos eliminar el comprobante'); } finally { setRemovingIds((p) => p.filter((x) => x !== id)); }
  };

  return (
    <ProtectedRoute>
      <AdminLayout>
        <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-10">
          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <Button variant="ghost" size="sm" asChild className="-ml-2 text-slate-500">
                <Link href="/admin/ventas"><ArrowLeft className="h-4 w-4" />Ventas</Link>
              </Button>
              <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {code ? <span className="font-mono font-medium text-slate-700">{code}</span> : 'Código pendiente'}
                <span className="mx-2 text-slate-300">·</span>
                {reserva.date === 'sin-fecha' ? 'Fecha a coordinar' : formatDate(reserva.date)}
                <span className="mx-2 text-slate-300">·</span>
                {reserva.people} {reserva.people === 1 ? 'persona' : 'personas'}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={commercialBadge[reserva.status]}>{venta?.commercialStatusLabel ?? ventaStatusLabel(reserva.status)}</Badge>
                <Badge variant={financeBadge(finance)}>{financeStatusLabel(finance)}</Badge>
              </div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{formatAmount(finance.billedTotal, finance.currency)}</p>
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              {/* Pago — única fuente de verdad */}
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-900">Pago</h2>
                    {finance.paidViaReservaFallback && (
                      <span className="text-[11px] text-slate-400">· acreditado según reserva (sin movimientos legibles)</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">{methodLabel(venta?.paymentMethodLabel ?? reserva.paymentMethod)} · {venta?.paymentStatusLabel ?? ''}</span>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${finance.status === 'settled' ? 'bg-emerald-500' : finance.status === 'partial' ? 'bg-amber-400' : 'bg-slate-300'}`} style={{ width: `${progress}%` }} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { k: 'Total', v: formatAmount(finance.billedTotal, finance.currency) },
                    { k: 'Cobrado', v: formatAmount(finance.totalPaid, finance.currency), accent: 'text-emerald-700' },
                    { k: finance.balance > 0 ? 'Resta cobrar' : finance.balance < 0 ? 'A favor' : 'Saldo', v: finance.balance === 0 ? '—' : formatAmount(Math.abs(finance.balance), finance.currency), accent: finance.balance > 0 ? 'text-amber-700' : undefined },
                    { k: 'Ajustes', v: finance.adjustments === 0 ? '—' : `${finance.adjustments > 0 ? '+' : '−'}${formatAmount(Math.abs(finance.adjustments), finance.currency)}` },
                  ].map((m) => (
                    <div key={m.k} className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-black/[0.04]">
                      <Eyebrow>{m.k}</Eyebrow>
                      <p className={`mt-1 text-sm font-semibold tabular-nums text-slate-900 ${m.accent ?? ''}`}>{m.v}</p>
                    </div>
                  ))}
                </div>

                {finance.pendingAmount > 0 && (
                  <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200/60">
                    Hay {formatAmount(finance.pendingAmount, finance.currency)} en proceso (p. ej. Mercado Pago pendiente). No suma como cobrado hasta acreditarse.
                  </p>
                )}
                {mpId && (
                  <p className="mt-2 font-mono text-[11px] text-slate-400">
                    MP {mpId}{finance.gatewayStatus ? ` · ${finance.gatewayStatus}` : ''}{reserva.mercadoPagoStatusDetail ? ` · ${String(reserva.mercadoPagoStatusDetail)}` : ''}
                  </p>
                )}

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between">
                    <Eyebrow>Movimientos · {paymentRows.length}</Eyebrow>
                    <Button variant="outline" size="sm" onClick={() => setShowMovementForm((v) => !v)}>
                      <Plus className="h-4 w-4" />{showMovementForm ? 'Cerrar' : 'Agregar'}
                    </Button>
                  </div>
                  {paymentsLoading ? (
                    <div className="mt-3 space-y-2">
                      <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
                      <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
                    </div>
                  ) : paymentRows.length === 0 ? (
                    <p className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
                      {finance.paidViaReservaFallback
                        ? 'El pago está acreditado en la reserva.'
                        : 'Sin movimientos. Si el pago fue por Mercado Pago y no figura, revisá el webhook.'}
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-slate-100 rounded-xl ring-1 ring-black/[0.04]">
                      {paymentRows.map((p) => {
                        const t = movementOf(p);
                        const neg = t === 'discount' || t === 'refund';
                        return (
                          <li key={p.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {movementLabels[t]} <span className="font-normal text-slate-400">· {methodLabel(p.method)}</span>
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {formatDateTime(p.occurredAt ?? p.createdAt)}{p.message ? ` · ${p.message}` : ''}{p.reference ? ` · ${p.reference}` : ''}
                              </p>
                            </div>
                            <p className={`shrink-0 text-sm font-semibold tabular-nums ${neg ? 'text-rose-600' : t === 'payment' ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {neg ? '−' : '+'}{formatAmount(Number(p.amount ?? 0), String(p.currency ?? finance.currency))}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {showMovementForm && (
                    <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-black/[0.04] sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Tipo</Label>
                        <Select value={form.movementType} onValueChange={(v) => setForm((c) => ({ ...c, movementType: v as PaymentMovementType }))} disabled={savingMovement}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(movementLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Medio</Label>
                        <Select value={form.method} onValueChange={(v) => setForm((c) => ({ ...c, method: v }))} disabled={savingMovement}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="transfer">Transferencia</SelectItem>
                            <SelectItem value="cash">Efectivo</SelectItem>
                            <SelectItem value="card">Tarjeta</SelectItem>
                            <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                            <SelectItem value="admin">Manual</SelectItem>
                            <SelectItem value="other">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Monto</Label>
                        <Input value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} placeholder="0,00" inputMode="decimal" disabled={savingMovement} />
                      </div>
                      <div className="space-y-1">
                        <Label>Referencia</Label>
                        <Input value={form.reference} onChange={(e) => setForm((c) => ({ ...c, reference: e.target.value }))} placeholder="Opcional" disabled={savingMovement} />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Detalle</Label>
                        <Textarea value={form.message} onChange={(e) => setForm((c) => ({ ...c, message: e.target.value }))} placeholder="Ej. seña por transferencia" rows={2} disabled={savingMovement} />
                      </div>
                      <div className="sm:col-span-2">
                        <Button size="sm" variant="success" onClick={handleMovement} disabled={savingMovement}>
                          {savingMovement ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando</> : 'Guardar movimiento'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Viaje */}
              <Card>
                <div className="flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-900">Viaje</h2>
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-400">Salida</dt><dd className="font-medium text-slate-900">{reserva.date === 'sin-fecha' ? 'A coordinar' : formatDate(reserva.date)}</dd></div>
                  <div><dt className="text-xs text-slate-400">Pasajeros</dt><dd className="font-medium text-slate-900">{reserva.people}</dd></div>
                  {(pickup || pickupTime) && (
                    <div className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div><dt className="text-xs text-slate-400">Ascenso</dt><dd className="font-medium text-slate-900">{pickup || '—'}{pickupTime ? ` · ${pickupTime}` : ''}</dd></div></div>
                  )}
                  {roomType && <div><dt className="text-xs text-slate-400">Habitación</dt><dd className="font-medium capitalize text-slate-900">{roomType}</dd></div>}
                  {seats.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-400">Butacas · {seats.join(', ')}</dt>
                      {reserva.date !== 'sin-fecha' && (
                        <dd className="mt-1">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/butacas?packageId=${encodeURIComponent(String(reserva.packageId ?? reserva.experienceId))}&date=${encodeURIComponent(String(reserva.date))}`}>Ver en mapa</Link>
                          </Button>
                        </dd>
                      )}
                    </div>
                  )}
                </dl>
                {(extras.length > 0 || typeof r.baseSubtotalAmount === 'number') && (
                  <div className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-black/[0.04]">
                    {typeof r.baseSubtotalAmount === 'number' && Number(r.baseSubtotalAmount) > 0 && (
                      <p className="flex justify-between text-sm"><span className="text-slate-500">Base · {reserva.people} {reserva.people === 1 ? 'persona' : 'personas'}</span><span className="font-medium tabular-nums text-slate-900">{formatAmount(Number(r.baseSubtotalAmount), finance.currency)}</span></p>
                    )}
                    {extras.map((x, i: number) => {
                      const rec = x as unknown as Record<string, unknown>;
                      const amt = Math.max(0, Number(rec.amount ?? 0) || 0);
                      const eff = String(rec.scope ?? 'per_person') === 'per_booking' ? amt : amt * Math.max(1, reserva.people || 1);
                      return (
                        <p key={`${String(rec.label)}-${i}`} className="flex justify-between gap-3 text-sm">
                          <span className="truncate text-slate-500">+ {String(rec.label ?? '')}</span>
                          <span className="shrink-0 font-medium tabular-nums text-slate-900">{formatAmount(eff, finance.currency)}</span>
                        </p>
                      );
                    })}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2">
                      <p className="text-sm font-semibold text-slate-900">Total <span className="font-normal text-slate-400">· {formatAmount(finance.billedTotal, finance.currency)}</span></p>
                      <Button size="sm" variant="outline" onClick={() => setShowAddonForm((v) => !v)}>
                        <Plus className="h-3.5 w-3.5" />{showAddonForm ? 'Cerrar' : 'Sumar adicional'}
                      </Button>
                    </div>
                    {showAddonForm && (
                      <div className="mt-2 rounded-xl bg-white p-3 ring-1 ring-black/[0.06]">
                        <p className="text-xs text-slate-500">
                          Sumá un adicional ya creado (de esta u otra excursión). Se agrega al total y queda registrado como movimiento.
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1 sm:col-span-2">
                            <Label>Buscar adicional</Label>
                            <Input
                              value={addonQuery}
                              onChange={(e) => { setAddonQuery(e.target.value); setAddonPickedKey(''); }}
                              placeholder="Ej. almuerzo, traslado, fotos…"
                              disabled={savingAddon || loadingAddons}
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label>Adicional</Label>
                            <Select value={addonPickedKey || 'none'} onValueChange={setAddonPickedKey} disabled={savingAddon || loadingAddons || filteredAddons.length === 0}>
                              <SelectTrigger>
                                <SelectValue placeholder={loadingAddons ? 'Cargando…' : filteredAddons.length ? 'Elegí un adicional' : 'Sin resultados'} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Elegí un adicional</SelectItem>
                                {filteredAddons.slice(0, 40).map((entry) => (
                                  <SelectItem key={entry.key} value={entry.key}>
                                    {entry.addon.title} · ${entry.addon.price.toLocaleString('es-AR')} · {entry.packageTitle}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label>Título</Label>
                            <Input value={addonTitle} onChange={(e) => setAddonTitle(e.target.value)} placeholder="Se completa solo" disabled={savingAddon} />
                          </div>
                          <div className="space-y-1">
                            <Label>Precio (por reserva)</Label>
                            <Input value={addonPrice} onChange={(e) => setAddonPrice(e.target.value)} placeholder="0" inputMode="decimal" disabled={savingAddon} />
                          </div>
                        </div>
                        <Button size="sm" variant="success" className="mt-3" onClick={handleAddAddon} disabled={savingAddon}>
                          {savingAddon ? <><Loader2 className="h-4 w-4 animate-spin" />Sumando</> : 'Sumar a la venta'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {extras.length === 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-black/[0.04]">
                    <p className="text-sm text-slate-500">Sin adicionales en esta venta.</p>
                    <Button size="sm" variant="outline" onClick={() => setShowAddonForm((v) => !v)}>
                      <Plus className="h-3.5 w-3.5" />{showAddonForm ? 'Cerrar' : 'Sumar adicional'}
                    </Button>
                  </div>
                )}
                {extras.length === 0 && showAddonForm && (
                  <div className="mt-2 rounded-xl bg-slate-50 p-3 ring-1 ring-black/[0.04]">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Buscar adicional</Label>
                        <Input value={addonQuery} onChange={(e) => { setAddonQuery(e.target.value); setAddonPickedKey(''); }} placeholder="Ej. almuerzo, traslado, fotos…" disabled={savingAddon || loadingAddons} />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Adicional</Label>
                        <Select value={addonPickedKey || 'none'} onValueChange={setAddonPickedKey} disabled={savingAddon || loadingAddons || filteredAddons.length === 0}>
                          <SelectTrigger><SelectValue placeholder={loadingAddons ? 'Cargando…' : 'Elegí un adicional'} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Elegí un adicional</SelectItem>
                            {filteredAddons.slice(0, 40).map((entry) => (
                              <SelectItem key={entry.key} value={entry.key}>
                                {entry.addon.title} · ${entry.addon.price.toLocaleString('es-AR')} · {entry.packageTitle}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Título</Label>
                        <Input value={addonTitle} onChange={(e) => setAddonTitle(e.target.value)} placeholder="Se completa solo" disabled={savingAddon} />
                      </div>
                      <div className="space-y-1">
                        <Label>Precio (por reserva)</Label>
                        <Input value={addonPrice} onChange={(e) => setAddonPrice(e.target.value)} placeholder="0" inputMode="decimal" disabled={savingAddon} />
                      </div>
                    </div>
                    <Button size="sm" variant="success" className="mt-3" onClick={handleAddAddon} disabled={savingAddon}>
                      {savingAddon ? <><Loader2 className="h-4 w-4 animate-spin" />Sumando</> : 'Sumar a la venta'}
                    </Button>
                  </div>
                )}
              </Card>

              {/* Cliente y pasajeros — una sola vez */}
              <Card>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-900">Cliente y pasajeros</h2>
                </div>
                <div className="mt-3 space-y-1.5 text-sm">
                  <p className="font-semibold text-slate-900">{reserva.customerName || 'Sin nombre'}</p>
                  <p className="flex items-center gap-1.5 text-slate-600"><Mail className="h-3.5 w-3.5 text-slate-400" />{reserva.customerEmail || '—'}</p>
                  {reserva.customerPhone && <p className="text-slate-600">{reserva.customerPhone}</p>}
                  <p className="text-slate-600">
                    {[country ? `${country.flag} ${country.name}` : reserva.customerCountry, reserva.customerDocument ? `DNI ${reserva.customerDocument}` : null, r.customerBirthDate ? `Nac. ${String(r.customerBirthDate)}` : null].filter(Boolean).join(' · ') || ''}
                  </p>
                  {reserva.customerComments && <p className="rounded-xl bg-slate-50 px-3 py-2 text-slate-600 ring-1 ring-black/[0.04]">{reserva.customerComments}</p>}
                </div>
                {travelers.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {travelers.map((t, i) => (
                      <li key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-black/[0.04]">
                        <p className="font-medium text-slate-900">{`${String(t.firstName ?? '').trim()} ${String(t.lastName ?? '').trim()}`.trim() || `Pasajero ${i + 2}`}</p>
                        <p className="text-xs text-slate-500">{[t.birthDate ? `Nac. ${String(t.birthDate)}` : null, t.document ? `DNI ${String(t.document)}` : null, t.phone ? String(t.phone) : null].filter(Boolean).join(' · ')}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {otherPurchases.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <Eyebrow>Otras compras del cliente</Eyebrow>
                    <ul className="mt-2 space-y-1">
                      {otherPurchases.map((o) => (
                        <li key={o.id}>
                          <Link href={`/admin/ventas/${o.id}`} className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
                            {o.packageTitle || o.experienceTitle || 'Venta'} · {formatDate(o.date)} · {formatAmount(o.amountTotal, o.currency)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              {/* Comprobantes — lista única */}
              <Card>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-900">Comprobantes · {attachments.length}</h2>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400">
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                    Agregar
                    <input type="file" accept="image/*,.pdf" multiple className="hidden" onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }} />
                  </label>
                </div>
                {attachments.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">Sin archivos.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100 rounded-xl ring-1 ring-black/[0.04]">
                    {attachments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <Link href={a.url} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-slate-900 hover:underline">{a.name || 'Archivo'}</Link>
                        <Button variant="ghost" size="icon-sm" className="shrink-0 text-slate-400 hover:text-rose-600" disabled={removingIds.includes(a.id)} onClick={() => deleteAttachment(a.id)}>
                          {removingIds.includes(a.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* Columna lateral */}
            <div className="flex flex-col gap-4">
              <Card>
                <Eyebrow>Estado</Eyebrow>
                <div className="mt-2 space-y-2.5">
                  <Select value={status} onValueChange={(v) => setStatus(v as ReservationStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{reservationStatusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Textarea value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Nota interna (opcional)" rows={2} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="success" className="flex-1" disabled={busy} onClick={() => handleStatus(status)}>Guardar</Button>
                    {reserva.status !== 'cancelled' && (
                      <Button size="sm" variant="outline" className="text-rose-600 hover:text-rose-700" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancelar</Button>
                    )}
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <Eyebrow>Historial</Eyebrow>
                  <ol className="mt-2 space-y-2.5 border-l border-slate-200 pl-3">
                    {(reserva.statusHistory ?? []).slice().sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)).slice(0, 6).map((h, i) => (
                      <li key={i} className="relative text-xs">
                        <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-slate-300 ring-2 ring-white" />
                        <p className="font-medium capitalize text-slate-700">{ventaStatusLabel(h.status)}</p>
                        <p className="text-slate-400">{formatDateTime(h.createdAt)}</p>
                        {h.note && <p className="mt-0.5 text-slate-600">{h.note}</p>}
                      </li>
                    ))}
                    {!(reserva.statusHistory ?? []).length && <p className="text-xs text-slate-400">Sin historial.</p>}
                  </ol>
                </div>
              </Card>

              <Card>
                <div className="flex items-center gap-2">
                  <MailCheck className="h-4 w-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-900">Comunicación</h2>
                </div>
                <ul className="mt-3 space-y-2.5 text-sm">
                  <li className="flex items-center justify-between gap-2">
                    <div><p className="font-medium text-slate-700">Confirmación</p><p className="text-xs text-slate-400">{emailLabel(String(venta?.customerConfirmationEmailStatus ?? 'not_sent'))}</p></div>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <div><p className="font-medium text-slate-700">Voucher 48 hs</p><p className="text-xs text-slate-400">{voucherLabel(String(venta?.voucherStatus ?? 'not_generated'))}{reserva.voucherSentAt ? ` · ${formatDateTime(reserva.voucherSentAt)}` : reserva.voucherScheduledAt ? ` · prog. ${formatDateTime(reserva.voucherScheduledAt)}` : ''}</p></div>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <div><p className="font-medium text-slate-700">Aviso interno</p><p className="text-xs text-slate-400">{emailLabel(String(venta?.adminEmailStatus ?? 'not_sent'))}</p></div>
                  </li>
                </ul>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => enqueue('customer')}><ReceiptText className="h-4 w-4" />Voucher</Button>
                  <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => enqueue('admin')}><Mail className="h-4 w-4" />Admin</Button>
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-900">Vendedor</h2>
                  </div>
                  {reserva.referredBy && <Badge variant="outline" className="capitalize">{reserva.referredBy.payoutStatus}</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {reserva.referredBy ? `${reserva.referredBy.vendorName}${reserva.referredBy.code ? ` · ${reserva.referredBy.code}` : ''}` : 'Sin vendedor asignado'}
                </p>
                {reserva.referredBy && (
                  <p className="mt-1 text-xs text-slate-400">
                    Comisión {Number(reserva.referredBy.commissionAmount / 100).toLocaleString('es-AR')} {String(reserva.referredBy.commissionCurrency).toUpperCase()}
                    {reserva.referredBy.commissionType === 'percent' ? ` (${reserva.referredBy.commissionValue}%)` : ''}
                  </p>
                )}
                <div className="mt-3 space-y-2">
                  <VendorCombobox value={vendorId} includeId={reserva.referredBy?.vendorId} disabled={savingReferral} onChange={(id) => { setVendorId(id); setPickedCode(''); setManualCode(''); }} />
                  <Select value={pickedCode || 'none'} onValueChange={(v) => { setPickedCode(v === 'none' ? '' : v); setManualCode(''); }} disabled={!vendorId || !linksForPackage.length || linksLoading || savingReferral}>
                    <SelectTrigger><SelectValue placeholder={linksLoading ? 'Cargando…' : 'Código'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin código</SelectItem>
                      {linksForPackage.map((l) => <SelectItem key={l.id} value={l.code}>{l.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input value={manualCode} onChange={(e) => { setManualCode(e.target.value); if (e.target.value.trim()) setPickedCode(''); }} placeholder="O código manual" disabled={savingReferral} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="success" className="flex-1" disabled={savingReferral || (!vendorId && !pickedCode && !manualCode.trim())} onClick={() => handleReferral(false)}>
                      {savingReferral ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                    </Button>
                    {reserva.referredBy && <Button size="sm" variant="outline" disabled={savingReferral} onClick={() => handleReferral(true)}>Quitar</Button>}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>

        <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cancelar la venta?</AlertDialogTitle>
              <AlertDialogDescription>Se marca como cancelada y queda en el historial.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Volver</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 hover:bg-rose-700"
                onClick={() => { setConfirmCancel(false); handleStatus('cancelled', 'Cancelada desde el panel'); }}
              >
                Cancelar venta
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AdminLayout>
    </ProtectedRoute>
  );
}
