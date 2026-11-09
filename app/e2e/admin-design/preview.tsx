'use client';

import { useMemo, useState } from 'react';
import { AdminWorkspace } from '@/components/admin/AdminLayout';
import BusinessReports, { initialDashboardFilters, type DashboardData } from '@/components/admin/BusinessReports';
import CounterpartiesManager from '@/components/admin/CounterpartiesManager';
import FinanceManager, { type FinanceData } from '@/components/admin/FinanceManager';
import { buildReport, type ReportData, type ReportFilters } from '@/lib/operations/reports';
import { buildFinancialDashboard } from '@/lib/operations/finance';
import { EMPTY_RESERVATION_OPERATIONS, type Counterparty, type PaymentRecord } from '@/lib/operations/types';
import type { BusinessReservation } from '@/lib/operations/calculations';
import ReferralReservationsTable, { type ReferralTableRow } from '@/components/admin/ReferralReservationsTable';
import { referralStatuses } from '@/lib/admin/referrals';
import DatePickersPreview from './datepickers';
import UploadsPreview from './uploads';
import ManualReservationPreview from './manual-reservation';
import ReservationFormPreview from './reservation-form';
import VoucherPreview from './voucher';

function fixtureData(): ReportData {
  const now = new Date();
  const base = { taxId: '', active: true, email: 'contacto@example.test', phone: '+54 000 000 0000', contact: 'Contacto de prueba', address: 'Dirección de prueba', notes: '', commissions: { cash: { type: 'percent' as const, value: 10, currency: 'ARS' as const }, bank: { type: 'percent' as const, value: 12, currency: 'ARS' as const } } };
  const counterparties: Counterparty[] = [
    { ...base, id: 'fixture-h1', kind: 'hotel', name: 'Hotel Lago Austral' },
    { ...base, id: 'fixture-h2', kind: 'hotel', name: 'Patagonia Suites' },
    { ...base, id: 'fixture-h3', kind: 'hotel', name: 'Hostería del Bosque' },
    { ...base, id: 'fixture-h4', kind: 'hotel', name: 'Estancia del Sur', active: false },
    { ...base, id: 'fixture-p1', kind: 'provider', name: 'Navegaciones del Sur' },
    { ...base, id: 'fixture-p2', kind: 'provider', name: 'Guías de la Patagonia' },
  ];
  const packages = [{ id: 'fixture-x1', titulo: 'Perito Moreno' }, { id: 'fixture-x2', titulo: 'Todo Glaciares' }, { id: 'fixture-x3', titulo: 'El Chaltén' }, { id: 'fixture-x4', titulo: 'Safari náutico' }];
  const reservations: BusinessReservation[] = []; const payments: PaymentRecord[] = [];
  for (let i = 0; i < 32; i++) {
    const monthOffset = Math.floor(i / 8);
    const date = new Date(now.getFullYear(), now.getMonth() - monthOffset, Math.min(now.getDate(), i % 5 + 1));
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const amount = (120000 + i % 6 * 18000) * 100;
    const hotel = counterparties[i % 3]; const pkg = packages[i % 4];
     reservations.push({ id: `fixture-r${i}`, reservationCode: `DEMO-${1000 + i}`, packageId: pkg.id, packageTitle: pkg.titulo, date: iso, createdAt: iso, people: 2, amountTotal: amount, baseSubtotalAmount: amount, currency: 'ARS', status: 'reserved', customerName: `Pasajero de prueba ${i + 1}`, customerEmail: `pasajero${i}@example.test`, customerCountry: ['Argentina', 'Brasil', 'Chile', 'España'][i % 4], customerBirthDate: '1991-04-03', passengerDetails: [{ firstName: 'Acompañante', lastName: 'de prueba', birthDate: '1988-06-12', nationality: ['Argentina', 'Brasil', 'Chile'][i % 3] }], referredBy: { vendorId: 'fixture-v1', vendorName: 'Vendedor de prueba', commissionAmount: 400000, commissionCurrency: 'ARS' }, operations: { ...EMPTY_RESERVATION_OPERATIONS, version: 1, sellerHotelId: hotel.id, commissionMethod: (['cash', 'transfer', 'card'] as const)[i % 3], sellerHotelName: hotel.name, pickupHotelName: hotel.name, pickupHotelId: hotel.id, pickupType: 'hotel', pickupAddress: hotel.address, channel: i % 2 ? 'whatsapp' : 'web', commissions: hotel.commissions, providers: [{ providerId: 'fixture-p1', name: 'Navegaciones del Sur', rule: { type: 'per_person', value: 16000, currency: 'ARS' } }], costsComplete: true, serviceExecuted: true } });
    payments.push({ id: `fixture-payment${i}`, reservationId: `fixture-r${i}`, amount: i % 5 === 0 ? Math.round(amount / 2) : amount, currency: 'ARS', method: i % 2 ? 'transfer' : 'cash', status: 'paid', occurredAt: iso, createdAt: iso });
  }
  const ledger = [
    { id: 'fixture-ledger-provider', kind: 'provider_payment' as const, reservationId: 'fixture-r1', counterpartyId: 'fixture-p1', amount: 100000 },
    { id: 'fixture-ledger-hotel', kind: 'hotel_payment' as const, reservationId: 'fixture-r2', counterpartyId: 'fixture-h3', amount: 50000 },
    { id: 'fixture-ledger-receipt', kind: 'hotel_receipt' as const, reservationId: 'fixture-r0', counterpartyId: 'fixture-h1', amount: 500000 },
  ].map((e) => ({ ...e, currency: 'ARS' as const, method: 'transfer', note: 'Movimiento de prueba', occurredAt: `${reservations[0].date}T12:00:00-03:00`, recordedBy: 'demo@example.test', receiptUrl: '', reversalOf: '' }));
  return { reservations, payments, ledger, counterparties, packages };
}

