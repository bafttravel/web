'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ArrowsClockwise, CaretDown, DownloadSimple, FunnelSimple, Info, TrendUp, X } from '@phosphor-icons/react';
import { getAuthInstance } from '@/lib/firebase';
import { operationsFetch } from '@/lib/operations/client';
import type { ReportFilters, ReportResult, ReportRow } from '@/lib/operations/reports';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { currencyWarning } from '@/lib/operations/currency';
import AdminDateRangePicker from './AdminDateRangePicker';
import { adminDateLabel, adminTimeLabel, adminReportDate } from '@/lib/admin/dates';
import { salesChannels, salesChannelValues, salesChannelLabel } from '@/lib/admin/sales-channels';

type Option = { id: string; name: string; kind?: string };
export type DashboardData = ReportResult & {
  options: { packages: Option[]; counterparties: Option[]; vendors: Option[]; nationalities: string[]; methods: string[] };
  attention?: { pendingPayments: number; missingPickup: number; departuresToday: number };
  position?: { payable: number; receivable: number; providers: number };
};
type View = 'overview' | 'sales' | 'passengers' | 'margin' | 'commercial';
const views: Array<{ id: View; label: string }> = [{ id: 'overview', label: 'Resumen' }, { id: 'sales', label: 'Ventas' }, { id: 'passengers', label: 'Pasajeros' }, { id: 'margin', label: 'Rentabilidad' }, { id: 'commercial', label: 'Comercial' }];
const sectionGroups: Record<Exclude<View, 'overview'>, string[]> = {
  sales: ['Excursiones más vendidas', 'Excursiones menos vendidas', 'Medios de pago (cobros netos)', 'Evolución mensual de ventas', 'Detalle de reservas'],
  passengers: ['Nacionalidades', 'Edades a la fecha de excursión'],
  margin: ['Rentabilidad operativa', 'Detalle de reservas'],
  commercial: ['Ventas por vendedor', 'Hoteles y revendedores', 'Principales compradores', 'Canales de venta', 'Pagos a proveedores (fecha de pago)'],
};
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const initialDashboardFilters = (): ReportFilters => { const now = new Date(); return { from: localDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: localDay(now), dateBy: 'sale', currency: 'ARS', packageId: '', nationality: '', age: '', vendorId: '', hotelId: '', providerId: '', method: '', status: '', channel: '' }; };
const queryString = (f: ReportFilters) => new URLSearchParams(f as unknown as Record<string, string>).toString();
const monetary = (key: string) => /Importe|Margen$|Cobrado|Pagado|Venta|Costo|Comisión|Ventas|Gastos/.test(key);
const loadDashboard = (f: ReportFilters) => operationsFetch<DashboardData>(`/api/admin/reportes?${queryString(f)}`);
const translated: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', mercadopago: 'Mercado Pago', wetravel: 'WeTravel', admin: 'Sin identificar', ...Object.fromEntries(salesChannelValues.map((value) => [value, salesChannelLabel(value)])), reserved: 'Reservada', completed: 'Completada', pending: 'Pendiente', cancelled: 'Cancelada' };

