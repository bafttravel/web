'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Plus, DownloadSimple } from '@phosphor-icons/react';
import { Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { operationsFetch } from '@/lib/operations/client';
import { getAuthInstance } from '@/lib/firebase';
import { filterHotelBalanceObligations, hotelBalanceTotals, summarizeBaftravelLiquidation } from '@/lib/operations/finance';
import type { BaftravelLiquidationData, buildFinancialDashboard } from '@/lib/operations/finance';
import type { LedgerEntry } from '@/lib/operations/types';
import { paymentMethodLabel } from '@/lib/operations/labels';
import { salesChannelLabel } from '@/lib/admin/sales-channels';
import { currencyWarning } from '@/lib/operations/currency';
import { adminDateLabel } from '@/lib/admin/dates';
import { paymentSections, paymentKindForView, paymentPartyKind, paymentLimit, paymentObligationVisible, hotelReceiptExplanation, parsePaymentView, type PaymentView, type PaymentEntryKind } from '@/lib/admin/payments';
import AdminDatePicker from './AdminDatePicker';
import AdminFilePicker from './AdminFilePicker';
import { RECEIPT_ACCEPT, RECEIPT_MAX_SIZE } from '@/lib/admin/files';
import Link from 'next/link';

export type FinanceData = Omit<ReturnType<typeof buildFinancialDashboard>, 'cash'> & {
  currency: string; counterparties: Array<{ id: string; name: string; kind: string }>;
  reservations: Array<{ id: string; name: string; hotelId: string }>; ledger: LedgerEntry[];
  baftravelLiquidation?: { reservations: Array<Omit<BaftravelLiquidationData['reservations'][number], 'email' | 'phone'>> };
};
type DeletionArchive = {
  id: string;
  reservationCode?: string | null;
  deletedAt?: unknown;
  deletedBy?: string;
  financialSnapshot?: {
    reservationCode?: string | null;
    packageTitle?: string | null;
    date?: string | null;
    people?: number | null;
    customerName?: string | null;
    amountTotal?: number | null;
    currency?: string | null;
    status?: string | null;
    mercadoPagoPaymentId?: string | null;
    mercadoPagoPreferenceId?: string | null;
    externalReference?: string | null;
    [key: string]: unknown;
  };
  payments: Array<Record<string, unknown>>;
  ledger: LedgerEntry[];
};
type Obligation = FinanceData['obligations'][number];
const day = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const labels: Record<PaymentEntryKind, string> = {
  hotel_payment: 'Pago a hotel',
  hotel_receipt: 'Pago de hotel a Baftravel', provider_payment: 'Pago a proveedor', offset: 'Compensación con hotel', reversal: 'Anulación de movimiento',
};
const newEntry = (kind: PaymentEntryKind, counterpartyId = '') => ({ kind, counterpartyId, reservationId: '', pairedReservationId: '', amount: '', method: kind === 'offset' ? 'credit_balance' : kind === 'hotel_receipt' ? 'cash' : 'transfer', note: '', occurredAt: day(), receiptUrl: '' });
const loadFinancials = (currency: string) => operationsFetch<FinanceData>(`/api/admin/finanzas?currency=${currency}`);

export default function FinanceManager({ loader = loadFinancials, preview = false, initialView = 'proveedores' }: { loader?: typeof loadFinancials; preview?: boolean; initialView?: PaymentView }) {
  const [currency, setCurrency] = useState('ARS');
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<PaymentView>(() => parsePaymentView(initialView));
  const [taskMode, setTaskMode] = useState<'pending' | 'history'>('pending');
  const [party, setParty] = useState('');
  const [excursion, setExcursion] = useState(''); const [settled, setSettled] = useState('all');
  const [departureFrom, setDepartureFrom] = useState(''); const [departureTo, setDepartureTo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [entry, setEntry] = useState(() => newEntry('provider_payment'));
  const [receiptFile, setReceiptFile] = useState<File | undefined>();
  const [showArchive, setShowArchive] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [deletionArchives, setDeletionArchives] = useState<DeletionArchive[]>([]);
  const [selectedArchiveId, setSelectedArchiveId] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const n = ++sequence.current; setLoading(true); setError('');
    try { const result = await loader(currency); if (n === sequence.current) setData(result); }
    catch (e) { if (n === sequence.current) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los pagos'); setData(null); } }
    finally { if (n === sequence.current) setLoading(false); }
  }, [currency, loader]);
  useEffect(() => { void load(); }, [load]);
  const money = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(n / 100);
  const section = paymentSections.find((item) => item.id === view);
  const taskKind = paymentKindForView(view);
  const partyKind = paymentPartyKind(view);
  const isTask = !!taskKind;
  const isHistory = isTask && taskMode === 'history';
  const isObligations = view === 'liquidaciones' || (isTask && taskMode === 'pending');
  const parties = (data?.counterparties ?? []).filter((p) => !partyKind || p.kind === partyKind);
  const obligations = (data?.obligations ?? []).filter((o) => {
    if ((partyKind && o.type !== partyKind) || (party && o.counterpartyId !== party) || (excursion && o.excursion !== excursion)) return false;
    if (view === 'liquidaciones' && ((departureFrom && (o.date === 'sin-fecha' || o.date < departureFrom)) || (departureTo && (o.date === 'sin-fecha' || o.date > departureTo)))) return false;
    return paymentObligationVisible(view, settled, o);
  });
  const hotelBalanceRows = filterHotelBalanceObligations(data?.obligations ?? [], { hotelId: party, excursion, from: departureFrom, to: departureTo, state: settled as 'pending' | 'settled' | 'all' })
    .slice()
    .sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'));
  const filteredHotelTotals = hotelBalanceTotals(hotelBalanceRows);
  const allPendingHotelTotals = hotelBalanceTotals(filterHotelBalanceObligations(data?.obligations ?? [], { state: 'pending' }));
  const hotelExcursions = [...new Set((data?.obligations ?? []).filter((o) => o.type === 'hotel').map((o) => o.excursion).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const liquidationReservations = (data?.baftravelLiquidation?.reservations ?? []).filter((reservation) =>
    (!party || reservation.hotelId === party) &&
    (!excursion || reservation.excursion === excursion) &&
    (!departureFrom || reservation.date !== 'sin-fecha' && reservation.date >= departureFrom) &&
    (!departureTo || reservation.date !== 'sin-fecha' && reservation.date <= departureTo),
  );
  const liquidationSummary = summarizeBaftravelLiquidation(liquidationReservations);
  const liquidationChannels = [
    ...['whatsapp', 'front'].map((channel) => liquidationSummary.channels.find((item) => item.channel === channel) ?? { channel, count: 0, total: 0, commission: 0, commissionNeedsReview: 0 }),
    ...liquidationSummary.channels.filter((item) => !['whatsapp', 'front'].includes(item.channel)),
  ].sort((a, b) => {
    const priority = (channel: string) => channel === 'whatsapp' ? 0 : channel === 'front' ? 1 : 2;
    return priority(a.channel) - priority(b.channel) || salesChannelLabel(a.channel).localeCompare(salesChannelLabel(b.channel), 'es');
  });
  const liquidationExcursions = [...new Set((data?.baftravelLiquidation?.reservations ?? []).map((reservation) => reservation.excursion).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const history = (data?.ledger ?? []).filter((e): e is LedgerEntry & { kind: PaymentEntryKind } => (!party || e.counterpartyId === party) && !!taskKind && e.kind === taskKind);
  const needsParty = ['provider_payment', 'hotel_payment', 'hotel_receipt', 'offset'].includes(entry.kind);
  const needsReservation = needsParty;
  const formPartyKind = entry.kind === 'provider_payment' ? 'provider' : needsParty ? 'hotel' : null;
  const formParties = (data?.counterparties ?? []).filter((p) => !formPartyKind || p.kind === formPartyKind);
  const canReceiveHotelMoney = (data?.obligations ?? []).some((o) => o.type === 'hotel' && o.receivable > 0 && o.receiptStatus !== 'review');
  const linkedObligations = (data?.obligations ?? []).filter((o) => o.type === formPartyKind && (!entry.counterpartyId || o.counterpartyId === entry.counterpartyId) && (entry.kind === 'hotel_receipt' ? o.receivable > 0 && o.receiptStatus !== 'review' : o.payable > 0 || o.provisional));
  const formReservations = (data?.reservations ?? []).filter((r) => !needsParty || linkedObligations.some((o) => o.reservationId === r.id));
  const selectedObligation = linkedObligations.find((o) => o.reservationId === entry.reservationId && o.counterpartyId === entry.counterpartyId);
  const pairedObligation = data?.obligations.find((o) => o.type === 'hotel' && o.counterpartyId === entry.counterpartyId && o.reservationId === entry.pairedReservationId);
  const limit = selectedObligation ? paymentLimit(entry.kind, { payable: selectedObligation.payable, receivable: pairedObligation?.receivable ?? selectedObligation.receivable }) : undefined;
  const blocked = needsParty && (!selectedObligation || (entry.kind !== 'hotel_receipt' && selectedObligation.provisional));
  const chooseView = (next: PaymentView) => { setView(next); setTaskMode('pending'); setParty(''); setExcursion(''); setSettled('all'); setDepartureFrom(''); setDepartureTo(''); };
  const startNew = (kind: PaymentEntryKind) => {
    requestId.current = crypto.randomUUID(); setReceiptFile(undefined); setEntry(newEntry(kind, party)); setShowForm(true);
  };
  const startSettlement = (o: Obligation, kind: PaymentEntryKind) => {
    requestId.current = crypto.randomUUID(); setReceiptFile(undefined);
    setEntry({ ...newEntry(kind, o.counterpartyId), reservationId: o.reservationId, amount: String(paymentLimit(kind, o) / 100) }); setShowForm(true);
  };
  const selectReservation = (reservationId: string) => {
    const o = linkedObligations.find((row) => row.reservationId === reservationId);
    setEntry({ ...entry, reservationId, pairedReservationId: '', ...(needsParty ? { counterpartyId: o?.counterpartyId ?? entry.counterpartyId, amount: o ? String(paymentLimit(entry.kind, o) / 100) : '' } : {}) });
  };
  const save = async () => {
    if (preview) { toast.info('Vista de prueba: no se registran movimientos'); return; }
    const amount = Math.round(Number(entry.amount) * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) { toast.error('Ingresá un importe válido'); return; }
    if (needsParty && (blocked || limit === undefined || amount > limit)) { toast.error('Revisá la reserva y el importe pendiente antes de continuar'); return; }
    setBusy(true);
    try {
      const occurredAt = entry.occurredAt === day() ? new Date().toISOString() : new Date(`${entry.occurredAt}T12:00:00-03:00`).toISOString();
      await operationsFetch('/api/admin/finanzas', { method: 'POST', body: JSON.stringify({ ...entry, amount, currency, occurredAt, requestId: requestId.current }) });
      requestId.current = crypto.randomUUID(); setShowForm(false); setEntry(newEntry(entry.kind)); toast.success('Movimiento registrado'); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar'); } finally { setBusy(false); }
  };
  const exportExcel = async () => {
    setBusy(true);
    try {
      const token = await getAuthInstance().currentUser?.getIdToken(); const params = new URLSearchParams({ currency, seccion: view, mode: taskMode, party, excursion, estado: settled, desde: departureFrom, hasta: departureTo, format: 'xlsx' });
      const response = await fetch(`/api/admin/finanzas?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('No se pudo generar Excel');
       const fileNames: Record<PaymentView, string> = {
         proveedores: 'BAFT-Pagos-a-proveedores', hoteles: 'BAFT-Pagos-a-hoteles', 'cobros-hoteles': 'BAFT-Pagos-de-hoteles-a-Baftravel',
         balance: 'BAFT-Balance-Hoteles', liquidaciones: 'BAFT-Liquidaciones-Baftravel',
       };
       const fileName = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/i)?.[1]
         ?? `${fileNames[view]}-${currency}-${Date.now()}.xlsx`;
       const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error de exportación'); } finally { setBusy(false); }
  };
  const uploadReceipt = async (file: File) => {
    if (preview) { setReceiptFile(file); return; }
    setBusy(true);
    try {
      const body = new FormData(); body.set('file', file); const token = await getAuthInstance().currentUser?.getIdToken();
      const response = await fetch('/api/admin/comprobantes', { method: 'POST', body, headers: { Authorization: `Bearer ${token}` } }); const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo adjuntar');
      if (typeof result.url !== 'string' || !result.url.startsWith('https://')) throw new Error('No se pudo adjuntar el comprobante');
      setEntry((e) => ({ ...e, receiptUrl: result.url })); setReceiptFile(file); toast.success('Comprobante adjuntado');
    } catch (e) { throw new Error(e instanceof Error ? e.message : 'No se pudo adjuntar'); } finally { setBusy(false); }
  };
  const reverse = async (original: LedgerEntry) => {
    if (preview) { toast.info('Vista de prueba: no se anulan movimientos'); return; }
    const note = window.prompt('¿Por qué querés anular este movimiento? El original quedará en el historial:'); if (!note?.trim()) return;
    if (note.trim().length < 3) { toast.error('El motivo de anulación debe tener al menos 3 caracteres'); return; }
    setBusy(true);
    try { await operationsFetch('/api/admin/finanzas', { method: 'POST', body: JSON.stringify({ ...original, kind: 'reversal', reversalOf: original.id, note, occurredAt: new Date().toISOString(), requestId: crypto.randomUUID() }) }); toast.success('Movimiento anulado'); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo anular'); } finally { setBusy(false); }
  };
  const openDeletionArchive = async () => {
    setShowArchive(true);
    setArchiveLoading(true);
    setArchiveError('');
    try {
      const result = await operationsFetch<{ archives: DeletionArchive[] }>('/api/admin/finanzas/archivos-reservas');
      setDeletionArchives(result.archives ?? []);
      setSelectedArchiveId((current) => current || result.archives?.[0]?.id || '');
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : 'No se pudo cargar la evidencia archivada');
    } finally {
      setArchiveLoading(false);
    }
  };
  const selectedArchive = deletionArchives.find((archive) => archive.id === selectedArchiveId) ?? deletionArchives[0] ?? null;

  return <div className="admin-finance space-y-6">
    <header className="admin-page-heading"><p className="admin-eyebrow">ADMINISTRACIÓN</p><h1>Pagos</h1><p>Pagos, cobros y saldos de hoteles y proveedores.</p></header>
    <div className="-mt-3 flex justify-end">
      <Button variant="outline" disabled={preview || archiveLoading} onClick={() => void openDeletionArchive()}>
        <Archive className="h-4 w-4" />Evidencia de reservas eliminadas
      </Button>
    </div>
     <nav className="admin-payment-tasks" aria-label="Secciones de pagos">{paymentSections.map((item) => <button key={item.id} aria-current={view === item.id ? 'page' : undefined} onClick={() => chooseView(item.id)}>{item.label}</button>)}</nav>
    {error && <div role="alert"><p className="text-red-700">{error}</p><Button variant="outline" onClick={() => void load()}>Reintentar</Button></div>}
    {loading && <p role="status">Consultando pagos…</p>}
    {data && <>
      {currencyWarning(data.currencyIssues) && <p role="alert" className="dash-data-quality">{currencyWarning(data.currencyIssues)}</p>}
        {view === 'liquidaciones' ? <div className="admin-finance-metrics admin-baftravel-metrics">
          <div><header><h3>Excursiones</h3></header><p><span>Cantidad</span><strong>{liquidationSummary.count}</strong></p><p><span>Monto total</span><strong>{money(liquidationSummary.total)}</strong></p></div>
          <div><header><h3>Recaudación Baftravel</h3></header><p><span>Importe comisión</span><strong>{money(liquidationSummary.commission)}</strong></p><small>Venta menos costos registrados de proveedores.</small>{liquidationSummary.commissionNeedsReview > 0 && <small className="admin-balance-review">{liquidationSummary.commissionNeedsReview} excursiones con comisión por revisar.</small>}</div>
          {liquidationChannels.map((channel) => <div key={channel.channel}><header><h3>Canal {salesChannelLabel(channel.channel)}</h3></header><p><span>Cantidad</span><strong>{channel.count}</strong></p><p><span>Monto total</span><strong>{money(channel.total)}</strong></p><p><span>Importe comisión</span><strong>{money(channel.commission)}</strong></p>{channel.commissionNeedsReview > 0 && <small className="admin-balance-review">{channel.commissionNeedsReview} excursiones por revisar.</small>}</div>)}
        </div> : view === 'balance' ? <div className="admin-finance-metrics admin-hotel-balance-metrics">
         <div><header><h3>Pendiente de pagar</h3><span>Baftravel → hoteles</span></header><p><span>Según filtros</span><strong>{money(filteredHotelTotals.payable)}</strong></p><p><span>Total pendiente</span><strong>{money(allPendingHotelTotals.payable)}</strong></p></div>
         <div><header><h3>Pendiente de cobrar</h3><span>Hoteles → Baftravel</span></header><p><span>Según filtros</span><strong>{money(filteredHotelTotals.receivable)}</strong></p><p><span>Total pendiente</span><strong>{money(allPendingHotelTotals.receivable)}</strong></p></div>
         <div><header><h3>Balance</h3><span>A pagar − a cobrar</span></header><p><span>Según filtros</span><strong>{money(filteredHotelTotals.balance)}</strong></p><p><span>Balance total</span><strong>{money(allPendingHotelTotals.balance)}</strong></p></div>
       </div> : <div className="admin-finance-metrics">{[['Baftravel debe a hoteles', data.totals.payable], ['Hoteles deben a Baftravel', data.totals.receivable], ['Por pagar a proveedores', data.totals.providers]].map(([label, value]) => <div key={label}><p>{label}<span>{currency}</span></p><strong>{money(Number(value))}</strong></div>)}</div>}
      <header className="admin-payment-heading"><div><h2>{section?.label}</h2>{section && <p>{section.description}</p>}</div>
         {taskKind && section?.action && <Button disabled={busy || loading || view === 'cobros-hoteles' && !canReceiveHotelMoney} onClick={() => startNew(taskKind)}><Plus size={15} />{section.action}</Button>}
      </header>
      {isTask && <nav className="admin-finance-tabs" aria-label="Estado de los pagos"><button aria-current={taskMode === 'pending' ? 'page' : undefined} onClick={() => setTaskMode('pending')}>{view === 'cobros-hoteles' ? 'Por recibir' : 'Pendientes'}</button><button aria-current={taskMode === 'history' ? 'page' : undefined} onClick={() => setTaskMode('history')}>{view === 'cobros-hoteles' ? 'Pagos recibidos' : 'Pagos realizados'}</button></nav>}
        <div className="admin-payment-filter-row">
        <div className="admin-payment-filters">
         <label>{partyKind === 'provider' ? 'Proveedor' : partyKind === 'hotel' ? 'Hotel' : 'Hotel o proveedor'}<select value={party} onChange={(e) => setParty(e.target.value)}><option value="">Todos</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            {(isObligations || view === 'balance') && <><label>Excursión<select value={excursion} onChange={(e) => setExcursion(e.target.value)}><option value="">Todas</option>{(view === 'balance' ? hotelExcursions : view === 'liquidaciones' ? liquidationExcursions : [...new Set((data.obligations.filter((o) => !partyKind || o.type === partyKind)).map((o) => o.excursion).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))).map((s) => <option key={s}>{s}</option>)}</select></label><label>{view === 'liquidaciones' ? 'Estado de saldos' : 'Estado'}<select value={settled} onChange={(e) => setSettled(e.target.value)}><option value="pending">{view === 'cobros-hoteles' ? 'Con saldo por recibir' : view === 'balance' ? 'Pendiente o por revisar' : 'Pendientes o por completar'}</option><option value="settled">Saldados</option>{view === 'cobros-hoteles' && <><option value="not_collected">Sin cobro registrado en hotel</option><option value="review">Por revisar</option></>}<option value="all">Todos</option></select></label></>}
          {(view === 'balance' || view === 'liquidaciones') && <><label>Fecha de excursión desde<AdminDatePicker className="admin-datepicker-range" value={departureFrom} max={departureTo || undefined} onValueChange={setDepartureFrom} /></label><label>Fecha de excursión hasta<AdminDatePicker className="admin-datepicker-range" value={departureTo} min={departureFrom || undefined} onValueChange={setDepartureTo} /></label></>}
        </div>
        <div className="admin-payment-filter-actions">
          <label>Moneda<select aria-label="Moneda de pagos" disabled={busy || showForm} value={currency} onChange={(e) => { setCurrency(e.target.value); setParty(''); setData(null); }}>{['ARS', 'USD', 'BRL', 'EUR'].map((c) => <option key={c}>{c}</option>)}</select></label>
          <Button variant="outline" disabled={preview || busy || loading || !data} onClick={() => void exportExcel()}><DownloadSimple size={14} />{({ proveedores: 'Exportar pagos a proveedores', hoteles: 'Exportar pagos a hoteles', 'cobros-hoteles': 'Exportar pagos de hoteles a Baftravel', balance: 'Exportar Balance Hoteles', liquidaciones: 'Exportar Liquidaciones Baftravel' } as Record<PaymentView, string>)[view]}</Button>
        </div>
        </div>
        {view === 'liquidaciones' && <>
          <div className="admin-data-table admin-baftravel-liquidation-table overflow-x-auto"><table><thead><tr>{['Fecha de excursión', 'Datos pax', 'Excursión', 'Proveedor', 'Total', 'Canal', 'Importe Comisión'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>
            {liquidationReservations.flatMap((reservation) => reservation.providers.map((provider, index) => <tr key={`${reservation.reservationId}:${provider.id || 'none'}:${index}`}>
              <td>{adminDateLabel(reservation.date)}</td>
              <td><strong>{reservation.pax[0] || 'Sin informar'}</strong><p className="admin-cell-secondary">{reservation.pax.slice(1).join(', ') || `${reservation.people} pasajero${reservation.people === 1 ? '' : 's'}`} · {reservation.reservationCode}</p></td>
              <td>{reservation.excursion}</td>
              <td>{provider.name}</td>
              <td>{index === 0 ? money(reservation.total) : '—'}</td>
              <td>{salesChannelLabel(reservation.channel)}</td>
              <td>{index > 0 ? '—' : reservation.commission === null ? <span className="admin-balance-review">Por revisar</span> : money(reservation.commission)}</td>
            </tr>))}
          </tbody></table>{!liquidationReservations.length && <p className="dash-empty">No hay excursiones que coincidan con estos filtros.</p>}</div>
        </>}
        {view === 'balance' && <>
         <div className="admin-data-table admin-hotel-balance-table overflow-x-auto"><table><thead><tr>{['Hotel', 'Fecha de excursión', 'Excursión', 'Nombre pax', 'Cant. pax', 'Monto a pagar · Baftravel', 'Monto a cobrar · Baftravel', 'Saldo', 'Acciones'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>
           {hotelBalanceRows.map((row) => {
             const paymentNeedsReview = row.provisional;
             const receiptNeedsReview = row.receiptStatus === 'review';
             const balanceNeedsReview = paymentNeedsReview || receiptNeedsReview;
             return <tr key={row.id}>
               <td>{row.name || 'Hotel sin nombre'}</td>
               <td>{adminDateLabel(row.date)}</td>
               <td>{row.excursion || 'Sin excursión'}<p className="admin-cell-secondary">{row.reservationCode}</p></td>
               <td>{row.customer || 'Sin informar'}</td>
               <td>{row.people}</td>
               <td>{paymentNeedsReview ? <span className="admin-balance-review">Por revisar</span> : money(row.payable)}</td>
               <td>{receiptNeedsReview ? <span className="admin-balance-review">Por revisar</span> : money(row.receivable)}</td>
               <td>{balanceNeedsReview ? <span className="admin-balance-review">Por revisar</span> : money(row.payable - row.receivable)}</td>
               <td><Button variant="outline" onClick={() => { setView('liquidaciones'); setParty(row.counterpartyId); setSettled('pending'); }}>Ver liquidación</Button></td>
             </tr>;
           })}
         </tbody></table>{!hotelBalanceRows.length && <p className="dash-empty">No hay movimientos de hoteles para estos filtros.</p>}</div>
       </>}
        {view === 'liquidaciones' && <header className="admin-payment-heading admin-liquidation-operations-heading"><div><h3>Gestión de saldos de hoteles</h3><p>Pagos, cobros y compensaciones pendientes para los filtros seleccionados.</p></div></header>}
        {isObligations && <div className="admin-data-table overflow-x-auto"><table><thead><tr>{[partyKind === 'provider' ? 'Proveedor' : 'Hotel', 'Excursión / reserva', 'Fecha', ...(view !== 'cobros-hoteles' ? ['A pagar'] : []), ...(view === 'cobros-hoteles' || view === 'liquidaciones' ? ['A recibir'] : []), 'Acciones'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{obligations.map((o) => <tr key={o.id}>
        <td>{o.name}{view === 'cobros-hoteles' && o.receiptStatus ? <p className="admin-cell-secondary">{hotelReceiptExplanation(o.receiptStatus)}</p> : o.provisional && <p className="admin-cell-secondary">{o.type === 'hotel' ? 'Falta definir el medio de comisión.' : 'Disponible al completar la reserva.'}</p>}</td>
        <td>{o.excursion}<p className="admin-cell-secondary">{o.customer} · {o.reservationCode}</p></td><td>{adminDateLabel(o.date)}</td>
        {view !== 'cobros-hoteles' && <td>{o.provisional && o.payable === 0 ? 'Por completar' : money(o.payable)}</td>}{(view === 'cobros-hoteles' || view === 'liquidaciones') && <td>{o.receiptStatus === 'review' ? 'Por revisar' : money(o.receivable)}</td>}
        <td><div className="flex flex-wrap gap-2">{view !== 'cobros-hoteles' && o.payable > 0 && <Button size="sm" variant="outline" disabled={busy || o.provisional} onClick={() => startSettlement(o, o.type === 'hotel' ? 'hotel_payment' : 'provider_payment')}>Pagar</Button>}{(view === 'cobros-hoteles' || view === 'liquidaciones') && o.receivable > 0 && o.receiptStatus !== 'review' && <Button size="sm" variant="outline" disabled={busy} onClick={() => startSettlement(o, 'hotel_receipt')}>Registrar recepción</Button>}{view === 'cobros-hoteles' && o.receiptStatus !== 'receivable' && <Link href={`/admin/ventas/${o.reservationId}`} className="underline">{o.receiptStatus === 'not_collected' ? 'Registrar cobro del pasajero' : 'Revisar reserva'}</Link>}{view === 'liquidaciones' && o.payable > 0 && <Button size="sm" variant="outline" disabled={busy || o.provisional || !data.obligations.some((other) => other.type === 'hotel' && other.counterpartyId === o.counterpartyId && other.receivable > 0)} onClick={() => startSettlement(o, 'offset')}>Compensar</Button>}</div></td>
      </tr>)}</tbody></table>{!obligations.length && <p className="dash-empty">{view === 'cobros-hoteles' && settled === 'pending' ? 'No hay dinero de hoteles pendiente de recibir para estos filtros.' : 'No hay reservas que coincidan con estos filtros.'}</p>}</div>}
       {isHistory && <div className="admin-data-table overflow-x-auto"><table><thead><tr>{['Fecha', 'Hotel o proveedor', 'Concepto', 'Importe', 'Registrado por', 'Acciones'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{history.map((e) => { const reversal = data.ledger.find((r) => r.reversalOf === e.id); return <tr key={e.id}><td>{adminDateLabel(e.occurredAt)}</td><td>{data.counterparties.find((p) => p.id === e.counterpartyId)?.name || '—'}</td><td>{labels[e.kind]}{e.note?.trim() ? ` · ${e.note}` : ''}{reversal && <p className="admin-cell-secondary">Anulado: {reversal.note?.trim() || 'Motivo no informado'}</p>}</td><td>{money(e.amount)}</td><td>{e.recordedBy}</td><td>{e.receiptUrl && <a href={e.receiptUrl} className="mr-3 underline" target="_blank" rel="noopener noreferrer">Comprobante</a>}{e.kind !== 'offset' && !reversal && <Button size="sm" variant="outline" disabled={busy} onClick={() => void reverse(e)}>Anular</Button>}</td></tr>; })}</tbody></table>{!history.length && <p className="dash-empty">Todavía no hay {view === 'cobros-hoteles' ? 'pagos recibidos' : 'movimientos registrados'} para esta selección.</p>}</div>}
    </>}
      <Dialog open={showForm} onOpenChange={(open) => { if (!busy) setShowForm(open); }}><DialogContent className="admin-finance-dialog"><DialogHeader><DialogTitle>{labels[entry.kind]}</DialogTitle><DialogDescription>{entry.kind === 'hotel_receipt' ? 'Registrá el efectivo recibido.' : 'Completá los datos del movimiento.'}</DialogDescription></DialogHeader>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }}><div className="grid gap-4 md:grid-cols-2">
        <p className="admin-payment-concept md:col-span-2">Concepto: <strong>{labels[entry.kind]}</strong></p>
        <label>{formPartyKind === 'provider' ? 'Proveedor' : formPartyKind === 'hotel' ? 'Hotel' : 'Hotel o proveedor'}<select aria-label={formPartyKind === 'provider' ? 'Proveedor del pago' : formPartyKind === 'hotel' ? 'Hotel del movimiento' : 'Hotel o proveedor'} required={needsParty} value={entry.counterpartyId} onChange={(e) => setEntry({ ...entry, counterpartyId: e.target.value, reservationId: '', pairedReservationId: '', amount: '' })}><option value="">{needsParty ? 'Seleccioná una opción' : 'Sin hotel ni proveedor'}</option>{formParties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Reserva<select aria-label="Reserva del movimiento" required={needsReservation} value={entry.reservationId} onChange={(e) => selectReservation(e.target.value)}><option value="">{needsReservation ? 'Seleccioná una reserva' : 'Sin reserva'}</option>{formReservations.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        {entry.kind === 'offset' && <label className="md:col-span-2">Reserva cuyo dinero debe entregar el hotel<select aria-label="Reserva a compensar" value={entry.pairedReservationId} onChange={(e) => { const paired = data?.obligations.find((o) => o.type === 'hotel' && o.counterpartyId === entry.counterpartyId && o.reservationId === e.target.value); setEntry({ ...entry, pairedReservationId: e.target.value, amount: selectedObligation ? String(Math.min(selectedObligation.payable, paired?.receivable ?? selectedObligation.receivable) / 100) : '' }); }}><option value="">La misma reserva</option>{data?.reservations.filter((r) => r.hotelId === entry.counterpartyId && r.id !== entry.reservationId && data.obligations.some((o) => o.type === 'hotel' && o.reservationId === r.id && o.receivable > 0)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
        <label>Importe en {currency}<Input aria-label="Importe del movimiento" required type="number" min="0.01" step="0.01" max={limit === undefined ? undefined : limit / 100} value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} /></label>
        <label>Fecha<AdminDatePicker aria-label="Fecha del movimiento" required max={day()} value={entry.occurredAt} onValueChange={(occurredAt) => setEntry({ ...entry, occurredAt })} /></label>
         {entry.kind === 'hotel_receipt' ? <p className="self-center text-sm">Medio: <strong>Efectivo</strong></p> : entry.kind !== 'offset' ? <label>Medio<select aria-label="Medio del movimiento" value={entry.method} onChange={(e) => setEntry({ ...entry, method: e.target.value })}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option></select></label> : <p>Compensación sin movimiento de dinero.</p>}
        <AdminFilePicker className="md:col-span-2" label="Comprobante" description="PDF, JPG o PNG" accept={RECEIPT_ACCEPT} maxSize={RECEIPT_MAX_SIZE} busy={busy} processingLabel="Subiendo comprobante…" successLabel={preview ? 'Seleccionado en vista de prueba, sin subir' : 'Comprobante adjunto'} files={receiptFile ? [receiptFile] : []} onFilesSelected={async ([file]) => { if (file) await uploadReceipt(file); }} onRemove={() => { setReceiptFile(undefined); setEntry((current) => ({ ...current, receiptUrl: '' })); }} />
        <label className="md:col-span-2">Detalle / referencia (opcional)<Input maxLength={1000} value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} /></label>
      </div>
       <div className="admin-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setShowForm(false)}>Cancelar</Button><Button disabled={busy || blocked || (needsParty && !limit)}>{busy ? 'Registrando…' : entry.kind === 'hotel_receipt' ? 'Confirmar recepción' : entry.kind === 'offset' ? 'Confirmar compensación' : 'Confirmar pago'}</Button></div></form>
     </DialogContent></Dialog>
      <Dialog open={showArchive} onOpenChange={setShowArchive}>
        <DialogContent className="admin-finance-dialog !max-w-5xl">
          <DialogHeader>
            <DialogTitle>Evidencia financiera de reservas eliminadas</DialogTitle>
            <DialogDescription>Archivo de auditoría. Estos registros no forman parte de las ventas activas ni modifican saldos operativos.</DialogDescription>
          </DialogHeader>
          {archiveLoading ? <p role="status" className="py-8 text-center text-sm text-slate-500">Cargando evidencia archivada…</p> : archiveError ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{archiveError}</div>
          ) : !deletionArchives.length ? (
            <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Todavía no hay reservas eliminadas con evidencia archivada.</p>
          ) : (
            <div className="grid max-h-[70vh] gap-4 overflow-hidden md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.6fr)]">
              <nav aria-label="Reservas eliminadas" className="space-y-2 overflow-y-auto pr-1">
                {deletionArchives.map((archive) => {
                  const snapshot = archive.financialSnapshot ?? {};
                  const active = (selectedArchive?.id ?? '') === archive.id;
                  return <button key={archive.id} type="button" onClick={() => setSelectedArchiveId(archive.id)} aria-current={active ? 'true' : undefined} className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? 'border-slate-400 bg-slate-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                    <span className="block truncate text-sm font-semibold text-slate-900">{snapshot.customerName || 'Cliente sin nombre'}</span>
                    <span className="mt-1 block truncate text-xs text-slate-600">{snapshot.reservationCode || archive.reservationCode || archive.id} · {snapshot.packageTitle || 'Reserva'}</span>
                    <span className="mt-1 block text-[11px] text-slate-500">Eliminada {adminDateLabel(archive.deletedAt)}</span>
                  </button>;
                })}
              </nav>
              {selectedArchive && (() => {
                const snapshot = selectedArchive.financialSnapshot ?? {};
                const archivedCurrency = ['ARS', 'USD', 'BRL', 'EUR'].includes(String(snapshot.currency ?? '').toUpperCase()) ? String(snapshot.currency).toUpperCase() : 'ARS';
                const archivedMoney = (amount: unknown) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: archivedCurrency }).format((Number(amount) || 0) / 100);
                return <article className="min-w-0 space-y-4 overflow-y-auto rounded-xl border border-slate-200 p-4">
                  <header className="border-b border-slate-100 pb-3">
                    <h3 className="text-base font-semibold text-slate-900">{snapshot.reservationCode || selectedArchive.reservationCode || selectedArchive.id} · {snapshot.customerName || 'Cliente sin nombre'}</h3>
                    <p className="mt-1 text-xs text-slate-500">{snapshot.packageTitle || 'Reserva'} · {snapshot.date === 'sin-fecha' ? 'A coordinar' : adminDateLabel(snapshot.date)} · {Number(snapshot.people) || 0} pasajeros</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">Total archivado: {archivedMoney(snapshot.amountTotal)} · {String(snapshot.status || 'Estado no informado')}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Eliminada {adminDateLabel(selectedArchive.deletedAt)} por {selectedArchive.deletedBy || 'admin'}</p>
                    {(snapshot.mercadoPagoPaymentId || snapshot.mercadoPagoPreferenceId || snapshot.externalReference) && <p className="mt-2 break-all font-mono text-[11px] text-slate-500">{[
                      snapshot.mercadoPagoPaymentId ? `MP: ${snapshot.mercadoPagoPaymentId}` : '',
                      snapshot.mercadoPagoPreferenceId ? `Preferencia: ${snapshot.mercadoPagoPreferenceId}` : '',
                      snapshot.externalReference ? `Referencia: ${snapshot.externalReference}` : '',
                    ].filter(Boolean).join(' · ')}</p>}
                  </header>
                  <section>
                    <h4 className="text-sm font-semibold text-slate-900">Movimientos del pasajero · {selectedArchive.payments.length}</h4>
                    {selectedArchive.payments.length ? <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100">
                      {selectedArchive.payments.map((payment, index) => <li key={String(payment.id ?? index)} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                        <span className="min-w-0 text-slate-700">{String(payment.movementType ?? payment.method ?? 'Movimiento')} · {String(payment.status ?? 'registrado')}<span className="block text-[11px] text-slate-500">{adminDateLabel(payment.occurredAt ?? payment.createdAt)}{payment.message ? ` · ${String(payment.message)}` : ''}{payment.reference ? ` · Ref. ${String(payment.reference)}` : ''}</span></span>
                        <strong className="shrink-0 tabular-nums text-slate-900">{archivedMoney(payment.amount)}</strong>
                      </li>)}
                    </ul> : <p className="mt-1 text-xs text-slate-500">No había movimientos detallados asociados.</p>}
                  </section>
                  <section>
                    <h4 className="text-sm font-semibold text-slate-900">Libro contable y comprobantes · {selectedArchive.ledger.length}</h4>
                    {selectedArchive.ledger.length ? <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100">
                      {selectedArchive.ledger.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                        <span className="min-w-0 text-slate-700">{labels[item.kind as PaymentEntryKind] ?? item.kind} · {item.note || 'Sin detalle'}<span className="block text-[11px] text-slate-500">{adminDateLabel(item.occurredAt)} · {item.recordedBy || 'Usuario no informado'}</span></span>
                        <span className="flex shrink-0 items-center gap-2"><strong className="tabular-nums text-slate-900">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: item.currency || archivedCurrency }).format((Number(item.amount) || 0) / 100)}</strong>{item.receiptUrl && <a href={item.receiptUrl} target="_blank" rel="noopener noreferrer" className="underline">Comprobante protegido</a>}</span>
                      </li>)}
                    </ul> : <p className="mt-1 text-xs text-slate-500">No hay asientos contables asociados en el libro de operaciones.</p>}
                  </section>
                </article>;
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
   </div>;
}
