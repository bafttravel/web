'use client';
import { adminDateLabel } from '@/lib/admin/dates';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Cliente } from '@/types';
import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminPagination from '@/components/admin/AdminPagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, X, Mail, Phone, MapPin, Users, Eye } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

const formatDate = (date: Date | { toDate: () => Date } | undefined) => {
  return adminDateLabel(date);
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const fetchClientes = async () => {
    try {
      const q = query(collection(db, 'clientes'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Cliente));
      setClientes(data);
    } catch (error) {
      console.error('Error fetching clientes:', error);
      toast.error('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const clientesFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return clientes;
    const searchLower = searchTerm.toLowerCase().trim();
    return clientes.filter((cliente) => {
      const fullName = `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim().toLowerCase();
      return (
        fullName.includes(searchLower) ||
        cliente.email.toLowerCase().includes(searchLower) ||
        (cliente.telefono && cliente.telefono.toLowerCase().includes(searchLower)) ||
        (cliente.ciudad && cliente.ciudad.toLowerCase().includes(searchLower)) ||
        (cliente.codigoPostal && cliente.codigoPostal.toLowerCase().includes(searchLower))
      );
    });
  }, [clientes, searchTerm]);

  const clientesPaginados = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return clientesFiltrados.slice(startIndex, endIndex);
  }, [clientesFiltrados, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout>
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="h-6 w-28 bg-gray-200 rounded-md animate-pulse" />
              <div className="h-4 w-60 bg-gray-200 rounded-md animate-pulse" />
            </div>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 p-4 space-y-3">
              <div className="h-9 w-full sm:w-80 bg-gray-200 rounded-xl animate-pulse" />
              <div className="grid gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={`cli-row-${i}`} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Clientes</h1>
            <p className="text-gray-600 mt-1">Usuarios registrados y datos de perfil</p>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por nombre, email o ciudad..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchTerm('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4">
            {clientesPaginados.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                No hay clientes registrados
              </div>
            ) : (
              clientesPaginados.map((cliente) => {
                const fullName = (cliente.nombreCompleto || `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim()).trim();
                return (
                  <div
                    key={cliente.id}
                    className="bg-white rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-lg transition-all p-6"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-gray-900">
                            {fullName || cliente.email}
                          </h3>
                          {cliente.provider && (
                            <Badge
                              variant="outline"
                              className="bg-gray-50 text-gray-700 border-gray-200"
                            >
                              {cliente.provider === 'google' ? 'Google' : 'Email'}
                            </Badge>
                          )}
                          {cliente.cantidadPersonas && (
                            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                              <Users className="h-3 w-3 mr-1" />
                              {cliente.cantidadPersonas} persona{cliente.cantidadPersonas > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-4 w-4" />
                            {cliente.email}
                          </span>
                          {cliente.telefono && (
                            <span className="flex items-center gap-1.5">
                              <Phone className="h-4 w-4" />
                              {cliente.telefono}
                            </span>
                          )}
                          {(cliente.ciudad || cliente.codigoPostal) && (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-4 w-4" />
                              {[cliente.ciudad, cliente.codigoPostal].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span>Registrado: {formatDate(cliente.createdAt)}</span>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/clientes/${cliente.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            Ver detalle
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {clientesFiltrados.length > 0 && (
            <AdminPagination
              currentPage={currentPage}
              totalItems={clientesFiltrados.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="clientes"
            />
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
