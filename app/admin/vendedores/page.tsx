'use client';

import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Vendor } from '@/types/vendor';
import { currencyCode } from '@/lib/operations/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Search, X, CheckCircle2, XCircle, Edit, Trash2, Mail, KeyRound, UserX, UserCheck, Copy, MoreHorizontal, ExternalLink } from 'lucide-react';
import AdminPagination from '@/components/admin/AdminPagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { getAuthInstance } from '@/lib/firebase';

export default function VendedoresPage() {
  const normalizeDni = (value: string) => value.replace(/\D+/g, '').trim();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState<{ name: string; email: string; dni: string; active: 'true' | 'false'; type: 'percent' | 'fixed'; value: number; currency: 'ars' | 'brl' | 'usd' }>({
    name: '',
    email: '',
    dni: '',
    active: 'true',
    type: 'percent',
    value: 10,
    currency: 'ars',
  });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'vendors'), orderBy('name', 'asc'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Vendor[];
        setVendors(list);
      } catch (e) {
        toast.error('No se pudo cargar vendedores');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return vendors;
    return vendors.filter(v =>
      v.name.toLowerCase().includes(t) ||
      v.email.toLowerCase().includes(t) ||
      String(v.dni ?? '').includes(t)
    );
  }, [vendors, searchTerm]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', dni: '', active: 'true', type: 'percent', value: 10, currency: 'ars' });
    setFormOpen(true);
  };

  const openEdit = (v: Vendor) => {
    setEditing(v);
    setForm({
      name: v.name,
      email: v.email,
      dni: v.dni ?? '',
      active: v.active ? 'true' : 'false',
      type: v.defaultCommission.type,
      value: v.defaultCommission.value,
      currency: v.defaultCommission.currency,
    });
    setFormOpen(true);
  };

  const getIdToken = async () => {
    const auth = getAuthInstance();
    const cu = auth.currentUser;
    if (!cu) throw new Error('Sesión admin no encontrada');
    return cu.getIdToken();
  };

  const callApi = async (url: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown) => {
    const token = await getIdToken();
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Error de servidor');
    return data;
  };

  const save = async () => {
    const dni = normalizeDni(form.dni);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      dni,
      active: form.active === 'true',
      defaultCommission: {
        type: form.type,
        value: Number(form.value),
        currency: form.currency,
      },
    };
    if (!payload.name || !payload.email || !dni || Number.isNaN(payload.defaultCommission.value)) {
      toast.error('Completá nombre, email, DNI y comisión.');
      return;
    }
    if (!/^\d{7,8}$/.test(dni)) {
      toast.error('El DNI debe tener 7 u 8 dígitos.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const data = await callApi('/api/admin/vendors', 'PATCH', { ...payload, vendorId: editing.id });
        setVendors(prev => prev.map(v => (v.id === editing.id ? { ...v, ...(data.vendor as Vendor) } : v)));
        toast.success('Vendedor actualizado');
      } else {
        const data = await callApi('/api/admin/vendors', 'POST', payload);
        setVendors(prev => [data.vendor as Vendor, ...prev]);
        toast.success('Vendedor creado. Ingresa con su email y su DNI como contraseña.');
      }
      setFormOpen(false);
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const removeVendor = async (id: string) => {
    try {
      const data = await callApi('/api/admin/vendors', 'DELETE', { vendorId: id });
      setVendors(prev => prev.filter(v => v.id !== id));
      toast.success(
        data?.keptReservations
          ? `Vendedor eliminado. Se conservan ${data.keptReservations} ventas históricas.`
          : 'Vendedor eliminado'
      );
    } catch (e: any) {
      toast.error(e.message || 'No se pudo eliminar');
    }
  };

  const callVendorAuth = (action: 'create' | 'reset' | 'disable' | 'enable', v: Vendor) =>
    callApi('/api/admin/vendors/auth', 'POST', { action, vendorId: v.id }) as Promise<{ ok: true; authUid?: string }>;

  const createAuthAndSend = async (v: Vendor) => {
    try {
      const data = await callVendorAuth('create', v);
      setVendors(prev => prev.map(x => x.id === v.id ? { ...x, active: true, authUid: data.authUid ?? x.authUid, mustChangePassword: false } : x));
      toast.success('Acceso creado. La contraseña es el DNI del vendedor.');
    } catch (e: any) {
      toast.error(e.message || 'No se pudo crear el usuario');
    }
  };

  const resetPassword = async (v: Vendor) => {
    try {
      await callVendorAuth('reset', v);
      toast.success('Contraseña restablecida al DNI del vendedor');
    } catch (e: any) {
      toast.error(e.message || 'No se pudo blanquear');
    }
  };

  const toggleActive = async (v: Vendor) => {
    try {
      if (v.active) {
        await callVendorAuth('disable', v);
        setVendors(prev => prev.map(x => x.id === v.id ? { ...x, active: false } : x));
        toast.success('Vendedor deshabilitado');
      } else {
        await callVendorAuth('enable', v);
        setVendors(prev => prev.map(x => x.id === v.id ? { ...x, active: true } : x));
        toast.success('Vendedor habilitado');
      }
    } catch (e: any) {
      toast.error(e.message || 'No se pudo actualizar el estado');
    }
  };

  const getVendorLoginUrl = () => {
    if (typeof window === 'undefined') return '/vendedor/login';
    return `${window.location.origin}/vendedor/login`;
  };

  const openVendorPortal = () => {
    window.open(getVendorLoginUrl(), '_blank', 'noopener,noreferrer');
  };

  const copyVendorLoginUrl = async () => {
    try {
      await navigator.clipboard.writeText(getVendorLoginUrl());
      toast.success('Link de acceso copiado');
    } catch {
      toast.error('No se pudo copiar el link');
    }
  };

  return (
    <ProtectedRoute>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Vendedores</h1>
              <p className="mt-1 text-sm text-gray-600">Gestioná accesos, comisiones y el portal de vendedores.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={openVendorPortal} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Abrir portal
              </Button>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                Nuevo vendedor
              </Button>
            </div>
          </div>
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Buscar por nombre, email o DNI"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSearchTerm(searchInput);
                    if (e.key === 'Escape') {
                      setSearchInput('');
                      setSearchTerm('');
                    }
                  }}
                  className="w-72"
                />
                {searchInput && (
                  <Button variant="ghost" size="icon" onClick={() => { setSearchInput(''); setSearchTerm(''); }}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setSearchTerm(searchInput)}>Buscar</Button>
              </div>
              <div className="flex items-center gap-3">
                <Select value={String(itemsPerPage)} onValueChange={(v) => setItemsPerPage(Number(v))}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Items/página" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 por página</SelectItem>
                    <SelectItem value="20">20 por página</SelectItem>
                    <SelectItem value="50">50 por página</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  <section className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                    <Table className="text-sm">
                      <TableHeader className="[&_tr]:border-black/5">
                        <TableRow className="border-black/5 hover:bg-transparent">
                          <TableHead className="px-4">Nombre</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>DNI</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Comisión</TableHead>
                          <TableHead className="text-right pr-4">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageItems.map((v) => (
                          <TableRow key={v.id} className="border-black/5 hover:bg-black/[0.02]">
                            <TableCell className="px-4">
                              <div className="font-medium text-gray-900">{v.name}</div>
                              <div className="admin-caption mt-0.5 text-gray-500 break-all">
                                {v.email}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-gray-900 break-all">
                                {v.email}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-gray-900">
                                {v.dni || 'Sin cargar'}
                              </div>
                            </TableCell>
                            <TableCell>
                              {v.active ? (
                                <Badge variant="outline" className="gap-1 text-green-700">
                                  <CheckCircle2 className="h-3 w-3" /> Activo
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1 text-gray-600">
                                  <XCircle className="h-3 w-3" /> Inactivo
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-gray-900">
                                {v.defaultCommission.type === 'percent'
                                  ? `${v.defaultCommission.value}%`
                                  : `${v.defaultCommission.value} ${currencyCode(v.defaultCommission.currency) || 'Moneda por completar'}`}
                              </div>
                              <div className="admin-caption text-gray-400">
                                {v.defaultCommission.type === 'percent'
                                  ? 'Porcentaje sobre la venta'
                                  : 'Monto fijo por reserva'}
                              </div>
                            </TableCell>
                            <TableCell className="pr-4">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="rounded-full"
                                  title="Editar vendedor"
                                  onClick={() => openEdit(v)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="rounded-full"
                                      title="Más acciones"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="min-w-[260px] bg-white/90 shadow-lg ring-1 ring-black/10 border border-white/70 backdrop-blur"
                                  >
                                    <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {!v.authUid ? (
                                      <DropdownMenuItem onClick={() => createAuthAndSend(v)}>
                                        <Mail className="h-4 w-4" />
                                        Crear acceso (contraseña = DNI)
                                      </DropdownMenuItem>
                                    ) : (
                                      <>
                                        <DropdownMenuItem onClick={() => resetPassword(v)}>
                                          <KeyRound className="h-4 w-4" />
                                          Restablecer contraseña al DNI
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => toggleActive(v)}>
                                          {v.active ? (
                                            <>
                                              <UserX className="h-4 w-4" />
                                              Deshabilitar
                                            </>
                                          ) : (
                                            <>
                                              <UserCheck className="h-4 w-4" />
                                              Habilitar
                                            </>
                                          )}
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setDeleteId(v.id)}
                                      className="text-red-600 focus:text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Eliminar
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </section>
                  <AdminPagination
                    currentPage={currentPage}
                    totalItems={filtered.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                    itemName="vendedores"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(null); }}>
            <DialogContent className="sm:max-w-[620px] bg-white dark:bg-white rounded-xl border border-gray-200 dark:border-gray-200 shadow-2xl text-gray-900 dark:text-gray-900">
              <DialogHeader>
                <DialogTitle>{editing ? 'Editar vendedor' : 'Nuevo vendedor'}</DialogTitle>
                <DialogDescription>Definí datos básicos y la comisión por defecto. La contraseña de acceso es el DNI.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>DNI</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="30111222"
                      value={form.dni}
                      onChange={(e) => setForm({ ...form, dni: normalizeDni(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Activo</div>
                    <div className="text-xs text-gray-500">Controla el acceso al portal de vendedor</div>
                  </div>
                  <Switch checked={form.active === 'true'} onCheckedChange={(c) => setForm({ ...form, active: c ? 'true' : 'false' })} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de comisión</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as 'percent'|'fixed' })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Porcentaje</SelectItem>
                        <SelectItem value="fixed">Fijo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor</Label>
                    {form.type === 'percent' ? (
                      <div className="flex items-center gap-2">
                        <FormattedAmountInput
                          value={form.value}
                          onChange={(v: number) => setForm({ ...form, value: v })}
                          className="flex-1"
                        />
                        <span className="text-sm text-gray-600">%</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">$</span>
                        <FormattedAmountInput
                          value={form.value}
                          onChange={(v: number) => setForm({ ...form, value: v })}
                          className="flex-1"
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Moneda</Label>
                    <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as any })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Moneda" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ars">ARS</SelectItem>
                        <SelectItem value="brl">BRL</SelectItem>
                        <SelectItem value="usd">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setFormOpen(false); setEditing(null); }}>Cancelar</Button>
                <Button onClick={save} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar vendedor?</AlertDialogTitle>
                <AlertDialogDescription>Se elimina su acceso, su usuario y sus enlaces de referido. Las ventas ya realizadas se conservan en el historial. Esta acción no se puede deshacer.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => { if (deleteId) removeVendor(deleteId); setDeleteId(null); }} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