export default function BusinessReports({ loader = loadDashboard, preview = false, initialFilters }: { loader?: (f: ReportFilters) => Promise<DashboardData>; preview?: boolean; initialFilters?: ReportFilters }) {
  const [filters, setFilters] = useState(() => initialFilters ?? initialDashboardFilters());
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [exporting, setExporting] = useState(false);
  const [view, setView] = useState<View>('overview'); const [advanced, setAdvanced] = useState(false);
  const [section, setSection] = useState(''); const [criteria, setCriteria] = useState(false);
  const sequence = useRef(0);
  const load = async (f: ReportFilters) => {
    const current = ++sequence.current; setBusy(true); setError('');
    try { const result = await loader(f); if (current === sequence.current) { setData(result); if (!preview) sessionStorage.setItem('baft:dashboard:filters', JSON.stringify(f)); } }
    catch (e) { if (current === sequence.current) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos'); setData(null); } }
    finally { if (current === sequence.current) setBusy(false); }
  };
  useEffect(() => {
    let saved = initialFilters ?? initialDashboardFilters();
    if (!preview) { try { const raw = JSON.parse(sessionStorage.getItem('baft:dashboard:filters') || 'null'); if (raw && typeof raw === 'object') { const defaults = initialDashboardFilters(); saved = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, typeof raw[key] === 'string' ? raw[key] : value])) as ReportFilters; } } catch { /* Keep safe defaults when storage is unavailable. */ } }
    queueMicrotask(() => { setFilters(saved); void load(saved); });
    // Loader is stable for the lifetime of this dashboard; filter changes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currency = data?.filters.currency ?? filters.currency;
  const money = (n: number | null) => n === null ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n / 100);
  const rows = (title: string) => data?.sections.find((s) => s.title === title)?.rows ?? [];
  const set = (key: keyof ReportFilters, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const activeFilters = Object.entries(filters).filter(([k, v]) => !['from', 'to', 'dateBy', 'currency'].includes(k) && v).length;
  const dirty = !!data && queryString(filters) !== queryString(data.filters);
  const changeView = (next: View) => { setView(next); setSection(next === 'overview' ? '' : sectionGroups[next][0]); };
  const quick = (period: string) => {
    if (period === 'custom') return;
    const end = new Date(); const start = new Date(end);
    if (period === 'week') start.setDate(start.getDate() - 6);
    if (period === 'month') start.setDate(1);
    if (period === 'year') { start.setMonth(0); start.setDate(1); }
    const f = { ...filters, from: localDay(start), to: localDay(end) }; setFilters(f); void load(f);
  };
  const exportExcel = async () => {
    if (!data || preview) return; setExporting(true);
    try {
      const token = await getAuthInstance().currentUser?.getIdToken();
      const response = await fetch(`/api/admin/reportes?${queryString(data.filters)}&format=xlsx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('No se pudo generar el Excel');
      const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = `BAFT-dashboard-${currency}-${data.filters.from || 'inicio'}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error de exportación'); } finally { setExporting(false); }
  };
  const select = (label: string, key: keyof ReportFilters, options: Option[]) => <label className="dash-field"><span>{label}</span><select value={filters[key]} onChange={(e) => set(key, e.target.value)}><option value="">Todos</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>;

  return <div className="dash-page">
    <header className="dash-heading"><div><p className="admin-eyebrow">TU NEGOCIO, EN UN SOLO LUGAR</p><h1>Dashboard</h1><p>Una visión clara para tomar la próxima decisión.</p></div><div className="dash-heading-actions"><button className="admin-icon-button" title="Actualizar datos" aria-label="Actualizar Dashboard" disabled={busy} onClick={() => void load(data?.filters ?? filters)}><ArrowsClockwise size={17} className={busy ? 'animate-spin' : ''} /></button><Button variant="outline" disabled={!data || busy || exporting || preview} onClick={() => void exportExcel()}><DownloadSimple size={15} />{exporting ? 'Exportando…' : 'Exportar Excel'}</Button></div></header>

    <form className="dash-filters" onSubmit={(e) => { e.preventDefault(); void load(filters); }}>
      <div className="dash-filter-bar"><AdminDateRangePicker label="Período del Dashboard" from={filters.from} to={filters.to} onValueChange={(from, to) => setFilters((f) => ({ ...f, from, to }))} /><select aria-label="Período rápido" defaultValue="custom" onChange={(e) => quick(e.target.value)}><option value="custom">Elegir período</option><option value="day">Hoy</option><option value="week">Últimos 7 días</option><option value="month">Este mes</option><option value="year">Este año</option></select><select aria-label="Criterio de fecha" value={filters.dateBy} onChange={(e) => set('dateBy', e.target.value)}><option value="sale">Fecha de venta</option><option value="departure">Fecha de excursión</option><option value="payment">Fecha de cobro</option></select><select aria-label="Moneda" value={filters.currency} onChange={(e) => set('currency', e.target.value)}>{['ARS', 'USD', 'BRL', 'EUR'].map((c) => <option key={c}>{c}</option>)}</select><button type="button" className="dash-filter-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><FunnelSimple size={15} />Filtros{activeFilters > 0 && <span>{activeFilters}</span>}<CaretDown size={12} /></button><Button type="submit" disabled={busy}>{busy ? 'Cargando…' : 'Aplicar'}</Button></div>
      {advanced && <div className="dash-advanced">{select('Excursión', 'packageId', data?.options.packages ?? [])}{select('Nacionalidad', 'nationality', (data?.options.nationalities ?? []).map((s) => ({ id: s, name: s })))}{select('Edad al viajar', 'age', ['0–12', '13–17', '18–29', '30–44', '45–59', '60+', 'Sin informar'].map((s) => ({ id: s, name: s })))}{select('Vendedor', 'vendorId', data?.options.vendors ?? [])}{select('Hotel / revendedor', 'hotelId', data?.options.counterparties.filter((p) => p.kind === 'hotel') ?? [])}{select('Proveedor', 'providerId', data?.options.counterparties.filter((p) => p.kind === 'provider') ?? [])}{select('Medio de pago', 'method', (data?.options.methods ?? []).map((s) => ({ id: s, name: translated[s] ?? s })))}{select('Canal', 'channel', [...salesChannels.map((channel) => ({ id: channel.value, name: channel.label })), ...['backoffice', 'hotel', 'other'].map((id) => ({ id, name: salesChannelLabel(id) }))])}{select('Estado', 'status', ['reserved', 'completed', 'pending', 'cancelled'].map((s) => ({ id: s, name: translated[s] })))}<button type="button" className="dash-reset" onClick={() => { const f = initialDashboardFilters(); setFilters(f); void load(f); }}><X size={13} />Limpiar filtros</button></div>}
    </form>
    {dirty && <p className="dash-filter-notice">Hay filtros sin aplicar. Los indicadores y el Excel corresponden a la última consulta.</p>}
    <nav className="dash-tabs" aria-label="Vistas del Dashboard">{views.map((v) => <button key={v.id} aria-current={view === v.id ? 'page' : undefined} onClick={() => changeView(v.id)}>{v.label}</button>)}</nav>
    {error && <div className="dash-error" role="alert"><strong>No pudimos cargar el Dashboard.</strong><p>{error}</p><Button variant="outline" onClick={() => void load(filters)}>Reintentar</Button></div>}
    {busy && !data && <div role="status" aria-label="Cargando Dashboard" className="dash-skeleton"><div /><div /><div /><div /></div>}
    {data && <div className="dash-results" aria-busy={busy} data-loading={busy}>
      {currencyWarning(data.currencyIssues) && <p role="alert" className="dash-data-quality">{currencyWarning(data.currencyIssues)}</p>}
      <section className="dash-metrics" aria-label="Indicadores del período">{[
        { label: 'Ventas netas', value: money(data.summary.sales), detail: data.previous?.changePercent !== null && data.previous?.changePercent !== undefined ? `${data.previous.changePercent >= 0 ? '+' : ''}${data.previous.changePercent.toFixed(1)}% vs. período anterior` : 'Sin período anterior comparable' },
        { label: 'Cobrado', value: money(data.summary.collected), detail: 'Cobros netos de devoluciones' },
        { label: 'Margen operativo', value: money(data.summary.margin), detail: data.summary.margin === null ? 'Faltan datos para calcularlo' : 'Después de costos y comisiones' },
        { label: 'Pasajeros', value: data.summary.passengers.toLocaleString('es-AR'), detail: `${data.summary.reservations} reservas en el período` },
      ].map((m) => <div className="dash-metric" key={m.label}><p>{m.label}<span>{monetary(m.label) || m.label === 'Ventas netas' || m.label === 'Margen operativo' ? currency : ''}</span></p><strong>{m.value}</strong><small>{m.detail}</small></div>)}</section>

      {view === 'overview' ? <>
        <div className="dash-overview-grid"><section className="dash-panel dash-trend"><div className="dash-panel-heading"><div><h2>Evolución de ventas</h2><p>Importe neto por mes · {currency}</p></div><TrendUp size={18} /></div><TrendChart rows={rows('Evolución mensual de ventas')} money={money} /></section><section className="dash-panel dash-position"><div className="dash-panel-heading"><div><h2>Saldos por cobrar y pagar</h2><p>Saldos actuales · {currency}</p></div><Link href="/admin/pagos" aria-label="Abrir pagos"><ArrowUpRight size={17} /></Link></div>{data.position ? <div className="dash-position-values"><div><span>Por cobrar a hoteles</span><strong>{money(data.position.receivable)}</strong></div><div><span>Por pagar a hoteles</span><strong>{money(data.position.payable)}</strong></div><div><span>Por pagar a proveedores</span><strong>{money(data.position.providers)}</strong></div></div> : <p className="dash-empty">Consultá los saldos en Pagos.</p>}<Link className="dash-text-link" href="/admin/pagos?seccion=balance">Ver balance Hotel / Baftravel<ArrowUpRight size={13} /></Link></section></div>
        {data.attention && <section className="dash-attention" aria-label="Operación actual"><div><p className="admin-eyebrow">OPERACIÓN ACTUAL</p><span>Sin filtro de período</span></div><Link href="/admin/ventas"><strong>{data.attention.departuresToday}</strong><span>Reservas con salida hoy</span><ArrowUpRight size={14} /></Link><Link href="/admin/ventas"><strong>{data.attention.pendingPayments}</strong><span>Reservas con saldo pendiente</span><ArrowUpRight size={14} /></Link><Link href="/admin/ventas"><strong>{data.attention.missingPickup}</strong><span>Retiros por definir</span><ArrowUpRight size={14} /></Link></section>}
        <div className="dash-overview-grid dash-overview-bottom"><ReportTable title="Excursiones más vendidas" rows={rows('Excursiones más vendidas').slice(0, 5)} money={money} columns={['Nombre', 'Reservas', 'Importe']} onExpand={() => changeView('sales')} /><ReportChart title="Origen de los pasajeros" subtitle="Nacionalidades · período seleccionado" rows={rows('Nacionalidades')} labelKey="Nacionalidad" valueKey="Pasajeros" /></div>
      </> : <>
        {view === 'passengers' && <div className="dash-demographics"><ReportChart title="Nacionalidades" subtitle="Pasajeros coincidentes con los filtros" rows={rows('Nacionalidades')} labelKey="Nacionalidad" valueKey="Pasajeros" /><ReportChart title="Edad al viajar" subtitle="Calculada a la fecha de excursión" rows={rows('Edades a la fecha de excursión')} labelKey="Edad" valueKey="Pasajeros" /></div>}
        <div className="dash-section-select"><label>Explorar<select aria-label="Detalle del Dashboard" value={section || sectionGroups[view][0]} onChange={(e) => setSection(e.target.value)}>{sectionGroups[view].map((title) => <option key={title}>{title}</option>)}</select></label><span>{currency} · Todos los resultados disponibles en Excel</span></div>
        <ReportTable key={`${data.generatedAt}:${section}`} title={section || sectionGroups[view][0]} rows={rows(section || sectionGroups[view][0])} money={money} />
      </>}
      <footer className="dash-data-footer"><div><span className="dash-data-dot" />Actualizado {adminTimeLabel(data.generatedAt)}<span>·</span><span>{data.filters.from ? adminDateLabel(data.filters.from) : 'Inicio'} — {data.filters.to ? adminDateLabel(data.filters.to) : 'Sin límite'}</span></div><button onClick={() => setCriteria(!criteria)} aria-expanded={criteria}><Info size={13} />Cómo leer estos datos<CaretDown size={11} /></button></footer>
      {(criteria || data.summary.incompleteCosts > 0 || data.summary.missingNationality > 0 || data.summary.missingAge > 0) && <div className="dash-data-quality">{(data.summary.incompleteCosts > 0 || data.summary.missingNationality > 0 || data.summary.missingAge > 0) && <p>{data.summary.incompleteCosts} reservas con costos o comisiones por completar · {data.summary.missingNationality} pasajeros sin nacionalidad · {data.summary.missingAge} pasajeros sin edad informada.</p>}{criteria && <><p>El margen es lo vendido menos los costos, comisiones y gastos de cada reserva. No es la ganancia final del negocio: no incluye gastos generales que no estén asociados a una reserva. Cada moneda se muestra por separado.</p><p>Al filtrar por edad o nacionalidad, los importes incluyen la reserva completa si al menos un pasajero coincide. El total de pasajeros cuenta solo las coincidencias. Las reservas pendientes y canceladas no se incluyen, salvo que las selecciones.</p><p>Los pagos a proveedores se muestran según el día en que se pagaron. El Excel incluye todos los resultados de los filtros aplicados, no solo la vista abierta.</p></>}</div>}
    </div>}
  </div>;
}

function TrendChart({ rows, money }: { rows: ReportRow[]; money: (n: number | null) => string }) {
  rows = rows.map((row) => ({ ...row, Mes: adminReportDate('Mes', row.Mes) }));
  if (!rows.length) return <div className="dash-chart-empty"><TrendUp size={28} /><p>Las ventas del período aparecerán acá.</p></div>;
  const values = rows.map((r) => Number(r.Ventas ?? 0)); const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${rows.length === 1 ? 280 : 28 + index / (rows.length - 1) * 520},${130 - value / max * 100}`).join(' ');
  return <div className="dash-trend-chart"><div className="dash-trend-total"><strong>{money(values.reduce((s, v) => s + v, 0))}</strong><span>Ventas del período</span></div><svg viewBox="0 0 580 155" role="img" aria-label={`Ventas netas mensuales: ${rows.map((r) => `${r.Mes}: ${money(Number(r.Ventas))}`).join('; ')}`}><line x1="20" y1="30" x2="560" y2="30" stroke="#eef1f7" /><line x1="20" y1="80" x2="560" y2="80" stroke="#eef1f7" /><line x1="20" y1="130" x2="560" y2="130" stroke="#e6ebf3" /><polyline points={points} fill="none" stroke="#243c79" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />{values.map((v, i) => <circle key={i} cx={rows.length === 1 ? 280 : 28 + i / (rows.length - 1) * 520} cy={130 - v / max * 100} r="3" fill="#243c79"><title>{String(rows[i].Mes)}: {money(v)}</title></circle>)}</svg><div className="dash-chart-labels"><span>{String(rows[0].Mes)}</span><span>Mes · importes en la moneda seleccionada</span><span>{String(rows.at(-1)?.Mes)}</span></div></div>;
}
function ReportChart({ title, subtitle, rows, labelKey, valueKey }: { title: string; subtitle: string; rows: ReportRow[]; labelKey: string; valueKey: string }) {
  const visible = rows.slice(0, 6); const total = rows.reduce((sum, r) => sum + Number(r[valueKey]), 0); const maximum = Math.max(1, ...visible.map((r) => Number(r[valueKey])));
  return <section className="dash-panel dash-bars"><div className="dash-panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span>{total} pasajeros</span></div>{!visible.length ? <p className="dash-empty">Sin datos para este período.</p> : <div className="dash-bars-list">{visible.map((r, index) => <div key={index}><div className="dash-bar-label"><span>{r[labelKey]}</span><strong>{r[valueKey]}<small>{total ? Math.round(Number(r[valueKey]) / total * 100) : 0}%</small></strong></div><div className="dash-bar-track" role="img" aria-label={`${r[labelKey]}: ${r[valueKey]} pasajeros`}><div style={{ width: `${Number(r[valueKey]) / maximum * 100}%` }} /></div></div>)}</div>}</section>;
}
function ReportTable({ title, rows, money, columns, onExpand }: { title: string; rows: ReportRow[]; money: (n: number | null) => string; columns?: string[]; onExpand?: () => void }) {
  rows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, adminReportDate(key, value)])));
  const [page, setPage] = useState(0); const keys = columns ?? [...new Set(rows.flatMap(Object.keys))]; const max = Math.max(1, Math.ceil(rows.length / 15));
  return <section className="dash-panel dash-table"><header className="dash-panel-heading"><div><h2>{title}</h2><p>{rows.length} resultados{onExpand ? ' destacados' : ' · consulta aplicada'}</p></div>{onExpand && <button onClick={onExpand} aria-label={`Ver todo: ${title}`}><ArrowUpRight size={17} /></button>}</header>{!rows.length ? <p className="dash-empty">No hay resultados para estos filtros.</p> : <div className="dash-table-scroll"><table><thead><tr>{keys.map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.slice(page * 15, page * 15 + 15).map((row, i) => <tr key={i}>{keys.map((key, j) => <td key={key} className={j === 0 ? 'dash-table-primary' : undefined} title={row[key] === null ? 'Faltan datos para calcular este importe' : undefined}>{row[key] === null ? '—' : typeof row[key] === 'number' && monetary(key) ? money(Number(row[key])) : translated[String(row[key])] ?? row[key]}</td>)}</tr>)}</tbody></table></div>}{max > 1 && <footer className="dash-table-pagination"><span>{page * 15 + 1}–{Math.min((page + 1) * 15, rows.length)} de {rows.length}</span><div><Button variant="outline" size="sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</Button><span>{page + 1} / {max}</span><Button variant="outline" size="sm" disabled={page + 1 >= max} onClick={() => setPage(page + 1)}>Siguiente</Button></div></footer>}</section>;
}
