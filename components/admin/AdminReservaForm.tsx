'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArgentineDateInput } from '@/components/ui/argentine-date-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Receipt, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type {
  ReservationStatus,
  ReservationTravelerDetails,
} from '@/components/landing-reserva/types';
import { fetchAdminVendorLinks, type AdminVendorLink } from '@/lib/admin-vendors-client';
import VendorCombobox from '@/components/admin/VendorCombobox';
import type { DepartureSeat, Paquete, SeatLayoutTemplate } from '@/types';
import { getVendorByEmail } from '@/lib/vendors';
import { getAllPaquetesAdmin } from '@/lib/paquetes';
import { NationalitySelect } from '@/components/ui/nationality-select';
import { PhoneWithPrefixInput } from '@/components/ui/phone-with-prefix-input';
import { DEFAULT_COUNTRY_NAME, applyPhonePrefix, getCountryDialCode } from '@/lib/countries';
import SeatMap from '@/components/seats/SeatMap';
import {
  computeReservationPricing,
  getOperationalDepartureDates,
  getPackageAddonOptions,
  getSeatLayoutExtraOptions,
  resolveDepartureConfig,
  resolveReservationExtraSelections,
} from '@/lib/packages/resolve-departure';
import { Checkbox } from '@/components/ui/checkbox';

type Props = {
  paquetes: Paquete[];
  hideReferral?: boolean;
  hideVendorSelect?: boolean;
  hideStatus?: boolean;
  apiEndpoint?: string;
  successRedirect?: string;
  initialData?: {
    packageId?: string;
    date?: string;
    peopleAdults?: number;
    peopleMinors?: number;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerDocument?: string;
    customerBirthDate?: string;
    customerComments?: string;
    selectedExtraCodes?: string[];
  };
};

type FormState = {
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  customerCountry: string;
  customerDocument: string;
  customerBirthDate: string;
  customerComments: string;
};

const NAME_MIN_LENGTH = 2;

const DEFAULT_FORM_STATE: FormState = {
  customerFirstName: '',
  customerLastName: '',
  customerEmail: '',
  customerPhone: '',
  customerCountry: DEFAULT_COUNTRY_NAME,
  customerDocument: '',
  customerBirthDate: '',
  customerComments: '',
};

type TravelerForm = {
  firstName: string;
  lastName: string;
  age: string;
  birthDate: string;
  phone: string;
  document: string;
};

