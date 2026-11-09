import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardAdmin } from '@/lib/vendor-admin';
import { readOperationsData } from '@/lib/operations/server';
import { buildReport } from '@/lib/operations/reports';
import { excelWorkbook } from '@/lib/operations/excel';
import { buildFinancialDashboard } from '@/lib/operations/finance';
import { dateKey, reservationFinancials } from '@/lib/operations/calculations';
import { paymentMethodLabel } from '@/lib/operations/labels';
import { currencyCode, currencyWarning } from '@/lib/operations/currency';
import { salesChannelValues, salesChannelLabel } from '@/lib/admin/sales-channels';

export const runtime = 'nodejs';
export const maxDuration = 60;
const date = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v), z.literal('')]);
const schema = z.object({
  from: date.default(''), to: date.default(''), dateBy: z.enum(['sale', 'departure', 'payment']).default('sale'),
  currency: z.enum(['ARS', 'USD', 'BRL', 'EUR']).default('ARS'), packageId: z.string().default(''), nationality: z.string().default(''),
  age: z.string().default(''), vendorId: z.string().default(''), hotelId: z.string().default(''), providerId: z.string().default(''), method: z.string().default(''), status: z.enum(['', 'reserved', 'completed', 'pending', 'cancelled']).default(''),
  channel: z.enum(['', ...salesChannelValues]).default(''),
}).refine((v) => !v.from || !v.to || v.from <= v.to, 'El rango de fechas es inválido');
export async function GET(request: Request) {
  const guard = await guardAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const url = new URL(request.url);
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Revisá los filtros y el rango de fechas' }, { status: 400 });
  try {
    const data = await readOperationsData(guard.db);
    const report = buildReport(data, parsed.data);
    if (url.searchParams.get('format') === 'xlsx') {
      const summary = [{ Indicador: 'Reservas', Cantidad: report.summary.reservations, Importe: null }, { Indicador: 'Pasajeros coincidentes', Cantidad: report.summary.passengers, Importe: null }, { Indicador: 'Ventas netas', Cantidad: null, Importe: report.summary.sales }, { Indicador: 'Cobros netos', Cantidad: null, Importe: report.summary.collected }, { Indicador: 'Margen operativo', Cantidad: null, Importe: report.summary.margin }];
      const warning = currencyWarning(report.currencyIssues);
      if (warning) summary.push({ Indicador: warning, Cantidad: null, Importe: null });
      const f = report.filters;
      const display: Record<string, string> = { ...Object.fromEntries(salesChannelValues.map((value) => [value, salesChannelLabel(value)])), reserved: 'Reservada', completed: 'Completada', pending: 'Pendiente', cancelled: 'Cancelada' };
      const sections = report.sections.map((s) => ({ ...s, rows: s.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === 'Método' ? paymentMethodLabel(String(value)) : (key === 'Estado' || s.title === 'Canales de venta' && key === 'Nombre') ? display[String(value)] ?? value : value]))) }));
      const buffer = await excelWorkbook([{ title: 'Resumen', rows: summary }, ...sections], { Desde: f.from, Hasta: f.to, 'Fecha utilizada': { sale: 'Venta', departure: 'Excursión', payment: 'Cobro' }[f.dateBy], Moneda: f.currency, Excursión: data.packages.find((p) => p.id === f.packageId)?.titulo || 'Todas', Nacionalidad: f.nationality || 'Todas', Edad: f.age || 'Todas', Vendedor: data.reservations.find((r) => r.referredBy?.vendorId === f.vendorId)?.referredBy?.vendorName || 'Todos', Hotel: data.counterparties.find((p) => p.id === f.hotelId)?.name || 'Todos', Proveedor: data.counterparties.find((p) => p.id === f.providerId)?.name || 'Todos', 'Medio de pago': f.method ? paymentMethodLabel(f.method) : 'Todos', Estado: display[f.status] || 'Confirmadas y completadas', Canal: display[f.channel] || 'Todos', 'Generado el': report.generatedAt, 'Cómo leer el margen': 'Ventas menos costos, comisiones y gastos de cada reserva. No es la ganancia final del negocio. Si faltan datos, queda vacío.', 'Filtros de pasajeros': 'Los importes incluyen la reserva completa si al menos un pasajero coincide. El total de pasajeros cuenta solo las coincidencias.', 'Pagos a proveedores': 'Se muestran según el día en que se pagaron, no el día de venta o excursión.' });
      return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="BAFT-reportes.xlsx"', 'Cache-Control': 'private, no-store' } });
    }
    const vendors = [...new Map(data.reservations.filter((r) => r.referredBy).map((r) => [r.referredBy!.vendorId, { id: r.referredBy!.vendorId, name: r.referredBy!.vendorName }])).values()];
    const nationalities = [...new Set(data.reservations.flatMap((r) => [r.customerCountry || 'Sin informar', ...(r.passengerDetails ?? []).map((p) => p.nationality || 'Sin informar')]))].sort();
    const current = data.reservations.filter((r) => currencyCode(r.currency) === parsed.data.currency && r.status !== 'cancelled');
    const today = dateKey(new Date());
    const attention = { pendingPayments: current.filter((r) => { const f = reservationFinancials(r, data.payments, data.ledger); return f.gross > f.netPaid; }).length, missingPickup: current.filter((r) => (r.date >= today || r.date === 'sin-fecha') && !r.operations?.pickupAddress).length, departuresToday: current.filter((r) => r.date === today).length };
    return NextResponse.json({ ...report, attention, position: buildFinancialDashboard(data, parsed.data.currency).totals, options: { packages: data.packages.map((p) => ({ id: p.id, name: String(p.titulo ?? p.id) })), counterparties: data.counterparties.map((p) => ({ id: p.id, name: p.name, kind: p.kind })), vendors, nationalities, methods: [...new Set(data.payments.map((p) => p.method))].sort() } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) { console.error('[reportes]', e); return NextResponse.json({ error: 'No se pudieron calcular los reportes. No se muestran totales parciales.' }, { status: 500 }); }
}
