'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CommissionRuleEditor from './CommissionRuleEditor';
import { operationsFetch } from '@/lib/operations/client';
import { EMPTY_RULE, type Counterparty } from '@/lib/operations/types';
import { Buildings, Handshake, MagnifyingGlass, Plus, PencilSimple } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const loadCounterparties = () => operationsFetch<{ counterparties: Counterparty[] }>('/api/admin/counterparties');
const normalizeCounterparty = (value: Counterparty): Counterparty => {
  const rates = value.commissions ?? {} as Counterparty['commissions'];
  const legacyBank = rates.bank;
  return { ...value, commissions: { cash: rates.cash ?? { ...EMPTY_RULE }, deposit: rates.deposit ?? legacyBank ?? { ...EMPTY_RULE }, creditCard: rates.creditCard ?? legacyBank ?? rates.deposit ?? { ...EMPTY_RULE } } };
};
export default function CounterpartiesManager({ kind, loader = loadCounterparties, preview = false }: { kind: Counterparty['kind']; loader?: typeof loadCounterparties; preview?: boolean }) {
  const [rows, setRows] = useState<Counterparty[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState<Counterparty | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [baseline, setBaseline] = useState('');
  const openEditor = (value: Counterparty) => { const normalized = normalizeCounterparty(value); setBaseline(JSON.stringify(normalized)); setForm(normalized); };
  const closeEditor = () => { if (!busy && (!form || JSON.stringify(form) === baseline || window.confirm('Tenés cambios sin guardar. ¿Querés descartarlos?'))) setForm(null); };
  const load = useCallback(async () => {
    try { const data = await loader(); setRows(data.counterparties.filter((p) => p.kind === kind).map(normalizeCounterparty)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error de consulta'); }
    finally { setLoading(false); }
  }, [kind, loader]);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    if (!form) return;
    if (preview) { toast.info('Vista de prueba: no se guardan datos'); return; }
    setBusy(true);
    try {
      await operationsFetch('/api/admin/counterparties', { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify(form) });
      toast.success('Datos guardados'); setForm(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al guardar'); } finally { setBusy(false); }
  };
  const filtered = rows.filter((r) => `${r.name} ${r.taxId} ${r.email}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || r.active === (status === 'active'))).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return <div className="admin-directory space-y-6">
    <header className="admin-page-heading flex flex-wrap items-center justify-between gap-4"><div><p className="admin-eyebrow">OPERACIÓN · DIRECTORIO</p><h1>{kind === 'hotel' ? 'Hoteles' : 'Proveedores'}</h1><p>Contactos y condiciones comerciales.</p></div>
      <Button onClick={() => openEditor({ id: '', kind, name: '', taxId: '', active: true, email: '', phone: '', contact: '', address: '', notes: '', commissions: { cash: { ...EMPTY_RULE }, deposit: { ...EMPTY_RULE }, creditCard: { ...EMPTY_RULE } } })}><Plus size={15} />{kind === 'hotel' ? 'Nuevo hotel' : 'Nuevo proveedor'}</Button></header>
    <div className="admin-directory-summary"><span>{kind === 'hotel' ? <Buildings size={19} /> : <Handshake size={19} />}{rows.length} {kind === 'hotel' ? 'hoteles' : 'proveedores'}</span><span>{rows.filter((r) => r.active).length} activos</span><span>{rows.filter((r) => !r.active).length} inactivos</span></div>
    {error && <p role="alert" className="text-red-700">{error} <button className="underline" onClick={() => void load()}>Reintentar</button></p>}
    <div className="admin-directory-toolbar"><div className="admin-search-input"><MagnifyingGlass size={16} /><Input aria-label={kind === 'hotel' ? 'Buscar hoteles' : 'Buscar proveedores'} placeholder="Buscar por razón social, CUIT o email…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select><span>{filtered.length} resultados</span></div>
    <Dialog open={!!form} onOpenChange={(open) => { if (!open) closeEditor(); }}><DialogContent className="admin-directory-dialog"><DialogHeader><DialogTitle>{form?.id ? 'Editar' : 'Nuevo'} {kind === 'hotel' ? 'hotel' : 'proveedor'}</DialogTitle><DialogDescription>Los cambios de tarifas no modifican las reservas existentes.</DialogDescription></DialogHeader>{form && <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-4 md:grid-cols-2">{(['name', 'taxId', 'email', 'phone', 'contact', 'address'] as const).map((key) => <div key={key}><Label htmlFor={`party-${key}`}>{{ name: 'Razón social', taxId: 'CUIT', email: 'Email', phone: 'Teléfono', contact: 'Contacto', address: 'Dirección' }[key]}</Label><Input id={`party-${key}`} type={key === 'email' ? 'email' : 'text'} required={key === 'name'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}</div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Activo</label>
       {kind === 'hotel' && <div className="grid gap-4 md:grid-cols-2">{([['cash', 'Comisión efectivo'], ['deposit', 'Comisión depósito / transferencia'], ['creditCard', 'Comisión tarjeta de crédito']] as const).map(([key, label]) => <CommissionRuleEditor key={key} label={label} value={form.commissions[key] ?? { ...EMPTY_RULE }} onChange={(rule) => setForm({ ...form, commissions: { ...form.commissions, [key]: rule } })} />)}</div>}
      <div><Label htmlFor="party-notes">Observaciones</Label><textarea id="party-notes" className="w-full rounded-md border p-2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="admin-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={closeEditor}>Cancelar</Button><Button disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar cambios'}</Button></div>
    </form>}</DialogContent></Dialog>
    <div className="admin-data-table overflow-x-auto"><table><thead><tr>{['Razón social', 'CUIT', 'Contacto', 'Teléfono', 'Estado', ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{filtered.map((r) => <tr key={r.id}><td><span className="admin-directory-name">{r.name}</span><span className="admin-cell-secondary">{r.address || 'Sin dirección cargada'}</span></td><td>{r.taxId || '—'}</td><td>{r.contact || '—'}<span className="admin-cell-secondary">{r.email || 'Sin email'}</span></td><td>{r.phone || '—'}</td><td><span className="admin-status-label" data-active={r.active}><span />{r.active ? 'Activo' : 'Inactivo'}</span></td><td><Button variant="ghost" aria-label={`Editar ${r.name}`} onClick={() => openEditor(structuredClone(r))}><PencilSimple size={14} />Editar</Button></td></tr>)}</tbody></table>{loading ? <p className="dash-empty" role="status">Cargando directorio…</p> : !filtered.length && <div className="admin-empty-state">{kind === 'hotel' ? <Buildings size={26} /> : <Handshake size={26} />}<h2>{query ? 'No encontramos coincidencias' : 'Tu directorio empieza acá'}</h2><p>{query ? 'Probá otro nombre o cambiá el filtro de estado.' : `Agregá tu primer ${kind === 'hotel' ? 'hotel' : 'proveedor'} para vincularlo con excursiones y reservas.`}</p></div>}</div>
  </div>;
}
