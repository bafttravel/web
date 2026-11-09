'use client';
import AdminFilePicker from '@/components/admin/AdminFilePicker';
import AdminDatePicker from '@/components/admin/AdminDatePicker';
import { RESERVATION_FILE_ACCEPT } from '@/lib/admin/files';
import { adminDateLabel, adminDateTimeLabel } from '@/lib/admin/dates';
import ReservationOperationsPanel from '@/components/admin/ReservationOperationsPanel';
import { collectorForPayment } from '@/lib/operations/calculations';
import AddonDisclosureButton from '@/components/admin/AddonDisclosureButton';

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
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Store,
  Ticket,
  Trash2,
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
import { EMPTY_RESERVATION_OPERATIONS, type ReservationOperationsInput } from '@/lib/operations/types';
import { operationsFetch } from '@/lib/operations/client';

/* ---------------------------------- types --------------------------------- */

const reservationStatusOptions: { value: ReservationStatus; label: string }[] = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'reserved', label: 'Reservada' },
  { value: 'completed', label: 'Completada' },
  { value: 'cancelled', label: 'Cancelada' },
];

type PaymentMovementType = 'payment' | 'extra' | 'discount' | 'refund' | 'adjustment';
type PaymentFormState = { movementType: PaymentMovementType; amount: string; method: string; reference: string; message: string; occurredAt: string };
type CustomerEditDraft = {
  customerName: string; customerEmail: string; customerPhone: string; customerCountry: string;
  customerDocument: string; customerBirthDate: string; customerComments: string;
};

const customerDraftFrom = (reservation: Reservation): CustomerEditDraft => ({
  customerName: reservation.customerName ?? '',
  customerEmail: reservation.customerEmail ?? '',
  customerPhone: reservation.customerPhone ?? '',
  customerCountry: reservation.customerCountry ?? '',
  customerDocument: reservation.customerDocument ?? '',
  customerBirthDate: String(reservation.customerBirthDate ?? '').slice(0, 10),
  customerComments: reservation.customerComments ?? '',
});

const operationDraftFrom = (reservation: Reservation): ReservationOperationsInput => {
  const value = reservation.operations;
  if (!value) return { ...EMPTY_RESERVATION_OPERATIONS };
  return {
    serviceExecuted: Boolean(value.serviceExecuted),
    channel: value.channel ?? 'front',
    sellerHotelId: value.sellerHotelId ?? '',
    commissionMethod: value.commissionMethod ?? '',
    pickupType: value.pickupType ?? 'other',
    pickupHotelId: value.pickupHotelId ?? '',
    pickupAddress: value.pickupAddress ?? '',
    pickupTime: value.pickupTime ?? '',
    notes: value.notes ?? '',
    diet: value.diet ?? '',
    automaticEmails: value.automaticEmails ?? true,
  };
};

/* --------------------------------- helpers -------------------------------- */

const formatDate = (date: unknown): string => {
  return date === 'sin-fecha' ? 'A coordinar' : adminDateLabel(date);
};

const formatDateTime = (date: unknown): string => {
  return adminDateTimeLabel(date);
};

const toMs = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  if (value && typeof value === 'object' && 'toDate' in value) return (value as { toDate: () => Date }).toDate().getTime();
  if (value && typeof value === 'object' && 'seconds' in value) return ((value as { seconds: number }).seconds ?? 0) * 1000;
  return 0;
};
const argentinaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const movementDateInput = (value: unknown) => {
  const ms = toMs(value);
  return ms ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(ms)) : argentinaToday();
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
  s === 'sent' ? 'Enviado' : s === 'queued' ? 'En cola' : s === 'sending' ? 'Enviando' : s === 'failed' ? 'Fallido' : s === 'cancelled' ? 'Cancelado' : 'Sin enviar';

const voucherLabel = (s: string) =>
  s === 'sent' ? 'Enviado' : s === 'generated' ? 'Generado' : s === 'queued' ? 'En cola' : s === 'failed' ? 'Fallido' : s === 'cancelled' ? 'Cancelado' : 'Sin voucher';

const movementLabels: Record<PaymentMovementType, string> = {
  payment: 'Pago',
  extra: 'Extra',
  discount: 'Descuento',
  refund: 'Reintegro',
  adjustment: 'Ajuste',
};

