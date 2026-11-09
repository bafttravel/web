'use client';
import { adminDateLabel } from '@/lib/admin/dates';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Cliente } from '@/types';
import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Mail, Phone, MapPin, User, Users } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

const formatDate = (date: Date | { toDate: () => Date } | undefined) => {
  return adminDateLabel(date);
};

export default function ClienteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCliente = async () => {
      try {
        const ref = doc(db, 'clientes', params.id);
        const snapshot = await getDoc(ref);
        if (!snapshot.exists()) {
          toast.error('Cliente no encontrado');
          router.replace('/admin/clientes');
          return;
        }
        const data = snapshot.data() as Cliente;
        setCliente({ ...data, id: snapshot.id });
      } catch (error) {
        console.error('Error fetching cliente:', error);
        toast.error('No pudimos cargar el cliente');
      } finally {
        setLoading(false);
      }
    };

    fetchCliente();
  }, [params.id, router]);

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout>
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-6 w-52 bg-gray-200 rounded-md animate-pulse" />
                <div className="h-4 w-60 bg-gray-200 rounded-md animate-pulse" />
              </div>
              <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={`card-skel-${i}`} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  if (!cliente) {
    return null;
  }

  const fullName =
    cliente.nombreCompleto || [cliente.nombre, cliente.apellido].filter(Boolean).join(' ').trim();

  return (
    <ProtectedRoute>
      <AdminLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Detalle de cliente</h1>
              <p className="text-gray-600 mt-1">Información completa del usuario</p>
            </div>
            <Button asChild variant="outline">
              <Link href="/admin/clientes">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Link>
            </Button>
          </div>

          <Card className="border border-gray-200/80">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>{fullName || cliente.email}</CardTitle>
                <p className="text-sm text-gray-500">Registrado: {formatDate(cliente.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                {cliente.provider && (
                  <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                    {cliente.provider === 'google' ? 'Google' : 'Email'}
                  </Badge>
                )}
                {cliente.cantidadPersonas && (
                  <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                    <Users className="h-3.5 w-3.5 mr-1" />
                    {cliente.cantidadPersonas} persona{cliente.cantidadPersonas > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-gray-600 text-sm">
                  <User className="h-4 w-4" />
                  <span>Nombre</span>
                </div>
                <p className="text-base font-medium text-gray-900">{fullName || 'Sin completar'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-gray-600 text-sm">
                  <Mail className="h-4 w-4" />
                  <span>Email</span>
                </div>
                <p className="text-base font-medium text-gray-900">{cliente.email}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-gray-600 text-sm">
                  <Phone className="h-4 w-4" />
                  <span>Teléfono</span>
                </div>
                <p className="text-base font-medium text-gray-900">{cliente.telefono || 'Sin completar'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-gray-600 text-sm">
                  <MapPin className="h-4 w-4" />
                  <span>Ubicación</span>
                </div>
                <p className="text-base font-medium text-gray-900">
                  {[cliente.ciudad, cliente.codigoPostal].filter(Boolean).join(' · ') || 'Sin completar'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