export default function AdminDesignPreview({ screen, legacy }: { screen: 'dashboard' | 'hotels' | 'providers' | 'finance' | 'commissions' | 'datepickers' | 'uploads' | 'manual-reservation' | 'reservation-form' | 'voucher'; legacy?: 'referral' | 'currencies' }) {
  const [selected, setSelected] = useState<string[]>([]);
  const data = useMemo(() => {
    const fixture = fixtureData();
    if (legacy === 'referral') Reflect.deleteProperty(fixture.reservations[1].referredBy!, 'commissionCurrency');
    if (legacy === 'currencies') {
      Reflect.deleteProperty(fixture.reservations[0], 'currency');
      Reflect.deleteProperty(fixture.payments[1], 'currency');
    }
    return fixture;
  }, [legacy]);
  const defaults = initialDashboardFilters(); const from = new Date(); from.setMonth(from.getMonth() - 3); from.setDate(1); defaults.from = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`;
  const load = async (filters: ReportFilters): Promise<DashboardData> => ({ ...buildReport(data, filters), attention: { pendingPayments: 7, missingPickup: 3, departuresToday: 4 }, position: buildFinancialDashboard(data, filters.currency).totals, options: { packages: data.packages.map((p) => ({ id: p.id, name: String(p.titulo) })), counterparties: data.counterparties.map((p) => ({ id: p.id, name: p.name, kind: p.kind })), vendors: [{ id: 'fixture-v1', name: 'Vendedor de prueba' }], nationalities: ['Argentina', 'Brasil', 'Chile', 'España'], methods: ['cash', 'transfer'] } });
  const loadParties = async () => ({ counterparties: data.counterparties });
  const loadFinance = async (currency: string): Promise<FinanceData> => { const dashboard = buildFinancialDashboard(data, currency); return { obligations: dashboard.obligations, balances: dashboard.balances, currencyIssues: dashboard.currencyIssues, totals: dashboard.totals, currency, reservations: data.reservations.map((r) => ({ id: r.id, name: `${r.reservationCode} · ${r.packageTitle}`, hotelId: r.operations?.sellerHotelId ?? '' })), counterparties: data.counterparties.map((p) => ({ id: p.id, name: p.name, kind: p.kind })), ledger: data.ledger.filter((e) => e.currency === currency) }; };
  const pathname = screen === 'dashboard' ? '/admin' : screen === 'hotels' ? '/admin/hoteles' : screen === 'providers' ? '/admin/proveedores' : screen === 'commissions' ? '/admin/referidos' : '/admin/pagos';
  if (screen === 'datepickers') return <div className="admin-scope"><AdminWorkspace pathname="/admin" email="demo@example.test" preview><DatePickersPreview /></AdminWorkspace></div>;
  if (screen === 'uploads') return <div className="admin-scope"><AdminWorkspace pathname="/admin" email="demo@example.test" preview><UploadsPreview /></AdminWorkspace></div>;
  if (screen === 'manual-reservation') return <div className="admin-scope"><AdminWorkspace pathname="/admin/ventas/nueva" email="demo@example.test" preview><ManualReservationPreview /></AdminWorkspace></div>;
  if (screen === 'reservation-form') return <div className="admin-scope"><AdminWorkspace pathname="/admin/ventas/nueva" email="demo@example.test" preview><ReservationFormPreview /></AdminWorkspace></div>;
  if (screen === 'voucher') return <div className="admin-scope"><AdminWorkspace pathname="/admin/ventas/fixture-voucher" email="demo@example.test" preview><VoucherPreview /></AdminWorkspace></div>;
  if (screen === 'commissions') {
    const dates = [{ seconds: Date.parse('2026-10-15T12:00:00Z') / 1000 }, '2026-10-15T12:00:00Z', { _seconds: Date.parse('2026-10-07T12:00:00Z') / 1000 }, new Date('2026-09-19T12:00:00Z'), undefined, 'invalid'];
    const rows: ReferralTableRow[] = data.reservations.slice(0, 6).map((r, index) => ({
      id: r.id, packageTitle: r.packageTitle, experienceTitle: '', customerName: r.customerName ?? '', customerEmail: r.customerEmail ?? '', amountTotal: r.amountTotal, currency: r.currency,
      createdAt: dates[index], referredBy: { vendorId: 'fixture-v1', vendorName: 'Vendedor de prueba', commissionAmount: 400000, commissionCurrency: index === 3 ? undefined : 'ars', payoutStatus: referralStatuses[index]?.value },
    }));
    return <div className="admin-scope"><AdminWorkspace pathname={pathname} email="demo@example.test" preview><div className="space-y-6"><header className="admin-page-heading"><h1>Comisiones de vendedores</h1><p>Reservas con vendedor asignado y comisiones.</p></header><ReferralReservationsTable rows={rows} selected={selected} onToggle={(id) => setSelected((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id])} /></div></AdminWorkspace></div>;
  }
  return <div className="admin-scope"><AdminWorkspace pathname={pathname} email="demo@example.test" preview>{screen === 'dashboard' ? <BusinessReports loader={load} initialFilters={defaults} preview /> : screen === 'finance' ? <FinanceManager loader={loadFinance} preview /> : <CounterpartiesManager kind={screen === 'hotels' ? 'hotel' : 'provider'} loader={loadParties} preview />}</AdminWorkspace></div>;
}
