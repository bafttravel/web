'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Ban, Loader2, Lock, Pencil, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import VendorProtectedRoute from '@/components/vendor/VendorProtectedRoute';
import VendorLayout from '@/components/vendor/VendorLayout';
import { ErrorState, LoadingBlock, PageHeader, Panel, PayoutPill, SourcePill, StatusPill } from '@/components/vendor/parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { fetchVendorReservation, formatDate, formatMoney, vendorFetch, type VendorReservationDetail } from '@/lib/vendor-client';

type Traveler = VendorReservationDetail['passengerDetails'][number];

const ageFrom = (birth: string) => {
  const d = new Date(`${birth}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return Math.max(0, Math.min(120, age));
};

const Field = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="mt-0.5 break-words text-sm text-gray-900">{value || '—'}</dd>
  </div>
);

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [r, setR] = useState<VendorReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customerName: '', customerEmail: '', customerPhone: '', customerDocument: '', customerCountry: '', customerBirthDate: '', customerComments: '' });
  const [travelers, setTravelers] = useState<Traveler[]>([]);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    setError(null);
    try {
      setR(await fetchVendorReservation(user, id));
    } catch (e: any) {
      setError(e.message || 'No pudimos cargar la reserva');
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = () => {
    if (!r) return;
    setForm({
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone ?? '',
      customerDocument: r.customerDocument ?? '',
      customerCountry: r.customerCountry ?? '',
      customerBirthDate: r.customerBirthDate ?? '',
      customerComments: r.customerComments ?? '',
    });
    setTravelers(r.passengerDetails.map((t) => ({ ...t })));
    setEditing(true);
  };

  const save = async () => {
    if (!user || !r) return;
    if (form.customerName.trim().length < 2) return toast.error('Ingresá el nombre del cliente');
    if (!/^\S+@\S+\.\S+$/.test(form.customerEmail.trim())) return toast.error('El email no es válido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.customerBirthDate)) return toast.error('La fecha de nacimiento del cliente es obligatoria');
    for (const [i, t] of travelers.entries()) {
      if (t.firstName.trim().length < 2 || t.lastName.trim().length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(t.birthDate) || t.phone.trim().length < 8 || t.document.trim().length < 3) {
        return toast.error(`Completá los datos del pasajero ${i + 2}`);
      }
    }
    setSaving(true);
    try {
      await vendorFetch(user, '/api/vendor/reservas', {
        method: 'PATCH',
        body: {
          reservationId: r.id,
          action: 'update',
          customerName: form.customerName.trim(),
          customerEmail: form.customerEmail.trim(),
          customerPhone: form.customerPhone.trim() || null,
          customerDocument: form.customerDocument.trim() || null,
          customerCountry: form.customerCountry.trim() || null,
          customerBirthDate: form.customerBirthDate,
          customerComments: form.customerComments.trim() || null,
          passengerDetails: travelers.map((t) => ({
            firstName: t.firstName.trim(),
            lastName: t.lastName.trim(),
            birthDate: t.birthDate,
            age: ageFrom(t.birthDate),
            phone: t.phone.trim(),
            document: t.document.trim(),
            travelerType: t.travelerType ?? null,
          })),
        },
      });
      toast.success('Reserva actualizada');
      setEditing(false);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!user || !r) return;
    setCancelling(true);
    try {
      await vendorFetch(user, '/api/vendor/reservas', { method: 'PATCH', body: { reservationId: r.id, action: 'cancel', note: cancelNote.trim() || undefined } });
      toast.success('Reserva cancelada. El cupo fue liberado.');
      setCancelOpen(false);
      setCancelNote('');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'No se pudo cancelar');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <Panel>
        <LoadingBlock rows={6} />
      </Panel>
    );
  }
  if (error || !r) return <ErrorState message={error ?? 'Reserva no encontrada'} onRetry={load} />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setTraveler = (i: number, k: keyof Traveler, v: string) => setTravelers((list) => list.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));
  const ccy = r.currency;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title={r.customerName || 'Reserva'}
        description={`${r.experienceTitle}${r.reservationCode ? ` · #${r.reservationCode}` : ''}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/vendedor/reservas">
                <ArrowLeft className="h-4 w-4" /> Volver
              </Link>
            </Button>
            {r.canEdit && !editing && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={startEdit}>
                  <Pencil className="h-4 w-4" /> Editar datos
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setCancelOpen(true)}>
                  <Ban className="h-4 w-4" /> Cancelar reserva
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={r.status} />
        <SourcePill source={r.source} />
        <PayoutPill status={r.referredBy.payoutStatus} />
      </div>

      {r.source === 'online' && (
        <div className="flex items-start gap-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Esta venta se realizó online y es de solo lectura. Si necesitás un cambio, contactá al equipo.</p>
        </div>
      )}
      {r.source === 'manual' && !r.canEdit && (
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Las reservas {r.status === 'cancelled' ? 'canceladas' : 'completadas'} no se pueden modificar.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Reserva">
            <dl className="grid gap-4 p-4 sm:grid-cols-3">
              <Field label="Excursión" value={r.experienceTitle} />
              <Field label="Salida" value={formatDate(r.date)} />
              <Field label="Personas" value={r.people} />
              <Field label="Creada" value={formatDate(r.createdAt)} />
              <Field label="Método" value={r.paymentMethod} />
              <Field label="Enlace" value={r.referredBy.code && <span className="font-mono">{r.referredBy.code}</span>} />
            </dl>
          </Panel>

          <Panel title="Cliente" action={editing ? <span className="text-xs text-gray-500">Editando</span> : undefined}>
            {editing ? (
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Nombre completo</Label><Input value={form.customerName} onChange={set('customerName')} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.customerEmail} onChange={set('customerEmail')} /></div>
                <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.customerPhone} onChange={set('customerPhone')} /></div>
                <div className="space-y-1.5"><Label>Documento</Label><Input value={form.customerDocument} onChange={set('customerDocument')} /></div>
                <div className="space-y-1.5"><Label>País</Label><Input value={form.customerCountry} onChange={set('customerCountry')} /></div>
                <div className="space-y-1.5"><Label>Fecha de nacimiento</Label><Input type="date" value={form.customerBirthDate} onChange={set('customerBirthDate')} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label>Comentarios</Label><Textarea rows={3} maxLength={500} value={form.customerComments} onChange={set('customerComments')} /></div>
              </div>
            ) : (
              <dl className="grid gap-4 p-4 sm:grid-cols-3">
                <Field label="Nombre" value={r.customerName} />
                <Field label="Email" value={r.customerEmail} />
                <Field label="Teléfono" value={r.customerPhone} />
                <Field label="Documento" value={r.customerDocument} />
                <Field label="País" value={r.customerCountry} />
                <Field label="Nacimiento" value={formatDate(r.customerBirthDate)} />
                {r.customerComments && <div className="sm:col-span-3"><Field label="Comentarios" value={r.customerComments} /></div>}
              </dl>
            )}
          </Panel>

          {(editing ? travelers : r.passengerDetails).length > 0 && (
            <Panel title="Pasajeros adicionales">
              <div className="divide-y divide-gray-100">
                {(editing ? travelers : r.passengerDetails).map((t, i) =>
                  editing ? (
                    <div key={i} className="grid gap-3 p-4 sm:grid-cols-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:col-span-3">Pasajero {i + 2}</p>
                      <Input placeholder="Nombre" value={t.firstName} onChange={(e) => setTraveler(i, 'firstName', e.target.value)} />
                      <Input placeholder="Apellido" value={t.lastName} onChange={(e) => setTraveler(i, 'lastName', e.target.value)} />
                      <Input type="date" value={t.birthDate} onChange={(e) => setTraveler(i, 'birthDate', e.target.value)} />
                      <Input placeholder="Teléfono" value={t.phone} onChange={(e) => setTraveler(i, 'phone', e.target.value)} />
                      <Input placeholder="Documento" value={t.document} onChange={(e) => setTraveler(i, 'document', e.target.value)} />
                    </div>
                  ) : (
                    <dl key={i} className="grid gap-3 p-4 sm:grid-cols-4">
                      <Field label={`Pasajero ${i + 2}`} value={`${t.firstName} ${t.lastName}`} />
                      <Field label="Nacimiento" value={formatDate(t.birthDate)} />
                      <Field label="Teléfono" value={t.phone} />
                      <Field label="Documento" value={t.document} />
                    </dl>
                  )
                )}
              </div>
            </Panel>
          )}

          {editing && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" className="gap-1.5" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-4 w-4" /> Descartar
              </Button>
              <Button className="gap-1.5" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar cambios
              </Button>
            </div>
          )}

          <Panel title="Historial">
            {r.statusHistory.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">Sin movimientos registrados.</p>
            ) : (
              <ol className="space-y-3 p-4">
                {[...r.statusHistory].reverse().map((h, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-300" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{h.note || 'Cambio de estado'}</p>
                      <p className="text-xs text-gray-500">
                        {formatDate(h.createdAt)} · {h.actor === 'vendor' ? 'Vos' : h.actor === 'system' ? 'Sistema' : 'Equipo'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Importes">
            <dl className="space-y-2 p-4 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Base</dt><dd>{formatMoney(r.baseSubtotalAmount || r.amountTotal - r.extrasTotalAmount, ccy)}</dd></div>
              {r.selectedExtras.map((e, i) => (
                <div key={i} className="flex justify-between"><dt className="truncate pr-2 text-gray-500">{e.label ?? e.code}</dt><dd>{formatMoney(e.amount ?? 0, ccy)}</dd></div>
              ))}
              <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-semibold"><dt>Total</dt><dd>{formatMoney(r.amountTotal, ccy)}</dd></div>
            </dl>
          </Panel>

          <Panel title="Tu comisión">
            <div className="space-y-1 p-4">
              <p className="text-2xl font-semibold">{formatMoney(r.referredBy.commissionAmount, r.referredBy.commissionCurrency ?? ccy)}</p>
              <p className="text-xs text-gray-500">
                {r.commission.type === 'percent' ? `${r.commission.value}% del total` : r.commission.type === 'fixed' ? 'Monto fijo' : ''}
              </p>
              <div className="pt-2"><PayoutPill status={r.referredBy.payoutStatus} /></div>
            </div>
          </Panel>

          {r.payments.length > 0 && (
            <Panel title="Pagos">
              <ul className="divide-y divide-gray-100">
                {r.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-gray-900">{p.message || p.method || 'Pago'}</p>
                      <p className="text-xs text-gray-500">{formatDate(p.createdAt)}{p.method ? ` · ${p.method}` : ''}</p>
                    </div>
                    <span className="shrink-0 font-medium">{formatMoney(p.amount ?? 0, p.currency ?? ccy)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {r.attachments.length > 0 && (
            <Panel title="Adjuntos">
              <ul className="divide-y divide-gray-100">
                {r.attachments.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-sm">
                    <a className="truncate text-blue-600 hover:underline" href={a.url} target="_blank" rel="noreferrer">{a.name || 'Archivo'}</a>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta reserva?</AlertDialogTitle>
            <AlertDialogDescription>Se marca como cancelada y se anula tu comisión. Queda en el historial y no se puede revertir desde acá.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea placeholder="Motivo (opcional)" rows={2} maxLength={500} value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                cancel();
              }}
            >
              {cancelling ? 'Cancelando…' : 'Cancelar reserva'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function VendorReservaDetailPage() {
  return (
    <VendorProtectedRoute>
      <VendorLayout>
        <Detail />
      </VendorLayout>
    </VendorProtectedRoute>
  );
}
