'use client';
import { adminDateLabel, adminTimeLabel } from '@/lib/admin/dates';

import { useEffect, useState } from 'react';
import { collection, getDocs, updateDoc, doc, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Consulta } from '@/types';
import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, Mail, Phone, Calendar, Clock, Package, MessageSquare, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import AdminPagination from '@/components/admin/AdminPagination';
import { sanitizePhoneForWhatsApp } from '@/lib/utils/phoneNumber';
import { SITE_NAME } from '@/lib/constants';

export default function ConsultasPage() {
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConsulta, setSelectedConsulta] = useState<Consulta | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const fetchConsultas = async () => {
    try {
      const q = query(collection(db, 'consultas'), orderBy('fechaCreacion', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Consulta));
      setConsultas(data);
    } catch (error) {
      console.error('Error fetching consultas:', error);
      toast.error('Error al cargar consultas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsultas();
  }, []);

  const handleView = async (consulta: Consulta) => {
    setSelectedConsulta(consulta);
    
    // Marcar como leída si no lo está
    if (!consulta.leida && consulta.id) {
      try {
        await updateDoc(doc(db, 'consultas', consulta.id), {
          leida: true,
        });
        fetchConsultas();
      } catch (error) {
        console.error('Error updating consulta:', error);
      }
    }
  };

  const formatDate = (date: Date | { toDate: () => Date } | undefined) => {
    return adminDateLabel(date);
  };

  const formatTime = (date: Date | { toDate: () => Date } | undefined) => {
    return adminTimeLabel(date);
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout>
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="h-6 w-32 bg-gray-200 rounded-md animate-pulse" />
              <div className="h-4 w-60 bg-gray-200 rounded-md animate-pulse" />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={`consulta-skel-${i}`}
                  className="bg-white rounded-lg border border-gray-200/60 p-6 animate-pulse"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="h-4 w-40 bg-gray-200 rounded-md" />
                      <div className="flex gap-2">
                        <div className="h-5 w-16 bg-gray-200 rounded-md" />
                        <div className="h-5 w-24 bg-gray-200 rounded-md" />
                      </div>
                      <div className="h-4 w-3/4 bg-gray-200 rounded-md" />
                      <div className="flex gap-4">
                        <div className="h-4 w-32 bg-gray-200 rounded-md" />
                        <div className="h-4 w-24 bg-gray-200 rounded-md" />
                      </div>
                    </div>
                    <div className="h-8 w-20 bg-gray-200 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  // Calcular paginación
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const consultasPaginadas = consultas.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset a primera página
  };

  return (
    <ProtectedRoute>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Consultas</h1>
            <p className="text-gray-600 mt-1">
              Gestiona las consultas de los clientes
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {consultasPaginadas.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                No hay consultas
              </div>
            ) : (
              consultasPaginadas.map((consulta) => (
                <div
                  key={consulta.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 cursor-pointer border-l-4 border-transparent hover:border-black"
                  onClick={() => handleView(consulta)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-base font-semibold text-gray-900 truncate">
                          {consulta.nombre}
                        </h3>
                        <Badge 
                          variant={consulta.leida ? 'secondary' : 'default'}
                          className={!consulta.leida ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' : ''}
                        >
                          {consulta.leida ? 'Leída' : 'Nueva'}
                        </Badge>
                      </div>
                      
                      {consulta.paquete && (
                        <div className="mb-3">
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                            <Package className="h-3 w-3 mr-1" />
                            {consulta.paquete}
                          </Badge>
                        </div>
                      )}

                      {(consulta.cantidadPersonas || consulta.ciudad || consulta.codigoPostal) && (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 mb-3">
                          {consulta.cantidadPersonas && (
                            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                              {consulta.cantidadPersonas} persona{consulta.cantidadPersonas > 1 ? 's' : ''}
                            </Badge>
                          )}
                          {consulta.ciudad && (
                            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                              {consulta.ciudad}
                            </Badge>
                          )}
                          {consulta.codigoPostal && (
                            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                              CP {consulta.codigoPostal}
                            </Badge>
                          )}
                        </div>
                      )}
                      
                      <div className="flex flex-wrap items-center gap-4 text-base text-gray-600 mb-3">
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-4 w-4" />
                          {consulta.email}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-4 w-4" />
                          {consulta.telefono}
                        </span>
                      </div>
                      
                      <p className="text-base text-gray-700 line-clamp-2 mb-3">
                        {consulta.mensaje}
                      </p>
                      
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(consulta.fechaCreacion)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(consulta.fechaCreacion)}
                        </span>
                      </div>
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleView(consulta);
                      }}
                      className="flex-shrink-0"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Paginación */}
          {consultas.length > 0 && (
            <AdminPagination
              currentPage={currentPage}
              totalItems={consultas.length}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
              itemName="consultas"
            />
          )}
        </div>

        {/* Modal mejorado drásticamente y 100% responsive */}
        <Dialog open={!!selectedConsulta} onOpenChange={() => setSelectedConsulta(null)}>
          <DialogContent 
            className="max-w-[95vw] sm:max-w-2xl lg:max-w-3xl max-h-[95vh] overflow-y-auto p-0 bg-white border-0 shadow-2xl"
            showCloseButton={false}
          >
            {selectedConsulta && (
              <div className="relative bg-white rounded-lg overflow-hidden">
                {/* Header con gradiente */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-700 text-white p-4 sm:p-6 rounded-t-lg">
                  <button
                    onClick={() => setSelectedConsulta(null)}
                    className="absolute top-3 right-3 sm:top-4 sm:right-4 text-white/80 hover:text-white transition-colors z-10"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="flex items-start gap-3 sm:gap-4 pr-8">
                    <div className="bg-white/10 backdrop-blur-sm rounded-full p-2 sm:p-3 flex-shrink-0">
                      <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg sm:text-lg font-bold mb-2 break-words">{selectedConsulta.nombre}</h2>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm sm:text-base text-white/80">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                          <span className="whitespace-nowrap">{formatDate(selectedConsulta.fechaCreacion)}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                          <span className="whitespace-nowrap">{formatTime(selectedConsulta.fechaCreacion)}</span>
                        </span>
                        <Badge 
                          variant={selectedConsulta.leida ? 'secondary' : 'default'}
                          className="bg-white/20 text-white border-white/30 text-sm"
                        >
                          {selectedConsulta.leida ? 'Leída' : 'Nueva'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contenido */}
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                  {/* Paquete consultado - destacado */}
                  {selectedConsulta.paquete && (
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-4 sm:p-5 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="bg-purple-600 rounded-lg p-2 sm:p-2.5 flex-shrink-0">
                          <Package className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm sm:text-base font-semibold text-purple-600 uppercase tracking-wide mb-1">
                            Paquete Consultado
                          </p>
                          <p className="text-lg sm:text-base font-bold text-purple-900 break-words">{selectedConsulta.paquete}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {(selectedConsulta.cantidadPersonas ||
                    selectedConsulta.ciudad ||
                    selectedConsulta.codigoPostal ||
                    selectedConsulta.ticketId) && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
                      <p className="text-sm sm:text-base font-semibold text-gray-700 uppercase tracking-wide mb-3">
                        Datos del viajero
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedConsulta.cantidadPersonas && (
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                              Cantidad de personas
                            </p>
                            <p className="text-sm sm:text-base font-medium text-gray-900">
                              {selectedConsulta.cantidadPersonas}
                            </p>
                          </div>
                        )}
                        {selectedConsulta.ciudad && (
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                              Ciudad
                            </p>
                            <p className="text-sm sm:text-base font-medium text-gray-900">
                              {selectedConsulta.ciudad}
                            </p>
                          </div>
                        )}
                        {selectedConsulta.codigoPostal && (
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                              Código postal
                            </p>
                            <p className="text-sm sm:text-base font-medium text-gray-900">
                              {selectedConsulta.codigoPostal}
                            </p>
                          </div>
                        )}
                        {selectedConsulta.ticketId && (
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                              Ticket
                            </p>
                            <p className="text-sm sm:text-base font-medium text-gray-900">
                              {selectedConsulta.ticketId}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Información de contacto */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
                      <div className="flex items-start gap-2 sm:gap-3">
                        <div className="bg-blue-100 rounded-lg p-2 flex-shrink-0">
                          <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            Email
                          </p>
                          <p className="text-sm sm:text-base font-medium text-gray-900 break-all">
                            {selectedConsulta.email}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
                      <div className="flex items-start gap-2 sm:gap-3">
                        <div className="bg-green-100 rounded-lg p-2 flex-shrink-0">
                          <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            Teléfono
                          </p>
                          <p className="text-sm sm:text-base font-medium text-gray-900 break-all">
                            {selectedConsulta.telefono}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mensaje */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 sm:p-6 border border-gray-200">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
                      <p className="text-sm sm:text-base font-semibold text-gray-700 uppercase tracking-wide">
                        Mensaje
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-4 sm:p-5 border border-gray-200 shadow-sm">
                      <p className="text-base sm:text-lg text-gray-900 leading-relaxed whitespace-pre-line break-words">
                        {selectedConsulta.mensaje}
                      </p>
                    </div>
                  </div>

                  {/* Botón de WhatsApp */}
                  <div className="pt-3 sm:pt-4 border-t">
                    <Button
                      asChild
                      className="w-full bg-success hover:bg-success/90 text-white h-12 sm:h-11"
                    >
                      <a 
                        href={`https://wa.me/${sanitizePhoneForWhatsApp(selectedConsulta.telefono)}?text=${encodeURIComponent(
                          `Hola ${selectedConsulta.nombre}, somos de *${SITE_NAME}*\n\n` +
                          `Te contacto por tu consulta${selectedConsulta.paquete ? ` sobre el paquete *"${selectedConsulta.paquete}"*` : ''}.\n\n` +
                          `¿En qué puedo ayudarte?`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                        <span className="text-base sm:text-lg font-semibold">Contactar por WhatsApp</span>
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </ProtectedRoute>
  );
}
