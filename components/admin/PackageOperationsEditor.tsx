'use client';
import { useEffect, useState } from 'react';
import { operationsFetch } from '@/lib/operations/client';
import { EMPTY_RULE, type Counterparty } from '@/lib/operations/types';
import type { PackageOperationsFormValue } from '@/lib/operations/schemas';
import CommissionRuleEditor from './CommissionRuleEditor';
import { Button } from '@/components/ui/button';

export default function PackageOperationsEditor({ value, onChange }: { value: PackageOperationsFormValue; onChange: (value: PackageOperationsFormValue) => void }) {
  const [parties, setParties] = useState<Counterparty[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { operationsFetch<{ counterparties: Counterparty[] }>('/api/admin/counterparties').then((d) => setParties(d.counterparties)).catch((e) => setError(e.message)); }, []);
  return <section className="space-y-5 rounded-xl border bg-white p-5">
    <h2 className="text-lg font-semibold">Comisiones de hoteles y costos de proveedores</h2>
    <p className="text-sm text-gray-500">Estos cambios se aplican a nuevas reservas, no a las existentes. Los servicios adicionales no generan comisión.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
     {value.hotels.map((row, index) => <div key={row.hotelId || index} className="space-y-3 border-b pb-4">
      <div className="flex gap-3"><select aria-label="Hotel comisionista" className="h-10 flex-1 rounded border px-2" value={row.hotelId} onChange={(e) => onChange({ ...value, hotels: value.hotels.map((r, i) => i === index ? { ...r, hotelId: e.target.value } : r) })}><option value="">Seleccioná hotel</option>{parties.filter((p) => p.kind === 'hotel' && (p.active || p.id === row.hotelId) && (!value.hotels.some((h, i) => i !== index && h.hotelId === p.id))).map((p) => <option key={p.id} value={p.id}>{p.name}{!p.active ? ' (inactivo)' : ''}</option>)}</select><Button type="button" variant="outline" onClick={() => onChange({ ...value, hotels: value.hotels.filter((_, i) => i !== index) })}>Quitar</Button></div>
        <div className="grid gap-3 md:grid-cols-2">{([['cash', 'efectivo', 'Efectivo'], ['deposit', 'depósito / transferencia', 'Depósito / transferencia'], ['creditCard', 'tarjeta de crédito', 'Tarjeta de crédito']] as const).map(([key, label, editorLabel]) => { const rule = row[key]; return <div key={key} className="space-y-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule === null} onChange={(e) => onChange({ ...value, hotels: value.hotels.map((r, i) => i === index ? { ...r, [key]: e.target.checked ? null : { ...EMPTY_RULE } } : r) })} />Usar comisión de {label} del hotel</label>{rule && <CommissionRuleEditor label={editorLabel} value={rule} onChange={(nextRule) => onChange({ ...value, hotels: value.hotels.map((r, i) => i === index ? { ...r, [key]: nextRule } : r) })} />}</div>; })}</div>
    </div>)}
     <Button type="button" variant="outline" onClick={() => onChange({ ...value, hotels: [...value.hotels, { hotelId: '', cash: null, deposit: null, creditCard: null }] })}>Agregar condición por hotel</Button>
    <h3 className="font-semibold">Proveedores y costos acordados</h3>
    {value.providers.map((row, index) => <div key={row.providerId || index} className="space-y-3 border-b pb-4"><div className="flex gap-3"><select aria-label="Proveedor" className="h-10 flex-1 rounded border px-2" value={row.providerId} onChange={(e) => onChange({ ...value, providers: value.providers.map((r, i) => i === index ? { ...r, providerId: e.target.value } : r) })}><option value="">Seleccioná proveedor</option>{parties.filter((p) => p.kind === 'provider' && (p.active || p.id === row.providerId) && !value.providers.some((r, i) => i !== index && r.providerId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><Button type="button" variant="outline" onClick={() => onChange({ ...value, providers: value.providers.filter((_, i) => i !== index) })}>Quitar</Button></div><CommissionRuleEditor label="Costo del servicio" value={row.rule} onChange={(rule) => onChange({ ...value, providers: value.providers.map((r, i) => i === index ? { ...r, rule } : r) })} /></div>)}
    <Button type="button" variant="outline" onClick={() => onChange({ ...value, providers: [...value.providers, { providerId: '', rule: { ...EMPTY_RULE, type: 'per_person' } }] })}>Agregar proveedor</Button>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.costsComplete} onChange={(e) => onChange({ ...value, costsComplete: e.target.checked })} />Confirmo que todos los costos operativos están cargados (permite calcular el margen).</label>
  </section>;
}