const methodLabels: Record<string, string> = {
  mercadopago: 'Mercado Pago',
  admin: 'Medio sin identificar',
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
const canCorrectMovement = (p: ReservaPaymentEvent): boolean =>
  (p.source === 'manual' || (!p.source && Boolean(p.recordedBy))) && !(movementOf(p) === 'extra' && p.includedInTotal) && p.status !== 'voided' && !p.correctedBy;

const moneyToCents = (value: string): number => {
  const input = value.replace(/[^\d,.-]/g, '').trim();
  const comma = input.lastIndexOf(',');
  const dot = input.lastIndexOf('.');
  let normalized = input;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    normalized = input.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.');
  } else if (comma >= 0) {
    normalized = input.replace(/\./g, '').replace(',', '.');
  } else if (dot >= 0 && !/^\d{1,3}(?:\.\d{3})+$/.test(input)) {
    normalized = input;
  } else {
    normalized = input.replace(/\./g, '');
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
};

const passengerDraftShape = (passenger: Record<string, unknown>) => {
  const ageValue = String(passenger.age ?? '').trim();
  const age = ageValue ? Number(ageValue) : undefined;
  return {
    firstName: String(passenger.firstName ?? '').trim(),
    lastName: String(passenger.lastName ?? '').trim(),
    ...(age !== undefined && Number.isFinite(age) ? { age } : {}),
    birthDate: String(passenger.birthDate ?? '').slice(0, 10),
    phone: String(passenger.phone ?? '').trim(),
    document: String(passenger.document ?? '').trim(),
    nationality: String(passenger.nationality ?? '').trim(),
    diet: String(passenger.diet ?? '').trim(),
    ...(passenger.travelerType === 'adult' || passenger.travelerType === 'minor' ? { travelerType: passenger.travelerType } : {}),
  };
};

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="admin-eyebrow text-xs text-slate-400">{children}</p>
);

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`admin-sale-card min-w-0 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 ${className}`}>{children}</section>
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
  const [dateDraft, setDateDraft] = useState('');
  const [editingDate, setEditingDate] = useState(false);
  const [savingDate, setSavingDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [attachments, setAttachments] = useState<ReservationAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [payments, setPayments] = useState<ReservaPaymentEvent[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [otherPurchases, setOtherPurchases] = useState<Reservation[]>([]);
  const [operationDraft, setOperationDraft] = useState<ReservationOperationsInput>({ ...EMPTY_RESERVATION_OPERATIONS });
  const [savingChanges, setSavingChanges] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [referralReady, setReferralReady] = useState(false);
  const [links, setLinks] = useState<AdminVendorLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [pickedCode, setPickedCode] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [editingMovementId, setEditingMovementId] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [form, setForm] = useState<PaymentFormState>({ movementType: 'payment', amount: '', method: 'transfer', reference: '', message: '', occurredAt: argentinaToday() });
  const [showAddonForm, setShowAddonForm] = useState(false);
  const [editingAddonIndex, setEditingAddonIndex] = useState<number | null>(null);
  const [addonScope, setAddonScope] = useState<'per_booking' | 'per_person'>('per_booking');
  const [addonDeleteTarget, setAddonDeleteTarget] = useState<{ index: number; label: string; amount: number } | null>(null);
  const [pendingAddonRemoval, setPendingAddonRemoval] = useState<{ index: number; label: string; amount: number } | null>(null);
  const [addonCatalog, setAddonCatalog] = useState<
    Array<{ key: string; packageTitle: string; addon: { id: string; title: string; price: number } }>
  >([]);
  const [loadingAddons, setLoadingAddons] = useState(false);
  const [addonQuery, setAddonQuery] = useState('');
  const [addonPickedKey, setAddonPickedKey] = useState('');
  const [addonTitle, setAddonTitle] = useState('');
  const [addonPrice, setAddonPrice] = useState('');
  const [showCustomerEditor, setShowCustomerEditor] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerEditDraft>({ customerName: '', customerEmail: '', customerPhone: '', customerCountry: '', customerDocument: '', customerBirthDate: '', customerComments: '' });
  const [customerPassengersDraft, setCustomerPassengersDraft] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async (withSkeleton = false, syncStatus = false, syncOperations = false) => {
    if (withSkeleton) setLoading(true);
    try {
      const data = await getReservaById(params.id);
      if (!data) {
        toast.error('Venta no encontrada');
        router.replace('/admin/ventas');
        return;
      }
      setReserva(data);
      setDateDraft(data.date === 'sin-fecha' ? '' : data.date);
      if (syncStatus) setStatus(data.status);
      if (syncOperations) setOperationDraft(operationDraftFrom(data));
      setAttachments(data.attachments ?? []);
      setPaymentsLoading(true);
      setPayments(await getReservaPayments(params.id, { limit: 50 }));
      return data;
    } catch (e) {
      console.error(e);
      toast.error('No pudimos cargar la venta');
    } finally {
      if (withSkeleton) setLoading(false);
      setPaymentsLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => { load(true, true, true); }, [load]);

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
    setReferralReady(false);
    if (!reserva?.referredBy) { setVendorId(''); setPickedCode(''); setManualCode(''); setLinks([]); setReferralReady(true); return; }
    setVendorId(reserva.referredBy.vendorId ?? '');
    setPickedCode(reserva.referredBy.code ?? '');
    setManualCode('');
    setReferralReady(true);
  }, [reserva?.id]);

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

  const openAddonEditor = (index: number, extra: Record<string, unknown>) => {
    const scope = String(extra.scope ?? 'per_booking') === 'per_person' ? 'per_person' : 'per_booking';
    const amount = Math.max(0, Number(extra.amount ?? 0) || 0);
    const unitAmount = amount / (scope === 'per_person' ? Math.max(1, reserva?.people ?? 1) : 1);
    setEditingAddonIndex(index);
    setAddonScope(scope);
    setAddonTitle(String(extra.label ?? ''));
    setAddonPrice((unitAmount / 100).toFixed(2));
    setAddonPickedKey('');
    setShowAddonForm(true);
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout>
          <div className="mx-auto flex max-w-7xl flex-col gap-4">
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
  const extras = (Array.isArray(r.selectedExtras) ? r.selectedExtras as Array<Record<string, unknown>> : [])
    .map((extra, index) => ({ extra, index }))
    .filter(({ extra }) => String(extra.label ?? '').trim());
  const extrasTotalForDisplay = extras.reduce((sum, { extra }) => sum + (Number(extra.amount) || 0), 0);
  const baseSubtotal = Number(r.baseSubtotalAmount ?? Math.max(0, Number(r.amountTotal ?? 0) - extrasTotalForDisplay));
  const travelers: Array<Record<string, unknown>> = Array.isArray(r.passengerDetails) ? (r.passengerDetails as unknown as Array<Record<string, unknown>>) : [];
  const pickup = String(r.pickupPoint ?? '').trim();
  const pickupTime = String(r.pickupPointTime ?? '').trim();
  const mpId = String(reserva.mercadoPagoPaymentId ?? '').trim();
  const progress = finance.billedTotal > 0 ? Math.max(0, Math.min(100, Math.round((finance.totalPaid / finance.billedTotal) * 100))) : 0;
  const country = reserva.customerCountry ? getCountryByName(reserva.customerCountry) : null;

  const authed = async () => {
    if (!user) { toast.error('Sesión expirada'); return null; }
    return user.getIdToken();
  };

  const customerPassengers = customerPassengersDraft.map(passengerDraftShape);
  const originalPassengers = (reserva.passengerDetails ?? []).map((passenger) => passengerDraftShape(passenger as unknown as Record<string, unknown>));
  const customerDirty = showCustomerEditor && (
    JSON.stringify(customerDraft) !== JSON.stringify(customerDraftFrom(reserva)) ||
    JSON.stringify(customerPassengers) !== JSON.stringify(originalPassengers)
  );
  const statusDirty = status !== reserva.status;
  const operationDirty = JSON.stringify(operationDraft) !== JSON.stringify(operationDraftFrom(reserva));
  const referralCodeDraft = manualCode.trim() || pickedCode.trim();
  const referralDirty = referralReady && (vendorId !== String(reserva.referredBy?.vendorId ?? '') || referralCodeDraft !== String(reserva.referredBy?.code ?? ''));
  const currentExtras = Array.isArray(reserva.selectedExtras) ? reserva.selectedExtras as Array<Record<string, unknown>> : [];
  const editedExtra = editingAddonIndex === null ? null : currentExtras[editingAddonIndex] ?? null;
  const editedAddonAmount = moneyToCents(addonPrice) * (addonScope === 'per_person' ? Math.max(1, reserva.people || 1) : 1);
  const addonEditDirty = Boolean(showAddonForm && editedExtra && (
    addonTitle.trim() !== String(editedExtra.label ?? '').trim() ||
    editedAddonAmount !== Number(editedExtra.amount ?? 0) ||
    addonScope !== (String(editedExtra.scope ?? 'per_booking') === 'per_person' ? 'per_person' : 'per_booking')
  ));
  const addonAddDirty = Boolean(showAddonForm && editingAddonIndex === null && (addonTitle.trim() || addonPrice.trim()));
  const addonDirty = Boolean(pendingAddonRemoval || addonEditDirty || addonAddDirty);
  const movementDirty = Boolean(editingMovementId || (showMovementForm && (form.amount.trim() || form.reference.trim() || form.message.trim())));
  const dirtySections = [
    statusDirty && 'Estado',
    customerDirty && 'Cliente y pasajeros',
    operationDirty && 'Operación',
    referralDirty && 'Referido',
    addonDirty && 'Adicionales',
    movementDirty && 'Movimientos',
  ].filter(Boolean) as string[];
  const hasUnsavedChanges = dirtySections.length > 0;

  const patchReservation = async (token: string, body: Record<string, unknown>) => {
    const response = await fetch('/api/admin/reservas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reservationId: reserva.id, ...body }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'No se pudieron guardar los cambios');
  };

  const saveDepartureDate = async () => {
    if (!reserva || !dateDraft || dateDraft === reserva.date || savingDate || savingChanges) return;
    const token = await authed();
    if (!token) return;
    setSavingDate(true);
    try {
      await patchReservation(token, { date: dateDraft, note: `Reprogramada a ${dateDraft}` });
      await load(false);
      setEditingDate(false);
      toast.success('Fecha de salida actualizada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo reprogramar la salida');
    } finally {
      setSavingDate(false);
    }
  };

  const saveAllChanges = async () => {
    if (savingChanges || !hasUnsavedChanges) return;
    const token = await authed();
    if (!token) return;

    if (customerDirty) {
      if (customerDraft.customerName.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(customerDraft.customerEmail.trim())) {
        toast.error('Revisá el nombre y el email del cliente'); return;
      }
      if (customerPassengers.some((passenger) => {
        const firstName = String(passenger.firstName ?? '').trim();
        const lastName = String(passenger.lastName ?? '').trim();
        return Boolean(firstName || lastName) && (firstName.length < 2 || lastName.length < 2);
      })) { toast.error('Completá nombre y apellido de cada acompañante que tenga datos'); return; }
    }
    if (operationDirty && operationDraft.sellerHotelId && !operationDraft.commissionMethod) {
      toast.error('Elegí el medio de pago de comisión para el hotel vendedor'); return;
    }
    if (operationDirty && operationDraft.pickupType === 'hotel' && !operationDraft.pickupHotelId) {
      toast.error('Elegí el hotel donde se retirará al pasajero'); return;
    }
    if (addonDirty && pendingAddonRemoval && (addonEditDirty || addonAddDirty)) {
      toast.error('Confirmá una acción de adicional por vez'); return;
    }
    if (addonEditDirty || addonAddDirty) {
      if (!addonTitle.trim()) { toast.error('Ingresá el título del adicional'); return; }
      if (!moneyToCents(addonPrice)) { toast.error('Ingresá un precio válido para el adicional'); return; }
      if (addonEditDirty && !editedExtra) { toast.error('El adicional cambió. Actualizá la venta e intentá otra vez.'); return; }
    }
    let movementDate: Date | null = null;
    if (movementDirty) {
      if (!moneyToCents(form.amount)) { toast.error('Ingresá un monto válido para el movimiento'); return; }
      movementDate = new Date(`${form.occurredAt}T12:00:00-03:00`);
      if (!form.occurredAt || Number.isNaN(movementDate.getTime())) { toast.error('Ingresá una fecha válida para el movimiento'); return; }
      if (movementDate.getTime() > Date.now() + 60000) { toast.error('La fecha del movimiento no puede ser futura'); return; }
      if (editingMovementId && correctionReason.trim().length < 3) { toast.error('Indicá el motivo de la corrección (al menos 3 caracteres)'); return; }
    }

    setSavingChanges(true);
    try {
      if (operationDirty) {
        await operationsFetch('/api/admin/reservation-operations', {
          method: 'PATCH',
          body: JSON.stringify({ reservationId: reserva.id, operations: operationDraft }),
        });
        setReserva((current) => current ? { ...current, operations: { ...current.operations, ...operationDraft } as NonNullable<Reservation['operations']> } : current);
        await load(false, false, true);
      }

      if (statusDirty) {
        await patchReservation(token, { status, note: statusNote.trim() || undefined });
        setReserva((current) => current ? { ...current, status } : current);
        setStatusNote('');
        await load(false, true, true);
      }

      if (customerDirty) {
        await patchReservation(token, { updateCustomer: { ...customerDraft, passengerDetails: customerPassengers } });
        setShowCustomerEditor(false);
        await load(false);
      }

      if (pendingAddonRemoval) {
        await patchReservation(token, { removeAddonExtra: pendingAddonRemoval });
        setPendingAddonRemoval(null);
        await load(false);
      } else if (addonEditDirty && editedExtra && editingAddonIndex !== null) {
        await patchReservation(token, { updateAddonExtra: {
          index: editingAddonIndex,
          expectedLabel: String(editedExtra.label ?? ''),
          expectedAmount: Number(editedExtra.amount ?? 0),
          title: addonTitle.trim(),
          amount: editedAddonAmount,
          scope: addonScope,
        } });
        setShowAddonForm(false); setEditingAddonIndex(null); setAddonTitle(''); setAddonPrice(''); setAddonPickedKey(''); setAddonScope('per_booking');
        await load(false);
      } else if (addonAddDirty) {
        await patchReservation(token, { addAddonExtra: { title: addonTitle.trim().slice(0, 120), price: moneyToCents(addonPrice) / 100, scope: addonScope } });
        setShowAddonForm(false); setEditingAddonIndex(null); setAddonTitle(''); setAddonPrice(''); setAddonPickedKey(''); setAddonScope('per_booking');
        await load(false);
      }

      if (movementDirty && movementDate) {
        const amount = moneyToCents(form.amount);
        const occurredAt = movementDate.toISOString();
        await patchReservation(token, editingMovementId ? {
          correctPaymentEvent: { paymentId: editingMovementId, movementType: form.movementType, amount, method: form.method, reference: form.reference.trim() || undefined, message: form.message.trim(), reason: correctionReason.trim(), occurredAt },
        } : {
          addPaymentEvent: { movementType: form.movementType, amount, currency: reserva.currency, method: form.method, reference: form.reference.trim() || undefined, message: form.message.trim(), occurredAt },
        });
        setForm({ movementType: 'payment', amount: '', method: 'transfer', reference: '', message: '', occurredAt: argentinaToday() });
        setEditingMovementId(''); setCorrectionReason(''); setShowMovementForm(false);
        await load(false);
      }

      if (referralDirty) {
        if (!vendorId && !referralCodeDraft && reserva.referredBy) {
          await patchReservation(token, { clearReferredBy: true });
        } else {
          await patchReservation(token, { ...(vendorId ? { vendorId } : {}), ...(referralCodeDraft ? { referralCode: referralCodeDraft } : {}) });
        }
        const updated = await load(false);
        if (updated) {
          if (updated.referredBy) {
            setVendorId(updated.referredBy.vendorId ?? '');
            setPickedCode(updated.referredBy.code ?? '');
            setManualCode('');
          } else {
            setVendorId(''); setPickedCode(''); setManualCode('');
          }
        }
      }

      toast.success('Todos los cambios quedaron guardados');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron guardar todos los cambios');
    } finally {
      setSavingChanges(false);
    }
  };

  const openCustomerEditor = () => {
    setCustomerDraft(customerDraftFrom(reserva));
    setCustomerPassengersDraft((reserva.passengerDetails ?? []).map((passenger) => ({ ...passenger })));
    setShowCustomerEditor(true);
  };

  const startEditMovement = (movement: ReservaPaymentEvent) => {
    if (!canCorrectMovement(movement)) return;
    setEditingMovementId(movement.id);
    setCorrectionReason('');
    setForm({
      movementType: movementOf(movement),
      amount: (Number(movement.amount ?? 0) / 100).toFixed(2),
      method: String(movement.method ?? 'transfer'),
      reference: String(movement.reference ?? ''),
      message: String(movement.message ?? ''),
      occurredAt: movementDateInput(movement.occurredAt ?? movement.createdAt),
    });
    setShowMovementForm(true);
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

  const uploadFiles = async (files: File[]) => {
    if (!files?.length) return;
    const token = await authed(); if (!token) throw new Error('Iniciá sesión para adjuntar archivos');
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
    } catch { toast.error('No pudimos subir el comprobante'); throw new Error('No se pudieron adjuntar los archivos. Intentá de nuevo.'); } finally { setUploading(false); }
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
        <div className="admin-sale-detail">
          {/* Header */}
          <header className="admin-sale-header">
            <div className="min-w-0">
              <Button variant="ghost" size="sm" asChild className="admin-sale-back"><Link href="/admin/ventas"><ArrowLeft className="h-4 w-4" />Todas las ventas</Link></Button>
              <p className="admin-sale-kicker">Detalle de venta</p>
              <h1>{title}</h1>
              <div className="admin-sale-header-meta"><span className="admin-sale-code">{code ? code : 'Código pendiente'}</span><span>{reserva.date === 'sin-fecha' ? 'Fecha a coordinar' : formatDate(reserva.date)}</span><span>{reserva.people} {reserva.people === 1 ? 'pasajero' : 'pasajeros'}</span></div>
            </div>
            <div className="admin-sale-header-summary">
              <div className="admin-sale-statuses">
                <Badge variant={commercialBadge[reserva.status]}>{venta?.commercialStatusLabel ?? ventaStatusLabel(reserva.status)}</Badge>
                <Badge variant={financeBadge(finance)}>{financeStatusLabel(finance)}</Badge>
              </div>
              <div><p className="admin-sale-overline">Total de la venta</p><p className="admin-sale-total">{formatAmount(finance.billedTotal, finance.currency)}</p></div>
            </div>
          </header>

          <div className="admin-sale-columns">
            <main className="admin-sale-main">
              {/* Pago — única fuente de verdad */}
              <Card className="admin-sale-finance">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <CreditCard className="mt-0.5 h-4 w-4 text-slate-500" />
                    <div><h2 className="text-base font-semibold text-slate-900">Cobros del pasajero</h2><p className="mt-1 text-xs text-slate-500">Importes recibidos, pendientes y ajustes vinculados a esta venta.</p></div>
                    {finance.paidViaReservaFallback && (
                      <span className="text-[11px] text-slate-400">· pago confirmado en la reserva, sin detalle de movimientos</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">{methodLabel(venta?.paymentMethodLabel ?? reserva.paymentMethod)} · {venta?.paymentStatusLabel ?? ''}</span>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-slate-700">Progreso de cobro</span><span className="font-semibold tabular-nums text-slate-900">{progress}%</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Porcentaje cobrado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                    <div className={`h-full rounded-full transition-[width] ${finance.status === 'settled' ? 'bg-emerald-500' : finance.status === 'partial' ? 'bg-amber-400' : 'bg-slate-400'}`} style={{ width: `${progress}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap justify-between gap-1 text-[11px] text-slate-500"><span>Cobrado <strong className="font-semibold text-slate-700">{formatAmount(finance.totalPaid, finance.currency)}</strong></span><span>De <strong className="font-semibold text-slate-700">{formatAmount(finance.billedTotal, finance.currency)}</strong></span></div>
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
                    Referencia de pago de Mercado Pago: {mpId}
                  </p>
                )}

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between">
                    <div><Eyebrow>Movimientos · {paymentRows.length}</Eyebrow><p className="mt-1 text-[11px] text-slate-400">Los movimientos manuales se corrigen conservando el original; los de pasarela quedan protegidos.</p></div>
                    <Button variant="outline" size="sm" disabled={savingChanges} onClick={() => {
                      if (showMovementForm) {
                        setEditingMovementId(''); setCorrectionReason('');
                        setForm({ movementType: 'payment', amount: '', method: 'transfer', reference: '', message: '', occurredAt: argentinaToday() });
                        setShowMovementForm(false);
                      } else {
                        setForm({ movementType: 'payment', amount: '', method: 'transfer', reference: '', message: '', occurredAt: argentinaToday() });
                        setShowMovementForm(true);
                      }
                    }}>
                      <Plus className="h-4 w-4" />{showMovementForm ? 'Cancelar movimiento' : 'Agregar movimiento'}
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
                          : 'Todavía no hay cobros registrados.'}
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-slate-100 rounded-xl ring-1 ring-black/[0.04]">
                      {paymentRows.map((p) => {
                        const t = movementOf(p);
                        const neg = t === 'discount' || t === 'refund';
                        const collector = collectorForPayment(reserva.operations?.sellerHotelId ?? '', p.method) === 'hotel' ? reserva.operations?.sellerHotelName || 'el hotel' : 'Baftravel';
                        return (
                          <li key={p.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {movementLabels[t]} <span className="font-normal text-slate-400">· {methodLabel(p.method)}</span>{p.status === 'voided' && <Badge variant="outline" className="ml-2 border-amber-200 bg-amber-50 text-amber-800">{p.correctedBy ? 'Corregido' : 'Anulado'}</Badge>}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {formatDateTime(p.occurredAt ?? p.createdAt)}{p.status === 'voided' ? ` · ${p.correctedBy ? 'Movimiento reemplazado' : 'Movimiento anulado'}${p.correctionReason ? `: ${p.correctionReason}` : ''}` : ['payment', 'refund'].includes(t) ? ` · ${t === 'refund' ? 'Reintegró' : 'Recibió'} ${collector}` : ''}{p.message ? ` · ${p.message}` : ''}{p.reference ? ` · Ref. ${p.reference}` : ''}
                              </p>
                              {p.correctsPaymentId && <p className="mt-1 text-[11px] font-medium text-blue-700">Corrección de un movimiento anterior{p.correctionReason ? ` · ${p.correctionReason}` : ''}</p>}
                            </div>
                            <div className="flex shrink-0 items-center gap-2"><p className={`text-sm font-semibold tabular-nums ${p.status === 'voided' ? 'text-slate-400 line-through' : neg ? 'text-rose-600' : t === 'payment' ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {neg ? '−' : '+'}{formatAmount(Number(p.amount ?? 0), String(p.currency ?? finance.currency))}
                             </p>{canCorrectMovement(p) && <Button variant="ghost" size="icon-sm" disabled={savingChanges} aria-label={`Corregir movimiento ${movementLabels[t]}`} onClick={() => startEditMovement(p)}><Pencil className="h-3.5 w-3.5" /></Button>}</div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {showMovementForm && (
                    <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-black/[0.04] sm:grid-cols-2">
                      <div className="sm:col-span-2"><p className="text-sm font-semibold text-slate-900">{editingMovementId ? 'Corregir movimiento' : 'Registrar movimiento'}</p><p className="mt-1 text-xs text-slate-500">{editingMovementId ? 'El registro original se conservará marcado como corregido.' : 'El movimiento se agregará al historial financiero de esta reserva.'}</p></div>
                      <div className="space-y-1">
                        <Label>Tipo</Label>
                        <Select value={form.movementType} onValueChange={(v) => setForm((c) => ({ ...c, movementType: v as PaymentMovementType }))} disabled={savingChanges}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(movementLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Medio</Label>
                        <Select value={form.method} onValueChange={(v) => setForm((c) => ({ ...c, method: v }))} disabled={savingChanges}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="transfer">Transferencia</SelectItem>
                            <SelectItem value="cash">Efectivo</SelectItem>
                            <SelectItem value="card">Tarjeta</SelectItem>
                            <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                            <SelectItem value="admin">Sin identificar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {['payment', 'refund'].includes(form.movementType) && <p className="self-center text-sm text-slate-600">{form.movementType === 'refund' ? 'Reintegro a cargo de: ' : 'Recibe: '}<strong>{collectorForPayment(reserva.operations?.sellerHotelId ?? '', form.method) === 'hotel' ? reserva.operations?.sellerHotelName || 'el hotel' : 'Baftravel'}</strong></p>}
                      <div className="space-y-1">
                        <Label>Monto</Label>
                        <Input value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} placeholder="0,00" inputMode="decimal" disabled={savingChanges} />
                      </div>
                      <div className="space-y-1"><Label>Fecha del movimiento</Label><AdminDatePicker aria-label="Fecha del movimiento" required max={argentinaToday()} value={form.occurredAt} onValueChange={(occurredAt) => setForm((current) => ({ ...current, occurredAt }))} disabled={savingChanges} /></div>
                      <div className="space-y-1">
                        <Label>Referencia (opcional)</Label>
                        <Input value={form.reference} onChange={(e) => setForm((c) => ({ ...c, reference: e.target.value }))} placeholder="Opcional" disabled={savingChanges} />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Detalle / referencia (opcional)</Label>
                        <Textarea value={form.message} onChange={(e) => setForm((c) => ({ ...c, message: e.target.value }))} placeholder="Ej. seña por transferencia" rows={2} disabled={savingChanges} />
                      </div>
                      {editingMovementId && <div className="space-y-1 sm:col-span-2"><Label>Motivo de la corrección</Label><Input value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="Ej. se corrigió el medio de pago" maxLength={160} disabled={savingChanges} /></div>}
                      <p className="text-xs text-slate-500 sm:col-span-2">El movimiento se aplicará junto con el resto de los cambios al usar el botón flotante.</p>
                      <div className="sm:col-span-2">{editingMovementId && <Button size="sm" variant="outline" disabled={savingChanges} onClick={() => { setEditingMovementId(''); setCorrectionReason(''); setShowMovementForm(false); }}>Cancelar corrección</Button>}</div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Viaje */}
              <Card className="admin-sale-trip">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2"><Ticket className="mt-0.5 h-4 w-4 text-slate-500" /><div><h2 className="text-base font-semibold text-slate-900">Viaje e importe</h2><p className="mt-1 text-xs text-slate-500">Salida, pasajeros y conceptos que forman el total de la venta.</p></div></div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                    <dt className="text-xs text-slate-500">Fecha de salida</dt>
                    {!editingDate ? (
                      <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{reserva.date === 'sin-fecha' ? 'A coordinar' : formatDate(reserva.date)}</span>
                        <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg px-2 text-xs" disabled={savingChanges || savingDate} onClick={() => { setDateDraft(reserva.date === 'sin-fecha' ? '' : reserva.date); setEditingDate(true); }}>
                          <CalendarDays className="h-3.5 w-3.5" />Cambiar fecha
                        </Button>
                      </dd>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <AdminDatePicker aria-label="Nueva fecha de salida" required value={dateDraft} onValueChange={setDateDraft} disabled={savingDate || savingChanges} className="w-full" />
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" className="h-7 rounded-lg px-2.5 text-xs" disabled={!dateDraft || dateDraft === reserva.date || savingDate || savingChanges} onClick={() => void saveDepartureDate()}>
                            {savingDate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Guardar fecha
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 rounded-lg px-2.5 text-xs" disabled={savingDate || savingChanges} onClick={() => { setDateDraft(reserva.date === 'sin-fecha' ? '' : reserva.date); setEditingDate(false); }}>Cancelar</Button>
                        </div>
                        <p className="text-[11px] text-slate-500">La nueva fecha debe estar habilitada para esta excursión.</p>
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5"><dt className="text-xs text-slate-500">Pasajeros</dt><dd className="mt-1 font-semibold text-slate-900">{reserva.people} {reserva.people === 1 ? 'persona' : 'personas'}</dd></div>
                  {(pickup || pickupTime) && (
                    <div className="flex items-start gap-1.5 rounded-xl bg-slate-50 px-3 py-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><div><dt className="text-xs text-slate-500">Punto y horario de ascenso</dt><dd className="mt-1 font-medium text-slate-900">{pickup || '—'}{pickupTime ? ` · ${pickupTime}` : ''}</dd></div></div>
                  )}
                  {seats.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 sm:col-span-2">
                      <div><dt className="text-xs text-slate-500">Butacas asignadas</dt><dd className="mt-1 font-medium text-slate-900">{seats.join(', ')}</dd></div>
                      {reserva.date !== 'sin-fecha' && (
                        <Button asChild size="sm" variant="outline"><Link href={`/admin/butacas?packageId=${encodeURIComponent(String(reserva.packageId ?? reserva.experienceId))}&date=${encodeURIComponent(String(reserva.date))}`}>Ver mapa de butacas</Link></Button>
                      )}
                    </div>
                  )}
                </dl>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900">Detalle del importe</h3><p className="mt-0.5 text-xs text-slate-500">Los adicionales se pueden editar o quitar; el total se actualiza automáticamente.</p></div></div>
                    {extras.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">Esta venta no tiene adicionales.</p>}
                    {baseSubtotal > 0 && (
                      <p className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm"><span className="text-slate-600">Excursión · {reserva.people} {reserva.people === 1 ? 'persona' : 'personas'}</span><span className="shrink-0 font-medium tabular-nums text-slate-900">{formatAmount(baseSubtotal, finance.currency)}</span></p>
                    )}
                    {extras.map(({ extra: rec, index }) => {
                      const amt = Math.max(0, Number(rec.amount ?? 0) || 0);
                      return (
                        <div key={`${String(rec.label)}-${index}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2.5">
                          <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{String(rec.label ?? 'Adicional')}</p><p className="text-[11px] text-slate-500">{String(rec.scope ?? 'per_booking') === 'per_person' ? `Por persona · ${reserva.people} pasajero${reserva.people === 1 ? '' : 's'}` : 'Por reserva'}</p></div>
                          <div className="flex items-center gap-2"><span className="text-sm font-semibold tabular-nums text-slate-900">{formatAmount(amt, finance.currency)}</span><Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar adicional ${String(rec.label ?? '')}`} disabled={savingChanges || Boolean(pendingAddonRemoval)} onClick={() => openAddonEditor(index, rec)}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" className="text-slate-400 hover:text-rose-600" aria-label={`Quitar adicional ${String(rec.label ?? '')}`} disabled={savingChanges || Boolean(pendingAddonRemoval) || addonEditDirty || addonAddDirty} onClick={() => setAddonDeleteTarget({ index, label: String(rec.label ?? ''), amount: amt })}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                        </div>
                      );
                    })}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                      <div><p className="text-xs text-slate-500">Total actualizado</p><p className="mt-0.5 text-lg font-bold tabular-nums text-slate-950">{formatAmount(finance.billedTotal, finance.currency)}</p></div>
                      <AddonDisclosureButton open={showAddonForm} controls="sale-addon-form" onToggle={() => { if (showAddonForm && (addonAddDirty || addonEditDirty)) { toast.info('Usá Cancelar para descartar el cambio del adicional'); return; } if (showAddonForm) { setEditingAddonIndex(null); setAddonTitle(''); setAddonPrice(''); } else { setEditingAddonIndex(null); setAddonScope('per_booking'); setAddonTitle(''); setAddonPrice(''); setAddonPickedKey(''); } setShowAddonForm((v) => !v); }} disabled={savingChanges || Boolean(pendingAddonRemoval)} />
                      {pendingAddonRemoval && <span className="admin-sale-pending-removal">Se quitará “{pendingAddonRemoval.label}” al guardar.</span>}
                      {pendingAddonRemoval && <Button type="button" size="sm" variant="ghost" disabled={savingChanges} onClick={() => setPendingAddonRemoval(null)}>Deshacer</Button>}
                    </div>
                    {showAddonForm && (
                      <div id="sale-addon-form" className="mt-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                        <p className="text-sm font-semibold text-slate-900">{editingAddonIndex === null ? 'Agregar adicional' : 'Editar adicional'}</p>
                        <p className="mt-1 text-xs text-slate-500">{editingAddonIndex === null ? 'Elegí un concepto del catálogo o escribí uno propio.' : 'El cambio ajustará el total de la venta y quedará asentado en el historial.'}</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {editingAddonIndex === null && <div className="space-y-1 sm:col-span-2">
                            <Label>Buscar adicional</Label>
                            <Input
                              value={addonQuery}
                              onChange={(e) => { setAddonQuery(e.target.value); setAddonPickedKey(''); }}
                              placeholder="Ej. almuerzo, traslado, fotos…"
                               disabled={savingChanges || loadingAddons || Boolean(pendingAddonRemoval)}
                            />
                          </div>}
                          {editingAddonIndex === null && <div className="space-y-1 sm:col-span-2">
                            <Label>Adicional</Label>
                            <Select value={addonPickedKey || 'none'} onValueChange={setAddonPickedKey} disabled={savingChanges || loadingAddons || Boolean(pendingAddonRemoval) || filteredAddons.length === 0}>
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
                          </div>}
                          <div className="space-y-1">
                            <Label>Título</Label>
                            <Input value={addonTitle} onChange={(e) => setAddonTitle(e.target.value)} placeholder="Ej. traslado, almuerzo…" disabled={savingChanges || Boolean(pendingAddonRemoval)} maxLength={120} />
                          </div>
                          <div className="space-y-1">
                            <Label>Precio unitario ({String(reserva.currency).toUpperCase()})</Label>
                            <Input value={addonPrice} onChange={(e) => setAddonPrice(e.target.value)} placeholder="0,00" inputMode="decimal" disabled={savingChanges || Boolean(pendingAddonRemoval)} />
                          </div>
                          <label className="space-y-1 text-sm sm:col-span-2">Aplicación<select className="h-10 w-full rounded-md border bg-white px-3" value={addonScope} onChange={(e) => setAddonScope(e.target.value as 'per_booking' | 'per_person')} disabled={savingChanges || Boolean(pendingAddonRemoval)}><option value="per_booking">Una vez por reserva</option><option value="per_person">Por persona ({reserva.people} pasajero{reserva.people === 1 ? '' : 's'})</option></select></label>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2"><p className="text-xs text-slate-500">{addonAddDirty || addonEditDirty ? 'El cambio está pendiente y se aplicará con el botón flotante.' : 'Completá los campos; se guardarán junto con el resto de la venta.'}</p><Button size="sm" variant="outline" disabled={savingChanges} onClick={() => { setShowAddonForm(false); setEditingAddonIndex(null); setAddonTitle(''); setAddonPrice(''); setAddonPickedKey(''); setAddonScope('per_booking'); }}>Cancelar</Button></div>
                      </div>
                    )}
                  </div>
              </Card>

              {/* Cliente y pasajeros — una sola vez */}
              <Card className="admin-sale-customer">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 text-slate-500" /><div><h2 className="text-base font-semibold text-slate-900">Cliente y pasajeros</h2><p className="mt-1 text-xs text-slate-500">Los cambios se aplican solo a esta reserva.</p></div></div>
                  <Button type="button" size="sm" variant={showCustomerEditor ? 'outline' : 'secondary'} disabled={savingChanges} onClick={() => showCustomerEditor ? setShowCustomerEditor(false) : openCustomerEditor()}>{showCustomerEditor ? 'Cancelar edición' : <><Pencil className="h-4 w-4" />Editar datos</>}</Button>
                </div>
                {showCustomerEditor ? <div className="mt-4 space-y-4">
                  <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                    <label className="space-y-1 text-sm sm:col-span-2">Nombre y apellido<Input value={customerDraft.customerName} onChange={(e) => setCustomerDraft((draft) => ({ ...draft, customerName: e.target.value }))} maxLength={120} required disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">Email<Input type="email" value={customerDraft.customerEmail} onChange={(e) => setCustomerDraft((draft) => ({ ...draft, customerEmail: e.target.value }))} maxLength={200} required disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">Teléfono<Input value={customerDraft.customerPhone} onChange={(e) => setCustomerDraft((draft) => ({ ...draft, customerPhone: e.target.value }))} maxLength={40} disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">País / nacionalidad<Input value={customerDraft.customerCountry} onChange={(e) => setCustomerDraft((draft) => ({ ...draft, customerCountry: e.target.value }))} maxLength={80} disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">Documento<Input value={customerDraft.customerDocument} onChange={(e) => setCustomerDraft((draft) => ({ ...draft, customerDocument: e.target.value }))} maxLength={40} disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">Fecha de nacimiento<AdminDatePicker aria-label="Fecha de nacimiento del titular" max={argentinaToday()} value={customerDraft.customerBirthDate} onValueChange={(customerBirthDate) => setCustomerDraft((draft) => ({ ...draft, customerBirthDate }))} disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm sm:col-span-2">Comentarios<Textarea value={customerDraft.customerComments} onChange={(e) => setCustomerDraft((draft) => ({ ...draft, customerComments: e.target.value }))} maxLength={1000} rows={2} disabled={savingChanges} /></label>
                  </div>
                  {customerPassengersDraft.map((passenger, index) => <fieldset key={index} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold text-slate-800">Pasajero {index + 2}</legend>
                    <label className="space-y-1 text-sm">Nombre<Input value={String(passenger.firstName ?? '')} onChange={(e) => setCustomerPassengersDraft((items) => items.map((item, i) => i === index ? { ...item, firstName: e.target.value } : item))} maxLength={80} disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">Apellido<Input value={String(passenger.lastName ?? '')} onChange={(e) => setCustomerPassengersDraft((items) => items.map((item, i) => i === index ? { ...item, lastName: e.target.value } : item))} maxLength={80} disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">Fecha de nacimiento<AdminDatePicker aria-label={`Fecha de nacimiento del acompañante ${index + 1}`} max={argentinaToday()} value={String(passenger.birthDate ?? '').slice(0, 10)} onValueChange={(birthDate) => setCustomerPassengersDraft((items) => items.map((item, i) => i === index ? { ...item, birthDate } : item))} disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">Edad<Input type="number" min="0" max="120" value={String(passenger.age ?? '')} onChange={(e) => setCustomerPassengersDraft((items) => items.map((item, i) => i === index ? { ...item, age: e.target.value } : item))} disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">Documento<Input value={String(passenger.document ?? '')} onChange={(e) => setCustomerPassengersDraft((items) => items.map((item, i) => i === index ? { ...item, document: e.target.value } : item))} maxLength={40} disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">Teléfono<Input value={String(passenger.phone ?? '')} onChange={(e) => setCustomerPassengersDraft((items) => items.map((item, i) => i === index ? { ...item, phone: e.target.value } : item))} maxLength={40} disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">Nacionalidad<Input value={String(passenger.nationality ?? '')} onChange={(e) => setCustomerPassengersDraft((items) => items.map((item, i) => i === index ? { ...item, nationality: e.target.value } : item))} maxLength={80} disabled={savingChanges} /></label>
                    <label className="space-y-1 text-sm">Dieta / alergias<Input value={String(passenger.diet ?? '')} onChange={(e) => setCustomerPassengersDraft((items) => items.map((item, i) => i === index ? { ...item, diet: e.target.value } : item))} maxLength={1000} disabled={savingChanges} /></label>
                  </fieldset>)}
                  <p className="text-xs text-slate-500">Los datos de cliente y acompañantes se guardarán junto con el resto al usar el botón flotante.</p>
                  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={savingChanges} onClick={() => setShowCustomerEditor(false)}>Cancelar edición</Button></div>
                </div> : <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 px-3.5 py-3 sm:col-span-2"><p className="font-semibold text-slate-900">{reserva.customerName || 'Sin nombre'}</p><p className="mt-1 flex items-center gap-1.5 break-all text-sm text-slate-600"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />{reserva.customerEmail || 'Sin email'}</p></div>
                    <div className="rounded-xl bg-slate-50 px-3.5 py-3"><p className="text-xs text-slate-500">Teléfono</p><p className="mt-1 text-sm font-medium text-slate-800">{reserva.customerPhone || 'Sin teléfono'}</p></div>
                    <div className="rounded-xl bg-slate-50 px-3.5 py-3"><p className="text-xs text-slate-500">Datos personales</p><p className="mt-1 text-sm font-medium text-slate-800">{[country ? `${country.flag} ${country.name}` : reserva.customerCountry, reserva.customerDocument ? `DNI ${reserva.customerDocument}` : null, r.customerBirthDate ? `Nac. ${adminDateLabel(r.customerBirthDate)}` : null].filter(Boolean).join(' · ') || 'Sin datos adicionales'}</p></div>
                    {reserva.customerComments && <p className="rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-600 sm:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-500">Comentarios</span>{reserva.customerComments}</p>}
                  </div>
                  {travelers.length > 0 && <div className="mt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Acompañantes · {travelers.length}</p><ul className="grid gap-2 sm:grid-cols-2">{travelers.map((t, i) => <li key={i} className="rounded-xl border border-slate-200 px-3.5 py-3 text-sm"><p className="font-semibold text-slate-900">{`${String(t.firstName ?? '').trim()} ${String(t.lastName ?? '').trim()}`.trim() || `Pasajero ${i + 2}`}</p><p className="mt-1 text-xs leading-5 text-slate-500">{[t.birthDate ? `Nac. ${adminDateLabel(t.birthDate)}` : null, t.document ? `DNI ${String(t.document)}` : null, t.phone ? String(t.phone) : null, t.nationality ? String(t.nationality) : null].filter(Boolean).join(' · ') || 'Sin datos adicionales'}</p>{Boolean(t.diet) && <p className="mt-1 text-xs text-slate-600">Dieta: {String(t.diet)}</p>}</li>)}</ul></div>}
                </>}
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

              <ReservationOperationsPanel
                reservation={reserva}
                value={operationDraft}
                onChange={setOperationDraft}
                onCancel={() => setOperationDraft(operationDraftFrom(reserva))}
                disabled={savingChanges}
              />

              {/* Comprobantes — lista única */}
              <Card className="admin-sale-documents">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-slate-400" />
                    <div><h2 className="text-base font-semibold text-slate-900">Comprobantes · {attachments.length}</h2><p className="mt-1 text-xs text-slate-500">Archivos relacionados con la venta y sus pagos.</p></div>
                  </div>
                </div>
                <AdminFilePicker className="mt-4" label="Adjuntar comprobantes" description="PDF e imágenes" accept={RESERVATION_FILE_ACCEPT} multiple maxFiles={10} busy={uploading} onFilesSelected={uploadFiles} processingLabel="Subiendo comprobantes…" successLabel="Comprobantes adjuntos" showSelectedFiles={false} retryable={false} />
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
            </main>

            {/* Columna lateral */}
            <aside className="admin-sale-side">
              <Card>
                <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-900">Estado de la reserva</h2><p className="mt-1 text-xs text-slate-500">Actualizá la etapa y consultá los cambios anteriores.</p></div><Badge variant={commercialBadge[reserva.status]}>{ventaStatusLabel(reserva.status)}</Badge></div>
                <div className="mt-4 space-y-2.5">
                  <label className="block space-y-1"><span className="text-xs font-medium text-slate-600">Nuevo estado</span>
                  <Select value={status} onValueChange={(v) => setStatus(v as ReservationStatus)} disabled={savingChanges}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{reservationStatusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select></label>
                  <label className="block space-y-1"><span className="text-xs font-medium text-slate-600">Nota del cambio (opcional)</span><Textarea value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder={status === reserva.status ? 'Elegí otro estado para agregar una nota' : 'Agregá contexto para el equipo'} rows={2} disabled={savingChanges || status === reserva.status} /></label>
                  <div className="flex gap-2">
                    {reserva.status !== 'cancelled' && (
                      <Button size="sm" variant="outline" className="text-rose-600 hover:text-rose-700" disabled={busy || savingChanges} onClick={() => setConfirmCancel(true)}>Marcar como cancelada</Button>
                    )}
                    <p className="self-center text-xs text-slate-500">El estado se aplica con el botón flotante.</p>
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historial de estado</p>
                  <ol className="mt-2 space-y-2.5 border-l border-slate-200 pl-3">
                    {(reserva.statusHistory ?? []).slice().sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)).slice(0, 6).map((h, i) => (
                      <li key={i} className="relative text-xs">
                        <span className={`absolute -left-[17px] top-1 h-2 w-2 rounded-full ring-2 ring-white ${h.status === 'completed' ? 'bg-emerald-500' : h.status === 'cancelled' ? 'bg-rose-500' : h.status === 'reserved' ? 'bg-blue-500' : 'bg-slate-300'}`} />
                        <p className="font-medium capitalize text-slate-700">{ventaStatusLabel(h.status)}</p>
                        <p className="text-slate-400">{formatDateTime(h.createdAt)}</p>
                        {h.note && <p className="mt-0.5 text-slate-600">{h.note}</p>}
                      </li>
                    ))}
                    {!(reserva.statusHistory ?? []).length && <p className="text-xs text-slate-400">Todavía no hay cambios de estado registrados.</p>}
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
                  <Button size="sm" variant="outline" className="flex-1" disabled={busy || savingChanges} onClick={() => enqueue('customer')}><ReceiptText className="h-4 w-4" />Voucher</Button>
                  <Button size="sm" variant="outline" className="flex-1" disabled={busy || savingChanges} onClick={() => enqueue('admin')}><Mail className="h-4 w-4" />Admin</Button>
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-900">Vendedor referido</h2>
                  </div>
                  {reserva.referredBy && ['pending', 'accrued', 'paid', 'cancelled'].includes(String(reserva.referredBy.payoutStatus)) && <Badge variant="outline">{{ pending: 'Pendiente', accrued: 'Devengada', paid: 'Pagada', cancelled: 'Cancelada' }[reserva.referredBy.payoutStatus]}</Badge>}
                </div>
                <div className="mt-3 rounded-xl bg-slate-50 p-3.5">
                  {reserva.referredBy ? <><p className="text-sm font-semibold text-slate-900">{String(reserva.referredBy.vendorName ?? '').trim() || 'Vendedor referido'}</p><p className="mt-1 text-xs text-slate-500">Código: <span className="font-mono font-medium text-slate-700">{String(reserva.referredBy.code ?? '').trim() || 'Sin código asociado'}</span></p>
                    {Number.isFinite(Number(reserva.referredBy.commissionAmount)) && <p className="mt-2 text-xs text-slate-600">Comisión calculada: <strong className="text-slate-900">{formatAmount(Number(reserva.referredBy.commissionAmount), String(reserva.referredBy.commissionCurrency || reserva.currency))}</strong>{reserva.referredBy.commissionType === 'percent' && Number.isFinite(Number(reserva.referredBy.commissionValue)) ? ` · ${Number(reserva.referredBy.commissionValue)}%` : ''}</p>}
                  </> : <><p className="text-sm font-medium text-slate-700">Sin vendedor referido asignado</p><p className="mt-1 text-xs text-slate-500">Asigná una persona o agencia y, si corresponde, su código.</p></>}
                </div>
                <div className="mt-4 space-y-3">
                  <label className="block space-y-1"><span className="text-xs font-medium text-slate-600">Vendedor o agencia</span><VendorCombobox value={vendorId} includeId={reserva.referredBy?.vendorId} disabled={savingChanges} onChange={(id) => { setVendorId(id); setPickedCode(''); setManualCode(''); }} /></label>
                  <label className="block space-y-1"><span className="text-xs font-medium text-slate-600">Código asociado</span><Select value={pickedCode || 'none'} onValueChange={(v) => { setPickedCode(v === 'none' ? '' : v); setManualCode(''); }} disabled={!vendorId || linksLoading || savingChanges}>
                    <SelectTrigger><SelectValue placeholder={linksLoading ? 'Cargando códigos…' : 'Seleccioná un código (opcional)'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin código</SelectItem>
                      {reserva.referredBy?.code && !linksForPackage.some((link) => link.code === reserva.referredBy?.code) && <SelectItem value={reserva.referredBy.code}>{reserva.referredBy.code} · actual</SelectItem>}
                      {linksForPackage.map((l) => <SelectItem key={l.id} value={l.code}>{l.code}</SelectItem>)}
                    </SelectContent>
                  </Select></label>
                  <label className="block space-y-1"><span className="text-xs font-medium text-slate-600">O ingresar código manual</span><Input value={manualCode} onChange={(e) => { setManualCode(e.target.value); if (e.target.value.trim()) setPickedCode(''); }} placeholder="Escribí el código" maxLength={60} disabled={savingChanges} /></label>
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">La atribución se guardará con el botón flotante.</p>{reserva.referredBy && <Button size="sm" variant="outline" disabled={savingChanges} onClick={() => { setVendorId(''); setPickedCode(''); setManualCode(''); }}>Quitar atribución</Button>}</div>
                </div>
              </Card>
            </aside>
          </div>
          {hasUnsavedChanges && <div className="admin-sale-savebar" role="region" aria-label="Cambios pendientes">
            <div className="admin-sale-savebar-copy"><span className="admin-sale-dirty-dot" /><div><strong>Cambios sin guardar</strong><span>{dirtySections.join(' · ')}</span></div></div>
            <Button type="button" className="admin-sale-save-button" onClick={() => void saveAllChanges()} disabled={savingChanges}>{savingChanges ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando todo…</> : <><Save className="h-4 w-4" />Guardar cambios</>}</Button>
          </div>}
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
                onClick={(event) => { event.preventDefault(); setConfirmCancel(false); setStatus('cancelled'); setStatusNote('Cancelada desde el panel'); }}
              >
                Cancelar venta
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={!!addonDeleteTarget} onOpenChange={(open) => { if (!open && !savingChanges) setAddonDeleteTarget(null); }}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Quitar este adicional?</AlertDialogTitle>
              <AlertDialogDescription>Se quitará “{addonDeleteTarget?.label}” de la venta y el total se recalculará. La acción quedará registrada en el historial.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={savingChanges}>Volver</AlertDialogCancel>
              <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" disabled={savingChanges} onClick={(event) => { event.preventDefault(); if (addonDeleteTarget) { setPendingAddonRemoval(addonDeleteTarget); setAddonDeleteTarget(null); setShowAddonForm(false); setEditingAddonIndex(null); setAddonTitle(''); setAddonPrice(''); setAddonPickedKey(''); toast.info('La baja quedó pendiente; confirmala con Guardar cambios'); } }}>Marcar para quitar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AdminLayout>
    </ProtectedRoute>
  );
}
