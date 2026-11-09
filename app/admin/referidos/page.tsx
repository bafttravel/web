'use client';

import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminPagination from '@/components/admin/AdminPagination';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db, getAuthInstance } from '@/lib/firebase';
import type { Vendor } from '@/types/vendor';
import type { Reservation } from '@/components/landing-reserva/types';
import { moneyTotalsLabel } from '@/lib/operations/currency';
import { referralStatuses } from '@/lib/admin/referrals';
import ReferralReservationsTable from '@/components/admin/ReferralReservationsTable';

export default function ReferidosPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [reservas, setReservas] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'accrued' | 'paid' | 'cancelled'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const vSnap = await getDocs(query(collection(db, 'vendors'), orderBy('name', 'asc')));
        const vList = vSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Vendor[];
        setVendors(vList);
        const rSnap = await getDocs(query(collection(db, 'reservas'), orderBy('createdAt', 'desc')));
        const rList = rSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Reservation[];
        setReservas(rList.filter(r => r.referredBy));
      } catch {
        toast.error('No se pudieron cargar datos');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = reservas;
    if (vendorFilter !== 'all') {
      list = list.filter(r => r.referredBy?.vendorId === vendorFilter);
    }
    if (statusFilter !== 'all') {
      list = list.filter(r => r.referredBy?.payoutStatus === statusFilter);
    }
    const t = searchTerm.trim().toLowerCase();
    if (t) {
      list = list.filter(r =>
        (r.customerEmail ?? '').toLowerCase().includes(t) ||
        (r.customerName ?? '').toLowerCase().includes(t) ||
        (r.packageTitle ?? r.experienceTitle ?? '').toLowerCase().includes(t)
      );
    }
    return list;
  }, [reservas, vendorFilter, statusFilter, searchTerm]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const totals = useMemo(() => {
    const totalSales = moneyTotalsLabel(filtered.map((r) => ({ amount: r.amountTotal, currency: r.currency })));
    const totalCommissions = moneyTotalsLabel(filtered.map((r) => ({ amount: r.referredBy?.commissionAmount, currency: r.referredBy?.commissionCurrency })));
    return { totalSales, totalCommissions };
  }, [filtered]);

  const markPaid = async (ids: string[]) => {
    try {
      const res = await fetch('/api/admin/referidos/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error');
      setReservas(prev => prev.map(r => (ids.includes(r.id) && r.referredBy ? { ...r, referredBy: { ...r.referredBy, payoutStatus: 'paid' } } : r)));
      toast.success('Comisiones marcadas como pagadas');
    } catch {
      toast.error('No se pudo actualizar el estado');
    }
  };

  const [selected, setSelected] = useState<string[]>([]);
  const [repairing, setRepairing] = useState(false);
  const repairSales = async () => {
    const user = getAuthInstance().currentUser;
    if (!user) return;
    setRepairing(true);
    try {
      const token = await user.getIdToken();
      const call = async (apply: boolean) => {
        const res = await fetch('/api/admin/referidos/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ apply }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Error de servidor');
        return data as { fixed: number };
      };
      const preview = await call(false);
      if (preview.fixed === 0) {
        toast.info('No hay ventas ni comisiones para corregir.');
        return;
      }
      if (!window.confirm(`Se corregirán ${preview.fixed} venta(s): asignación de vendedor en ventas online y estado de la comisión. ¿Continuar?`)) return;
      await call(true);
      toast.success(`${preview.fixed} venta(s) reparadas`);
      window.location.reload();
    } catch (e: any) {
      toast.error(e.message || 'No se pudo reparar');
    } finally {
      setRepairing(false);
    }
  };
  const toggleSel = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const clearSel = () => setSelected([]);

  return (
    <ProtectedRoute>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Comisiones de vendedores</h1>
              <p className="mt-1 text-sm text-gray-600">Reservas con vendedor asignado y comisiones</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={repairing} onClick={repairSales}>{repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reparar ventas y comisiones"}</Button>
        <Button variant="secondary" disabled={!selected.length} onClick={() => markPaid(selected)}>Marcar pagadas</Button>
              {selected.length > 0 && <Button variant="ghost" onClick={clearSel}>Limpiar selección</Button>}
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Buscar por cliente o excursión"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSearchTerm(searchInput);
                    if (e.key === 'Escape') {
                      setSearchInput('');
                      setSearchTerm('');
                    }
                  }}
                  className="w-80"
                />
                {searchInput && (
                  <Button variant="ghost" size="icon" onClick={() => { setSearchInput(''); setSearchTerm(''); }}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setSearchTerm(searchInput)}>Buscar</Button>
              </div>
              <div className="flex items-center gap-3">
                <Select value={vendorFilter} onValueChange={(v) => setVendorFilter(v)}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los vendedores</SelectItem>
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Estado comisión" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {referralStatuses.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  <div className="h-9 w-80 bg-gray-200 rounded-xl animate-pulse" />
                  <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                    <div className="p-4">
                      <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={`ref-row-${i}`} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <ReferralReservationsTable rows={pageItems} selected={selected} onToggle={toggleSel} />
                  <div className="flex items-center justify-between py-3">
                    <div className="text-sm text-gray-600">
                      Total ventas: {totals.totalSales} | Comisiones: {totals.totalCommissions}
                    </div>
                    <AdminPagination
                      currentPage={currentPage}
                      totalItems={filtered.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      onItemsPerPageChange={setItemsPerPage}
                      itemName="reservas"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
