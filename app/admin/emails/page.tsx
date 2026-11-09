'use client';
import { adminDateTimeLabel } from '@/lib/admin/dates';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Mail, RefreshCw, Search, Send } from 'lucide-react';
import { toast } from 'sonner';

type EmailJob = {
  id: string;
  type?: string;
  status?: string;
  to?: string;
  from?: string;
  subject?: string;
  attempts?: number;
  lastError?: string | null;
  reservationId?: string;
  mercadoPagoPaymentId?: string;
  providerMessageId?: string | null;
  sentAt?: string | null;
  nextAttemptAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type ReservationInfo = {
  id: string;
  reservationCode?: string;
  status?: string;
  packageTitle?: string;
  date?: string;
  people?: number;
  amountTotal?: number;
  currency?: string;
  paymentMethod?: string;
  mercadoPagoPaymentId?: string;
  mercadoPagoStatus?: string;
  customerEmail?: string;
  customerName?: string;
  emailDelivery?: any;
};

type ApiConfig = {
  resendConfigured?: boolean;
  from?: string | null;
  adminEmail?: string;
  siteName?: string;
  cronEmailPath?: string;
  cronVoucherHint?: string;
};

const typeLabel = (t?: string) =>
  t === 'cliente_confirmacion_compra'
    ? 'Confirmación'
    : t === 'cliente_voucher_48hs'
      ? 'Voucher 48hs'
      : t === 'admin_aviso'
        ? 'Aviso admin'
        : t === 'cliente_confirmacion'
          ? 'Confirmación (legacy)'
          : t || '—';

const statusBadge = (s?: string) => {
  const v = String(s ?? '').toLowerCase();
  if (v === 'sent') return <Badge variant="default">Enviado</Badge>;
  if (v === 'failed') return <Badge variant="destructive">Fallido</Badge>;
  if (v === 'cancelled') return <Badge variant="outline">Cancelado</Badge>;
  if (v === 'sending') return <Badge variant="secondary">Enviando</Badge>;
  return <Badge variant="outline">Pendiente</Badge>;
};

const formatDateTime = (value?: string | null) => {
  return adminDateTimeLabel(value);
};

export default function AdminEmailsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<EmailJob[]>([]);
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [reservation, setReservation] = useState<ReservationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEmail, setFilterEmail] = useState('');
  const [filterReservation, setFilterReservation] = useState('');
  const [applied, setApplied] = useState({ status: 'all', email: '', reservationId: '' });

  const fetchJobs = useCallback(
    async (opts?: { status?: string; email?: string; reservationId?: string }) => {
      if (!user) return;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams();
        const status = opts?.status ?? applied.status;
        const email = (opts?.email ?? applied.email).trim();
        const reservationId = (opts?.reservationId ?? applied.reservationId).trim();
        if (reservationId) params.set('reservationId', reservationId);
        else {
          if (status && status !== 'all') params.set('status', status);
          if (email) params.set('email', email.toLowerCase());
          params.set('limit', '30');
        }
        const res = await fetch(`/api/admin/emails?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? 'No se pudo consultar');
        setJobs(Array.isArray(payload?.jobs) ? payload.jobs : payload?.job ? [payload.job] : []);
        setConfig(payload?.config ?? null);
        setReservation(payload?.reservation ?? null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo consultar los emails');
      } finally {
        setLoading(false);
      }
    },
    [user, applied]
  );

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const applyFilters = () => {
    const next = { status: filterStatus, email: filterEmail.trim(), reservationId: filterReservation.trim() };
    setApplied(next);
    fetchJobs(next);
  };

  const act = async (jobId: string, action: 'retry' | 'sendNow') => {
    if (!user) return;
    setBusyJobId(jobId);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, jobId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.detail ?? payload?.error ?? 'Falló la acción');
      toast.success(payload?.deferred ? 'Voucher reprogramado según la salida actual' : action === 'sendNow' ? 'Email enviado' : 'Job reencolado para el cron');
      await fetchJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción');
    } finally {
      setBusyJobId(null);
    }
  };

  const counts = useMemo(() => {
    const out = { sent: 0, pending: 0, failed: 0, sending: 0, cancelled: 0 };
    for (const j of jobs) {
      const s = String(j.status ?? '').toLowerCase();
      if (s === 'sent') out.sent += 1;
      else if (s === 'failed') out.failed += 1;
      else if (s === 'sending') out.sending += 1;
      else if (s === 'cancelled') out.cancelled += 1;
      else out.pending += 1;
    }
    return out;
  }, [jobs]);

  return (
    <ProtectedRoute>
      <AdminLayout>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 pb-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Emails</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Logs de confirmaciones de compra y vouchers (colección <span className="font-mono">emailJobs</span>).
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchJobs()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Actualizar
            </Button>
          </div>

          {config && !config.resendConfigured ? (
            <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200/60">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Resend no está configurado (falta RESEND_API_KEY).</p>
                <p className="mt-1 text-rose-700">
                  Ningún email puede salir hasta configurar la API key. Los jobs quedan en pendiente/fallido con el error en el log.
                </p>
              </div>
            </div>
          ) : null}

          {config ? (
            <section className="grid gap-3 rounded-2xl bg-white p-4 text-xs text-slate-500 ring-1 ring-black/5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="font-semibold uppercase tracking-wider text-slate-400">Remitente</p>
                <p className="mt-1 font-mono text-slate-700">{config.from ?? '—'}</p>
              </div>
              <div>
                <p className="font-semibold uppercase tracking-wider text-slate-400">Email admin</p>
                <p className="mt-1 font-mono text-slate-700">{config.adminEmail ?? '—'}</p>
              </div>
              <div>
                <p className="font-semibold uppercase tracking-wider text-slate-400">Cron</p>
                <p className="mt-1 font-mono text-slate-700">{config.cronEmailPath ?? '/api/cron/email'} · cada 5 min</p>
              </div>
              <div>
                <p className="font-semibold uppercase tracking-wider text-slate-400">Resumen</p>
                <p className="mt-1 text-slate-700">
                  {counts.sent} enviados · {counts.pending} pendientes · {counts.failed} fallidos · {counts.cancelled} cancelados
                </p>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Venta (ID de reserva)</Label>
                <Input
                  value={filterReservation}
                  onChange={(e) => setFilterReservation(e.target.value)}
                  placeholder="mp_... u ord_..."
                />
              </div>
              <div className="space-y-1">
                <Label>Destinatario</Label>
                <Input
                  value={filterEmail}
                  onChange={(e) => setFilterEmail(e.target.value)}
                  placeholder="cliente@email.com"
                />
              </div>
              <div className="space-y-1">
                <Label>Estado</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pending">Pendientes</SelectItem>
                    <SelectItem value="failed">Fallidos</SelectItem>
                    <SelectItem value="sent">Enviados</SelectItem>
                    <SelectItem value="sending">Enviando</SelectItem>
                    <SelectItem value="cancelled">Cancelados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={applyFilters} disabled={loading}>
                  <Search className="h-4 w-4" />Buscar
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Tip: pegá el ID de la venta (lo ves en el detalle, tarjeta Sistema) para ver sus 3 jobs: confirmación, voucher 48hs y aviso admin.
            </p>
          </section>

          {reservation ? (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {reservation.packageTitle || 'Venta'}{' '}
                    <span className="font-mono font-normal text-slate-500">{reservation.reservationCode}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {reservation.customerName} · {reservation.customerEmail} · MP {reservation.mercadoPagoPaymentId || '—'} (
                    {reservation.mercadoPagoStatus || '—'})
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/ventas/${reservation.id}`}>Ver venta</Link>
                </Button>
              </div>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
            {loading ? (
              <div className="space-y-2 p-4">
                <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <Mail className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">Sin emails para ese filtro</p>
                <p className="max-w-md text-xs text-slate-500">
                  Si hiciste una compra y no hay ningún job, el webhook/verify-direct nunca creó la reserva (revisá que el
                  pago esté aprobado en Mercado Pago y que el intent exista en <span className="font-mono">checkoutIntents</span>).
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const busy = busyJobId === job.id;
                  return (
                    <li key={job.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {statusBadge(job.status)}
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            {typeLabel(job.type)}
                          </span>
                          {job.attempts ? (
                            <span className="text-xs text-slate-400">· {job.attempts} intentos</span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-slate-900">{job.subject || '(sin asunto)'}</p>
                        <p className="truncate font-mono text-xs text-slate-500">
                          {job.id} → {job.to || '—'}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          act. {formatDateTime(job.updatedAt)}
                          {job.sentAt ? ` · enviado ${formatDateTime(job.sentAt)}` : ''}
                          {job.nextAttemptAt && String(job.status).toLowerCase() !== 'sent'
                            ? ` · próximo intento ${formatDateTime(job.nextAttemptAt)}`
                            : ''}
                          {job.providerMessageId ? ` · id ${job.providerMessageId}` : ''}
                        </p>
                        {job.lastError ? (
                          <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 ring-1 ring-rose-200/60">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="break-all">{job.lastError}</span>
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || String(job.status).toLowerCase() === 'cancelled'}
                          onClick={() => act(job.id, 'retry')}
                          title="Volver a pendiente para que lo envíe el cron"
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                          Reintentar
                        </Button>
                        <Button size="sm" disabled={busy || String(job.status).toLowerCase() === 'cancelled'} onClick={() => act(job.id, 'sendNow')} title="Enviar ahora con Resend">
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Enviar ahora
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex items-start gap-2 rounded-2xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p>
              Cómo leer esto: cada compra aprobada crea hasta 3 jobs (confirmación al cliente, voucher 48hs y aviso al admin).
              <span className="text-white"> Pendiente</span> = esperando al cron de 5 min. <span className="text-white">Fallido</span> =
              Resend rechazó el envío (el motivo exacto está debajo del job — típico: dominio remitente no verificado o API key
              inválida). <span className="text-white">Enviar ahora</span> lo manda en el momento sin esperar al cron.
            </p>
          </section>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