const EMPTY_TRAVELER: TravelerForm = {
  firstName: '',
  lastName: '',
  age: '',
  birthDate: '',
  phone: '',
  document: '',
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatAmountCents(amount: number, currency: string): string {
  const value = Math.max(0, Number(amount) || 0) / 100;
  if (currency === 'ARS') return `$${value.toLocaleString('es-AR')}`;
  if (currency === 'BRL') return `R$ ${value.toLocaleString('pt-BR')}`;
  if (currency === 'USD') return `USD ${value.toLocaleString('en-US')}`;
  return `${value.toFixed(2)} ${currency}`;
}

type AttachmentPreview = {
  id: string;
  key: string;
  url: string;
  name: string;
  type?: string;
};

const statusOptions: { value: ReservationStatus; label: string }[] = [
  { value: 'reserved', label: 'Reservada' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'completed', label: 'Completada' },
];

export default function AdminReservaForm({ paquetes, hideReferral, hideVendorSelect, hideStatus, apiEndpoint, successRedirect, initialData }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [selectedPackageId, setSelectedPackageId] = useState<string>(
    initialData?.packageId ?? paquetes[0]?.id ?? ''
  );
  const [date, setDate] = useState<string>(initialData?.date ?? 'sin-fecha');
  const [adults, setAdults] = useState<number>(() => {
    const val = initialData?.peopleAdults;
    return typeof val === 'number' && val > 0 ? val : 1;
  });
  const [minors, setMinors] = useState<number>(() => {
    const val = initialData?.peopleMinors;
    return typeof val === 'number' && val > 0 ? val : 0;
  });
  const peopleTotal = useMemo(() => Math.max(0, (Number(adults) || 0) + (Number(minors) || 0)), [adults, minors]);
  const [depositPercentAdults, setDepositPercentAdults] = useState<string>('');
  const [depositPercentMinors, setDepositPercentMinors] = useState<string>('');
  const [form, setForm] = useState<FormState>(() => {
    if (initialData?.customerName) {
      const parts = String(initialData.customerName).trim().split(/\s+/);
      return {
        ...DEFAULT_FORM_STATE,
        customerFirstName: parts[0] ?? '',
        customerLastName: parts.slice(1).join(' ') ?? '',
        customerEmail: initialData.customerEmail ?? '',
        customerPhone: initialData.customerPhone ?? '',
        customerDocument: initialData.customerDocument ?? '',
        customerBirthDate: initialData.customerBirthDate ?? '',
        customerComments: initialData.customerComments ?? '',
      };
    }
    return DEFAULT_FORM_STATE;
  });
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<ReservationStatus>('reserved');
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [vendorId, setVendorId] = useState<string>('');
  const [referralLinks, setReferralLinks] = useState<AdminVendorLink[]>([]);
  const [selectedReferralCode, setSelectedReferralCode] = useState<string>('');
  const [manualReferralCode, setManualReferralCode] = useState<string>('');
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);
  const [seatLoading, setSeatLoading] = useState(false);
  const [seatData, setSeatData] = useState<{ template: SeatLayoutTemplate; seats: DepartureSeat[] } | null>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [selectedExtraCodes, setSelectedExtraCodes] = useState<string[]>(initialData?.selectedExtraCodes ?? []);
  /**
   * Adicionales elegidos (del paquete actual o importados de otras
   * excursiones): se envían como `manualExtras` con precio fijado, así no
   * dependen del catálogo del paquete destino.
   */
  const [manualExtras, setManualExtras] = useState<
    Array<{ key: string; title: string; price: number; packageTitle?: string }>
  >([]);
  const [showAddonCatalog, setShowAddonCatalog] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [addonCatalog, setAddonCatalog] = useState<
    Array<{ packageId: string; packageTitle: string; addon: { id: string; title: string; description: string; price: number } }>
  >([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [passengerDetails, setPassengerDetails] = useState<TravelerForm[]>([]);

  const selectedPaquete = useMemo(
    () => paquetes.find((item) => item.id === selectedPackageId) ?? null,
    [paquetes, selectedPackageId]
  );

  useEffect(() => {
    if (paquetes.length > 0 && !selectedPackageId) {
      setSelectedPackageId(paquetes[0].id);
    }
  }, [paquetes, selectedPackageId]);

  useEffect(() => {
    if (hideReferral || hideVendorSelect) return;
    let cancelled = false;
    const loadLinks = async () => {
      if (!vendorId) {
        setReferralLinks([]);
        return;
      }
      try {
        const links = await fetchAdminVendorLinks(vendorId);
        if (!cancelled) setReferralLinks(links);
      } catch {
        setReferralLinks([]);
      }
    };
    loadLinks();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const referralLinksForPackage = useMemo(() => {
    const packageId = String(selectedPaquete?.id ?? '').trim();
    if (!packageId) return referralLinks;
    return referralLinks.filter((link) => {
      const linkPackageId = String(link.packageId ?? link.experienceId ?? '').trim();
      return !linkPackageId || linkPackageId === packageId;
    });
  }, [referralLinks, selectedPaquete?.id]);

  useEffect(() => {
    if (!vendorId) {
      setSelectedReferralCode('');
      return;
    }
    if (!selectedReferralCode) return;
    const exists = referralLinksForPackage.some((link) => link.code === selectedReferralCode);
    if (!exists) setSelectedReferralCode('');
  }, [referralLinksForPackage, selectedReferralCode, vendorId]);

  // Asignación automática de vendor en modo vendedor (hideVendorSelect)
  useEffect(() => {
    if (!hideVendorSelect || !user || !user.email || vendorId) return;
    const load = async () => {
      try {
        const email = user.email;
        if (!email) return;
        const vendor = await getVendorByEmail(email);
        if (vendor) setVendorId(vendor.id);
      } catch {
        // ignore
      }
    };
    load();
  }, [hideVendorSelect, user, vendorId]);

  const dateOptions = useMemo<string[]>(() => {
    if (!selectedPaquete) return [];
    return getOperationalDepartureDates(selectedPaquete);
  }, [selectedPaquete]);

  useEffect(() => {
    if (dateOptions.length > 0) {
      setDate((prev) => (dateOptions.includes(prev) ? prev : dateOptions[0]));
      return;
    }
    if (date !== 'sin-fecha') setDate('sin-fecha');
  }, [dateOptions]);

  const handleFormChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleNationalityChange = (countryName: string) => {
    setForm((prev) => ({
      ...prev,
      customerCountry: countryName,
      customerPhone: applyPhonePrefix(prev.customerPhone, getCountryDialCode(countryName)),
    }));
  };

  const selectedDialCode = getCountryDialCode(form.customerCountry) || '+54';

  const formattedDateLabel = useMemo(() => {
    if (!date || date === 'sin-fecha') return 'Sin fecha específica';
    try {
      return new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return date;
    }
  }, [date]);

  const resolvedSelectedDeparture = useMemo(() => {
    if (!selectedPaquete) return null;
    return resolveDepartureConfig(selectedPaquete, date);
  }, [selectedPaquete, date]);
  const currency = String(resolvedSelectedDeparture?.displayCurrency ?? selectedPaquete?.moneda ?? 'ARS').toUpperCase();

  // Al cambiar de paquete se descartan los adicionales propios (sus ids no
  // existen en el otro), pero se conservan los importados del catálogo.
  useEffect(() => {
    setManualExtras((prev) => prev.filter((item) => item.key.startsWith('catalog:')));
  }, [selectedPackageId]);

  // Catálogo de adicionales de TODAS las excursiones (para importar desde
  // otras). Se carga bajo demanda al abrir el buscador. Precio en unidades.
  useEffect(() => {
    if (!showAddonCatalog) return;
    let cancelled = false;
    setLoadingCatalog(true);
    getAllPaquetesAdmin()
      .then((all) => {
        if (cancelled) return;
        const entries: Array<{
          packageId: string;
          packageTitle: string;
          addon: { id: string; title: string; description: string; price: number };
        }> = [];
        for (const pkg of all) {
          if (!pkg || pkg.id === selectedPackageId) continue;
          const options = getPackageAddonOptions(pkg as any);
          for (const option of options) {
            entries.push({
              packageId: pkg.id,
              packageTitle: String(pkg.titulo ?? 'Sin título'),
              addon: { id: option.id, title: option.title, description: option.description, price: option.price },
            });
          }
        }
        entries.sort((a, b) =>
          a.packageTitle.localeCompare(b.packageTitle, 'es') || a.addon.title.localeCompare(b.addon.title, 'es')
        );
        setAddonCatalog(entries);
      })
      .catch(() => {
        if (!cancelled) toast.error('No pudimos cargar los adicionales.');
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showAddonCatalog, selectedPackageId]);

  const filteredCatalog = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase();
    if (!query) return addonCatalog;
    return addonCatalog.filter(
      (entry) =>
        entry.addon.title.toLowerCase().includes(query) ||
        entry.packageTitle.toLowerCase().includes(query)
    );
  }, [addonCatalog, catalogQuery]);

  const selectedExtras = useMemo(() => {
    if (!selectedPaquete) return [];
    return resolveReservationExtraSelections({
      paquete: selectedPaquete,
      selectedExtraCodes,
      manualExtras: manualExtras.map((item) => ({ label: item.title, amount: item.price })),
      seatLayoutTemplate: seatData?.template ?? null,
    });
  }, [seatData?.template, manualExtras, selectedExtraCodes, selectedPaquete]);
  const packageAddonOptions = useMemo(
    () => (selectedPaquete ? getPackageAddonOptions(selectedPaquete) : []),
    [selectedPaquete]
  );
  const seatExtraOptions = useMemo(
    () => getSeatLayoutExtraOptions(seatData?.template ?? null),
    [seatData?.template]
  );
  const computedPricing = useMemo(() => {
    if (!selectedPaquete) return null;
    const dpAdults = depositPercentAdults.trim() ? Number(depositPercentAdults) : NaN;
    const dpMinors = depositPercentMinors.trim() ? Number(depositPercentMinors) : NaN;
    return computeReservationPricing(selectedPaquete, date, {
      peopleAdults: Math.max(0, Number(adults) || 0),
      peopleMinors: Math.max(0, Number(minors) || 0),
      depositPercentAdults: Number.isFinite(dpAdults) ? dpAdults : null,
      depositPercentMinors: Number.isFinite(dpMinors) ? dpMinors : null,
      selectedExtras,
    });
  }, [adults, date, depositPercentAdults, depositPercentMinors, minors, selectedExtras, selectedPaquete]);
  const amountTotal = useMemo(() => computedPricing?.subtotalAmount ?? 0, [computedPricing]);
  const amountLabel = useMemo(() => {
    const value = amountTotal / 100;
    if (currency === 'ARS') return `$${value.toLocaleString('es-AR')}`;
    if (currency === 'BRL') return `R$ ${value.toLocaleString('pt-BR')}`;
    if (currency === 'USD') return `USD ${value.toLocaleString('en-US')}`;
    return `${value.toFixed(2)} ${currency}`;
  }, [amountTotal, currency]);

  const salida = useMemo(() => {
    if (!selectedPaquete || !date || date === 'sin-fecha') return null;
    return (selectedPaquete.salidas ?? []).find((s) => s.fecha === date) ?? null;
  }, [selectedPaquete, date]);

  const seatsEnabled = false;

  useEffect(() => {
    setSelectedSeatIds((prev) => prev.slice(0, Math.max(0, peopleTotal)));
  }, [peopleTotal]);

  useEffect(() => {
    setPassengerDetails((prev) => {
      const needed = Math.max(0, peopleTotal - 1);
      if (prev.length === needed) return prev;
      return Array.from({ length: needed }, (_, index) => prev[index] ?? { ...EMPTY_TRAVELER });
    });
  }, [peopleTotal]);

  useEffect(() => {
    const validCodes = new Set(seatExtraOptions.map((item) => item.code));
    setSelectedExtraCodes((prev) => prev.filter((code) => validCodes.has(code as any)));
  }, [seatExtraOptions]);

  const fetchSeatMap = async () => {
    if (!user || !selectedPaquete?.id || !date || date === 'sin-fecha' || !seatsEnabled) return;
    setSeatLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/seats?packageId=${encodeURIComponent(selectedPaquete.id)}&date=${encodeURIComponent(date)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || 'No se pudo cargar el mapa de butacas');
      }
      const json = await res.json();
      if (!json?.enabled) {
        setSeatData(null);
        setSelectedSeatIds([]);
        return;
      }
      setSeatData({ template: json.template, seats: json.seats });
    } catch {
      setSeatData(null);
    } finally {
      setSeatLoading(false);
    }
  };

  useEffect(() => {
    setSeatData(null);
    setSelectedSeatIds([]);
    if (seatsEnabled) void fetchSeatMap();
  }, [seatsEnabled, selectedPaquete?.id, date, user]);

  const seatLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of seatData?.seats ?? []) map.set(String(s.seatId), String(s.label));
    return map;
  }, [seatData?.seats]);

  const selectedSeatLabels = useMemo(() => {
    return selectedSeatIds.map((id) => seatLabelById.get(id) || id).filter(Boolean);
  }, [selectedSeatIds, seatLabelById]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    setUploadingFiles(true);
    const uploaded: AttachmentPreview[] = [];
    for (const file of Array.from(files)) {
      const formData = new FormData();
      const key = `reservas/${crypto.randomUUID()}-${file.name}`;
      formData.append('file', file);
      formData.append('key', key);
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          const error = await response.json().catch(() => null);
          toast.error('No se pudo subir el archivo', {
            description: error?.error ?? 'Reintentá con otro archivo',
          });
          continue;
        }
        const data = await response.json();
        uploaded.push({
          id: crypto.randomUUID(),
          key: data.key,
          url: data.url,
          name: file.name,
          type: file.type,
        });
      } catch (error) {
        console.error('[AdminReservaForm] Upload error:', error);
        toast.error('Error subiendo archivo');
      }
    }
    setAttachments((prev) => [...prev, ...uploaded]);
    setUploadingFiles(false);
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleRemoveAttachment = async (attachment: AttachmentPreview) => {
    try {
      await fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: attachment.key }),
      });
    } catch (error) {
      console.error('[AdminReservaForm] Error deleting blob:', error);
      toast.error('No pudimos eliminar el archivo');
      return;
    }
    setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
  };

  const sanitizedPassengerDetails = useMemo<ReservationTravelerDetails[]>(
    () =>
      passengerDetails.map((traveler) => {
        const age = Math.max(0, Math.min(120, Number(traveler.age) || 0));
        return {
          firstName: traveler.firstName.trim(),
          lastName: traveler.lastName.trim(),
          age,
          birthDate: traveler.birthDate.trim(),
          phone: traveler.phone.trim(),
          document: traveler.document.trim(),
          travelerType: age < 18 ? 'minor' : 'adult',
        };
      }),
    [passengerDetails]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPaquete) {
      toast.error('Seleccioná un paquete antes de continuar');
      return;
    }
    if (!user) {
      toast.error('Debes iniciar sesión para crear la reserva');
      return;
    }
    if (!form.customerEmail || !form.customerFirstName.trim() || !form.customerLastName.trim()) {
      toast.error('Completa nombre, apellido y email del titular');
      return;
    }
    if (
      form.customerFirstName.trim().length < NAME_MIN_LENGTH ||
      form.customerLastName.trim().length < NAME_MIN_LENGTH
    ) {
      toast.error('Nombre y apellido deben tener al menos 2 caracteres');
      return;
    }
    if (!DATE_REGEX.test(form.customerBirthDate.trim())) {
      toast.error('Completa la fecha de nacimiento del titular');
      return;
    }
    if (peopleTotal < 1) {
      toast.error('La reserva debe incluir al menos una persona');
      return;
    }
    if (seatsEnabled && selectedSeatIds.length !== peopleTotal) {
      toast.error('Debés seleccionar una butaca por pasajero');
      return;
    }
    if (sanitizedPassengerDetails.some((traveler) => {
      const fullNameOk = traveler.firstName.length >= 2 && traveler.lastName.length >= 2;
      const birthDateOk = DATE_REGEX.test(traveler.birthDate);
      const phoneOk = traveler.phone.length >= 8;
      const documentOk = traveler.document.length >= 3;
      return !fullNameOk || !birthDateOk || !phoneOk || !documentOk;
    })) {
      toast.error('Completa los datos de todos los pasajeros');
      return;
    }

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(apiEndpoint || '/api/admin/reservas', {
        method: initialData ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageId: selectedPaquete.id,
          date,
          peopleAdults: Math.max(0, Number(adults) || 0),
          peopleMinors: Math.max(0, Number(minors) || 0),
          ...(!hideStatus ? { status } : {}),
          customerEmail: form.customerEmail,
          customerName: `${form.customerFirstName.trim()} ${form.customerLastName.trim()}`.trim(),
          customerPhone: form.customerPhone || undefined,
          customerCountry: form.customerCountry || undefined,
          customerDocument: form.customerDocument || undefined,
          customerBirthDate: form.customerBirthDate || undefined,
          customerComments: form.customerComments || undefined,
          passengerDetails: sanitizedPassengerDetails,
          ...(depositPercentAdults.trim() ? { depositPercentAdults: Number(depositPercentAdults) } : {}),
          ...(depositPercentMinors.trim() ? { depositPercentMinors: Number(depositPercentMinors) } : {}),
          ...(selectedExtraCodes.length ? { selectedExtraCodes } : {}),
          ...(manualExtras.length
            ? {
                manualExtras: manualExtras.map((item) => ({
                  title: item.title,
                  price: Math.max(0, Number(item.price) || 0),
                })),
              }
            : {}),
          ...(seatsEnabled ? { selectedSeats: selectedSeatLabels } : {}),
          ...(attachments.length > 0
            ? {
                attachments: attachments.map((item) => ({
                  key: item.key,
                  url: item.url,
                  name: item.name,
                  type: item.type,
                  uploadedBy: hideVendorSelect ? 'vendor' : 'admin',
                })),
              }
            : {}),
          ...(vendorId ? { vendorId } : {}),
          ...(!hideReferral && (manualReferralCode.trim()
            ? { referralCode: manualReferralCode.trim() }
            : selectedReferralCode.trim()
              ? { referralCode: selectedReferralCode.trim() }
              : {})),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const detailMessage = errorData?.detail ? `${errorData.error} (${errorData.detail})` : (errorData?.error ?? 'No se pudo crear la reserva');
        throw new Error(detailMessage);
      }

      const payload = await response.json();
      toast.success('Reserva creada exitosamente');
      router.push(successRedirect ? successRedirect.replace(':id', payload.id) : `/admin/ventas/${payload.id}`);
    } catch (error) {
      console.error('[AdminReservaForm] Error creando reserva:', error);
      toast.error(error instanceof Error && error.message ? error.message : 'No pudimos crear la reserva, revisá los datos e intentá otra vez');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-black/5 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
            Ventas · Nueva venta manual
          </p>
          <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.02em] text-gray-900">Crear reserva manual</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Cargá el paquete, el titular y los pasajeros. Los comentarios y los comprobantes son opcionales.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0 rounded-full text-sm font-medium">
          <Link href="/admin/ventas">Ver ventas existentes</Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="bg-white shadow-sm ring-1 ring-black/5">
          <CardContent className="p-5 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-7">
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">01 · Reserva</span>
                  <div className="h-px flex-1 bg-gray-100" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Paquete</Label>
                    <Select
                      value={selectedPackageId}
                      onValueChange={(value) => setSelectedPackageId(value)}
                    >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccioná un paquete" />
                    </SelectTrigger>
                    <SelectContent>
                      {paquetes.map((pkg) => (
                        <SelectItem key={pkg.id} value={pkg.id}>
                          {pkg.titulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Estado</Label>
                  {!hideStatus && (
                    <Select value={status} onValueChange={(value) => setStatus(value as ReservationStatus)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Fecha / salida</Label>
                  {dateOptions.length > 0 ? (
                    <Select value={date} onValueChange={(value) => setDate(value)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccioná una fecha" />
                      </SelectTrigger>
                      <SelectContent>
                        {dateOptions.map((slot) => (
                          <SelectItem key={slot} value={slot}>
                            {slot}
                          </SelectItem>
                        ))}
                        <SelectItem value="sin-fecha">Sin fecha específica</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type="date"
                      value={date === 'sin-fecha' ? '' : date}
                      onChange={(event) => setDate(event.target.value || 'sin-fecha')}
                    />
                  )}
                  <p className="text-xs capitalize text-gray-500">{formattedDateLabel}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Pasajeros</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Adultos</Label>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        value={adults}
                        onChange={(e) => setAdults(parseInt(e.target.value || '0', 10))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Menores</Label>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        value={minors}
                        onChange={(e) => setMinors(parseInt(e.target.value || '0', 10))}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Máximo por reserva:{' '}
                    {selectedPaquete?.bookingConfig?.maxPeoplePerBooking ?? selectedPaquete?.capacidadMaxima ?? 50}
                  </p>
                </div>
              </div>

              {selectedPaquete?.reservationPricing?.mode === 'percent' ? (
                <div className="grid gap-3 rounded-2xl bg-gray-50 p-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Adultos (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={depositPercentAdults}
                      onChange={(e) => setDepositPercentAdults(e.target.value)}
                      placeholder="Auto"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Menores (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={depositPercentMinors}
                      onChange={(e) => setDepositPercentMinors(e.target.value)}
                      placeholder="Auto"
                    />
                  </div>
                </div>
              ) : null}

              {packageAddonOptions.length > 0 ? (
                <div className="rounded-2xl bg-gray-50 p-4">
                  <Label className="text-xs text-gray-600">Adicionales del paquete</Label>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Se cobran una sola vez por reserva, no por persona.
                  </p>
                  <div className="mt-3 space-y-2">
                    {packageAddonOptions.map((addon) => {
                      const key = `pkg:${selectedPackageId}:${addon.id}`;
                      const checked = manualExtras.some((item) => item.key === key);
                      return (
                        <label
                          key={addon.id}
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition ${
                            checked ? 'border-neutral-300 bg-white' : 'border-transparent bg-white'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) =>
                                setManualExtras((prev) =>
                                  next
                                    ? [
                                        ...prev,
                                        {
                                          key,
                                          title: addon.title,
                                          price: Math.max(0, Number(addon.price) || 0),
                                        },
                                      ]
                                    : prev.filter((item) => item.key !== key)
                                )
                              }
                              disabled={submitting}
                              aria-label={addon.title}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-gray-900">{addon.title}</span>
                              {addon.description ? (
                                <span className="block truncate text-xs text-gray-500">{addon.description}</span>
                              ) : null}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                            ${Math.max(0, Number(addon.price) || 0).toLocaleString('es-AR')}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className={hideVendorSelect ? 'hidden' : 'rounded-2xl bg-gray-50 p-4'}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-xs text-gray-600">Adicionales de otras excursiones</Label>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Traé un adicional creado para otra excursión sin salir de acá.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={submitting || loadingCatalog}
                    onClick={() => setShowAddonCatalog((prev) => !prev)}
                  >
                    {showAddonCatalog ? 'Ocultar' : loadingCatalog ? 'Cargando…' : 'Buscar'}
                  </Button>
                </div>
                {manualExtras.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    {manualExtras
                      .filter((item) => item.key.startsWith('catalog:'))
                      .map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-gray-900">{item.title}</span>
                            <span className="block truncate text-xs text-gray-500">{item.packageTitle}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums text-gray-900">
                              ${item.price.toLocaleString('es-AR')}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={submitting}
                              onClick={() => setManualExtras((prev) => prev.filter((row) => row.key !== item.key))}
                              aria-label={`Quitar ${item.title}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        </div>
                      ))}
                  </div>
                ) : null}
                {showAddonCatalog ? (
                  <div className="mt-3">
                    <Input
                      value={catalogQuery}
                      onChange={(event) => setCatalogQuery(event.target.value)}
                      placeholder="Buscar por adicional o excursión…"
                      disabled={submitting}
                    />
                    <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-0.5">
                      {filteredCatalog.length === 0 ? (
                        <p className="rounded-xl bg-white px-3 py-2.5 text-xs text-gray-500">
                          {loadingCatalog
                            ? 'Cargando catálogo…'
                            : 'Sin resultados. Ninguna otra excursión tiene adicionales que coincidan.'}
                        </p>
                      ) : (
                        filteredCatalog.slice(0, 30).map((entry) => {
                          const key = `catalog:${entry.packageId}:${entry.addon.id}`;
                          const added = manualExtras.some((item) => item.key === key);
                          return (
                            <div
                              key={key}
                              className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/[0.04]"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-gray-900">{entry.addon.title}</span>
                                <span className="block truncate text-xs text-gray-500">{entry.packageTitle}</span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <span className="text-sm font-semibold tabular-nums text-gray-900">
                                  ${entry.addon.price.toLocaleString('es-AR')}
                                </span>
                                <Button
                                  type="button"
                                  variant={added ? 'outline' : 'default'}
                                  size="sm"
                                  disabled={submitting || added}
                                  onClick={() =>
                                    setManualExtras((prev) =>
                                      added
                                        ? prev
                                        : [
                                            ...prev,
                                            {
                                              key,
                                              title: entry.addon.title,
                                              price: entry.addon.price,
                                              packageTitle: entry.packageTitle,
                                            },
                                          ]
                                    )
                                  }
                                >
                                  {added ? 'Sumado' : 'Sumar'}
                                </Button>
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {seatsEnabled && date !== 'sin-fecha' ? (
              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Butacas</div>
                    <div className="text-xs text-gray-600">
                      Seleccionadas: <span className="font-semibold text-gray-900">{selectedSeatLabels.length}</span> / {peopleTotal}
                    </div>
                    {selectedSeatLabels.length > 0 ? (
                      <div className="mt-1 text-xs text-gray-600">{selectedSeatLabels.join(', ')}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={seatLoading || submitting}
                      onClick={() => {
                        setSeatDialogOpen(true);
                        if (!seatData) void fetchSeatMap();
                      }}
                    >
                      Elegir butacas
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={seatLoading || submitting}
                      onClick={() => setSelectedSeatIds([])}
                    >
                      Limpiar
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">02 · Titular</span>
                  <div className="h-px flex-1 bg-gray-100" />
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Nombre *</Label>
                    <Input
                      required
                      value={form.customerFirstName}
                      onChange={(event) => handleFormChange('customerFirstName', event.target.value)}
                      placeholder="Ej: Juan"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Apellido *</Label>
                    <Input
                      required
                      value={form.customerLastName}
                      onChange={(event) => handleFormChange('customerLastName', event.target.value)}
                      placeholder="Ej: Garcia"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5 md:col-span-1">
                    <Label>Email *</Label>
                    <Input
                      required
                      type="email"
                      value={form.customerEmail}
                      onChange={(event) => handleFormChange('customerEmail', event.target.value)}
                      placeholder="tu@email.com"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Nacionalidad</Label>
                    <NationalitySelect
                      value={form.customerCountry || DEFAULT_COUNTRY_NAME}
                      onChange={handleNationalityChange}
                      placeholder="Seleccioná la nacionalidad"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>WhatsApp</Label>
                    <PhoneWithPrefixInput
                      value={form.customerPhone}
                      dialCode={selectedDialCode}
                      onValueChange={(next) => handleFormChange('customerPhone', next)}
                      placeholder="11 ..."
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>DNI / Pasaporte</Label>
                    <Input
                      value={form.customerDocument}
                      onChange={(event) => handleFormChange('customerDocument', event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fecha de nacimiento</Label>
                    <ArgentineDateInput
                      value={form.customerBirthDate}
                      onChange={(value) => handleFormChange('customerBirthDate', value)}
                    />
                  </div>
                </div>
              </section>

              {!hideReferral && !hideVendorSelect && (
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">03 · Referidos (opcional)</span>
                    <div className="h-px flex-1 bg-gray-100" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                  <VendorCombobox
                    value={vendorId}
                    onChange={(id) => {
                      setVendorId(id);
                      setSelectedReferralCode('');
                      setManualReferralCode('');
                    }}
                  />
                    </div>
                    <div className="space-y-1">
                      <Select
                        value={selectedReferralCode || 'none'}
                        onValueChange={(value) => {
                          setSelectedReferralCode(value === 'none' ? '' : value);
                          setManualReferralCode('');
                        }}
                        disabled={!vendorId || referralLinksForPackage.length === 0}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Elegí un código del vendedor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin código</SelectItem>
                          {referralLinksForPackage.length === 0 ? (
                      <SelectItem value="__no_codes__" disabled>
                            Sin códigos disponibles
                          </SelectItem>
                          ) : (
                            referralLinksForPackage.map((l) => (
                              <SelectItem key={l.id} value={l.code}>
                                {l.code} {l.experienceName ? `· ${l.experienceName}` : ''}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Input
                        placeholder="o ingresá un código manual"
                        value={manualReferralCode}
                        onChange={(e) => {
                          setManualReferralCode(e.target.value);
                          if (e.target.value.trim()) setSelectedReferralCode('');
                        }}
                      />
                    </div>
                  </div>
                </section>
              )}

              {passengerDetails.length > 0 ? (
                <section className="space-y-3 rounded-2xl bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">04 · Pasajeros adicionales</span>
                    <div className="h-px flex-1 bg-gray-100" />
                  </div>
                  <div className="space-y-3">
                    {passengerDetails.map((traveler, index) => (
                      <div key={`traveler-${index}`} className="rounded-2xl border border-gray-200 bg-white p-4">
                        <p className="text-sm font-semibold text-gray-900">Pasajero {index + 2}</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-600">Nombre</Label>
                            <Input
                              value={traveler.firstName}
                              onChange={(event) =>
                                setPassengerDetails((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, firstName: event.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-600">Apellido</Label>
                            <Input
                              value={traveler.lastName}
                              onChange={(event) =>
                                setPassengerDetails((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, lastName: event.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-600">Edad</Label>
                            <Input
                              type="number"
                              min={0}
                              max={120}
                              value={traveler.age}
                              onChange={(event) =>
                                setPassengerDetails((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, age: event.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-600">Fecha de nacimiento</Label>
                            <ArgentineDateInput
                              value={traveler.birthDate}
                              onChange={(value) =>
                                setPassengerDetails((prev) =>
                                  prev.map((item, itemIndex) => (itemIndex === index ? { ...item, birthDate: value } : item))
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-600">Teléfono</Label>
                            <Input
                              value={traveler.phone}
                              onChange={(event) =>
                                setPassengerDetails((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, phone: event.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-600">Documento</Label>
                            <Input
                              value={traveler.document}
                              onChange={(event) =>
                                setPassengerDetails((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, document: event.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                     ))}
                  </div>
                </section>
              ) : null}

              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">05 · Notas y comprobantes (opcional)</span>
                  <div className="h-px flex-1 bg-gray-100" />
                </div>

                <div className="space-y-1.5">
                  <Label>Comentarios del cliente</Label>
                  <Textarea
                    value={form.customerComments}
                    onChange={(event) => handleFormChange('customerComments', event.target.value)}
                    placeholder="Anotá condiciones especiales, requerimientos o cualquier observación"
                    className="min-h-[100px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Comprobantes y archivos</Label>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" className="rounded-full px-4" asChild>
                      <label className="cursor-pointer">
                        {uploadingFiles ? 'Subiendo...' : 'Subir archivos'}
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </Button>
                    {uploadingFiles && <span className="text-xs text-gray-500">Procesando archivos...</span>}
                  </div>
                  {attachments.length > 0 ? (
                    <div className="space-y-2 rounded-2xl border border-dashed border-gray-200 bg-white p-3">
                      {attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900">{attachment.name}</p>
                            <p className="text-xs text-gray-500">{attachment.type || 'Archivo adjunto'}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveAttachment(attachment)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">Aún no cargaste comprobantes.</p>
                  )}
                </div>
              </section>

              <div className="space-y-3">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="group h-12 w-full rounded-full bg-neutral-900 text-[15px] font-semibold tracking-[-0.01em] text-white transition-all duration-300 hover:bg-neutral-700 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando reserva
                    </>
                  ) : (
                    'Crear reserva'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="lg:sticky lg:top-6 lg:self-start">
        <Card className="bg-white shadow-sm ring-1 ring-black/5">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-[15px] font-semibold text-gray-900">Resumen</CardTitle>
            <p className="text-xs text-gray-400">Datos que se van a guardar en la venta.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
              <div className="px-4 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Paquete</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-gray-900">
                  {selectedPaquete?.titulo ?? '—'}
                </p>
              </div>
              <div className="px-4 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Fecha</p>
                <p className="mt-0.5 text-sm font-medium capitalize text-gray-900">{formattedDateLabel}</p>
              </div>
              <div className="px-4 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Pasajeros</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">{peopleTotal}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
                <Receipt className="h-3.5 w-3.5" />
                Precio
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <p className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">
                    Subtotal · {peopleTotal} {peopleTotal === 1 ? 'pasajero' : 'pasajeros'}
                  </span>
                  <span className="font-semibold tabular-nums text-gray-900">
                    {computedPricing ? formatAmountCents(computedPricing.baseSubtotalAmount, currency) : '—'}
                  </span>
                </p>
                {selectedExtras.map((extra, index) => (
                  <p key={`${extra.code}-${extra.source ?? index}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-gray-500">+ {extra.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                      {formatAmountCents(
                        String(extra.scope) === 'per_booking' ? extra.amount : extra.amount * Math.max(1, peopleTotal),
                        currency
                      )}
                    </span>
                  </p>
                ))}
                {computedPricing && computedPricing.extrasTotalAmount > 0 ? (
                  <p className="flex items-center justify-between gap-3 border-t border-gray-200 pt-2">
                    <span className="text-gray-500">Extras totales</span>
                    <span className="font-semibold tabular-nums text-gray-900">
                      {formatAmountCents(computedPricing.extrasTotalAmount, currency)}
                    </span>
                  </p>
                ) : null}
                <p className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2.5">
                  <span className="text-sm font-bold text-gray-900">Total</span>
                  <span className="text-[22px] font-black tabular-nums tracking-[-0.02em] text-gray-900">
                    {peopleTotal > 0 ? amountLabel : '—'}
                  </span>
                </p>
              </div>
            </div>

            <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
              <div className="px-4 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Cliente</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">
                  {`${form.customerFirstName} ${form.customerLastName}`.trim() || '—'}
                </p>
                <p className="text-xs text-gray-500">{form.customerEmail || '—'}</p>
                <p className="text-xs text-gray-500">
                  {form.customerPhone ? `WhatsApp ${form.customerPhone}` : 'Sin teléfono'}
                  {' · '}
                  Nacimiento: {form.customerBirthDate || '—'}
                </p>
              </div>
              {form.customerComments.trim() ? (
                <div className="px-4 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Comentarios</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-gray-600">{form.customerComments}</p>
                </div>
              ) : null}
              <div className="px-4 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Comprobantes</p>
                {attachments.length > 0 ? (
                  <ul className="mt-0.5 space-y-0.5 text-sm text-gray-600">
                    {attachments.map((attachment) => (
                      <li key={attachment.id} className="truncate">
                        {attachment.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-xs text-gray-500">Aún no cargaste comprobantes.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>

      <Dialog open={seatDialogOpen} onOpenChange={(open) => setSeatDialogOpen(open)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0 sm:max-w-4xl md:w-full md:max-w-5xl">
          <div className="flex max-h-[85vh] flex-col">
            <div className="border-b border-gray-200 px-6 py-4">
              <DialogHeader className="gap-1">
                <DialogTitle>Selección de butacas</DialogTitle>
                <div className="text-sm text-gray-500">
                  Seleccioná <span className="font-semibold text-gray-900">{peopleTotal}</span> butaca{peopleTotal === 1 ? '' : 's'} · Elegidas:{' '}
                  <span className="font-semibold text-gray-900">{selectedSeatIds.length}</span> / {peopleTotal}
                </div>
              </DialogHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {seatLoading ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando mapa…
                  </div>
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 w-40 rounded bg-gray-200" />
                    <div className="h-[320px] w-full rounded-3xl bg-gray-100" />
                    <div className="h-4 w-56 rounded bg-gray-200" />
                  </div>
                </div>
              ) : seatData ? (
                <SeatMap
                  template={seatData.template}
                  seats={seatData.seats}
                  selectedSeatIds={selectedSeatIds}
                  maxSelectable={peopleTotal}
                  onChangeSelected={setSelectedSeatIds}
                />
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  No hay mapa de butacas disponible para esta salida.
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 bg-white px-6 py-4">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setSeatDialogOpen(false)}>
                  Cerrar
                </Button>
                <Button type="button" disabled={selectedSeatIds.length !== peopleTotal} onClick={() => setSeatDialogOpen(false)}>
                  Confirmar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
