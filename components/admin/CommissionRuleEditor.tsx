'use client';
import type { CommissionRule } from '@/lib/operations/types';
import { Input } from '@/components/ui/input';

export default function CommissionRuleEditor({ value, onChange, label }: { value: CommissionRule; onChange: (rule: CommissionRule) => void; label: string }) {
  return <fieldset className="space-y-2 rounded-lg border"><legend className="px-1 text-sm font-medium">{label}</legend>
    <div className="grid gap-2 sm:grid-cols-3">
      <select aria-label={`${label}: tipo`} className="h-10 rounded-md border bg-white px-2 text-sm" value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value as CommissionRule['type'] })}>
        <option value="percent">Porcentaje</option><option value="per_person">Fijo por pasajero</option><option value="per_booking">Fijo por reserva</option>
      </select>
      <Input aria-label={`${label}: valor`} type="number" min="0" max={value.type === 'percent' ? 100 : undefined} step="0.01" value={value.value} onChange={(e) => onChange({ ...value, value: Number(e.target.value) })} />
      <select aria-label={`${label}: moneda`} disabled={value.type === 'percent'} className="h-10 rounded-md border bg-white px-2 text-sm" value={value.currency} onChange={(e) => onChange({ ...value, currency: e.target.value as CommissionRule['currency'] })}>
        {['ARS', 'USD', 'BRL', 'EUR'].map((c) => <option key={c}>{c}</option>)}
      </select>
    </div>
  </fieldset>;
}
