'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { CheckCircle, XCircle } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperType } from 'swiper';
import { Navigation, Pagination } from 'swiper/modules';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'yet-another-react-lightbox/styles.css';
import type { Paquete } from '@/types';
import ImageGallery from '@/components/ImageGallery';
import F1TicketsSection from '@/components/F1TicketsSection';

interface F1PaqueteContentProps {
  paquete: Paquete;
}

export default function F1PaqueteContent({ paquete }: F1PaqueteContentProps) {
  const tickets = paquete.tickets || [];
  const [activeId, setActiveId] = useState(tickets[0]?.id);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [lockActiveSelection, setLockActiveSelection] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const swiperRef = useRef<SwiperType | null>(null);

  useEffect(() => {
    if (!tickets.length) return;
    if (!tickets.some((ticket) => ticket.id === activeId)) {
      setActiveId(tickets[0].id);
    }
  }, [tickets, activeId]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setLockActiveSelection(false);
    }
  }, [isMobile]);

  const activeTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === activeId) || tickets[0],
    [tickets, activeId]
  );

  const activeIndex = useMemo(
    () => tickets.findIndex((ticket) => ticket.id === activeId),
    [tickets, activeId]
  );

  const ticketImage =
    activeTicket?.imagenUrl ||
    paquete.imagenPortada ||
    paquete.imagenTarjeta ||
    paquete.imagenPrincipal ||
    '/images/placeholder-package.jpg';

  const ticketImages = useMemo(
    () =>
      tickets.map((ticket) => ({
        src:
          ticket.imagenUrl ||
          paquete.imagenPortada ||
          paquete.imagenTarjeta ||
          paquete.imagenPrincipal ||
          '/images/placeholder-package.jpg',
        alt: ticket.titulo,
      })),
    [tickets, paquete.imagenPortada, paquete.imagenTarjeta, paquete.imagenPrincipal]
  );

  useEffect(() => {
    if (!swiperRef.current || activeIndex < 0) return;
    swiperRef.current.slideTo(activeIndex);
  }, [activeIndex]);

  return (
    <section className="py-12 md:py-16 bg-white">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-16">
          <div className="lg:col-span-2 space-y-10 md:space-y-12 overflow-hidden order-1 lg:order-0">
            {tickets.length > 0 && (
              <div className="relative space-y-3">
                <Swiper
                  modules={[Navigation, Pagination]}
                  onSwiper={(swiper) => {
                    swiperRef.current = swiper;
                  }}
                  onSlideChange={(swiper) => {
                    const ticket = tickets[swiper.activeIndex];
                    if (ticket) setActiveId(ticket.id);
                  }}
                  navigation
                  pagination={{ clickable: true }}
                  className="f1-ticket-swiper rounded-2xl overflow-hidden"
                >
                  {ticketImages.map((image, index) => (
                    <SwiperSlide key={`${image.src}-${index}`}>
                      <div
                        className="relative aspect-video overflow-hidden cursor-zoom-in"
                        onClick={() => {
                          setLightboxIndex(index);
                          setZoomOpen(true);
                        }}
                      >
                        <Image src={image.src} alt={image.alt} fill className="object-cover" />
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>
            )}
            {tickets.length > 0 && (
              <div className="lg:hidden">
                <F1TicketsSection
                  paqueteTitulo={paquete.titulo}
                  paqueteSlug={paquete.slug}
                  tickets={tickets}
                  fallbackImage={
                    paquete.imagenPortada ||
                    paquete.imagenTarjeta ||
                    paquete.imagenPrincipal ||
                    '/images/placeholder-package.jpg'
                  }
                  activeId={activeId}
                  onActiveChange={setActiveId}
                  lockActive={lockActiveSelection}
                  onLockChange={(locked) => {
                    if (isMobile) setLockActiveSelection(locked);
                  }}
                />
              </div>
            )}
            <div>
              <h2 className="text-lg md:text-lg lg:text-lg font-semibold mb-6 pluma-underline">Descripción</h2>
              <div
                className="text-base md:text-lg text-gray-700 leading-relaxed prose prose-lg max-w-none wrap-break-word overflow-wrap-anywhere"
                dangerouslySetInnerHTML={{ __html: paquete.descripcion }}
              />
            </div>

            {paquete.salidas && paquete.salidas.length > 0 && (
              <div>
                <h2 className="text-lg md:text-lg lg:text-lg font-semibold mb-6 pluma-underline">Fechas y Salidas Disponibles</h2>
                <div className="md:hidden space-y-4">
                  {[...paquete.salidas]
                    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
                    .map((salida) => {
                      const esPasada = new Date(salida.fecha + 'T00:00:00') < new Date();
                      return (
                        <div
                          key={salida.id}
                          className={`bg-white border-2 rounded-xl p-4 ${
                            esPasada ? 'opacity-50 border-gray-200' : 'border-gray-300'
                          }`}
                        >
                          <div className="mb-3 pb-3 border-b">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Fecha de Salida</p>
                                <p className="font-bold text-gray-900 text-lg">
                                  {new Date(salida.fecha + 'T00:00:00').toLocaleDateString('es-AR', {
                                    weekday: 'short',
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </p>
                                {salida.fechaVuelta && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    Vuelta:{' '}
                                    {new Date(salida.fechaVuelta + 'T00:00:00').toLocaleDateString('es-AR', {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </p>
                                )}
                              </div>
                              {esPasada && (
                                <span className="text-sm bg-red-100 text-red-700 px-2 py-1 rounded">Pasada</span>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500 uppercase tracking-wide">Ciudad</span>
                              <span className="font-medium text-gray-900">{salida.ciudadSalida || '-'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500 uppercase tracking-wide">Precio</span>
                              <span className="font-bold text-base text-gray-900">
                                {salida.moneda} ${salida.precio.toLocaleString('es-AR')}
                              </span>
                            </div>
                            {salida.observaciones && (
                              <div className="pt-2 border-t">
                                <p className="text-sm text-gray-600">{salida.observaciones}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-4 text-sm font-semibold text-gray-700 border-b">Fecha</th>
                        <th className="text-left p-4 text-sm font-semibold text-gray-700 border-b">Ciudad</th>
                        <th className="text-left p-4 text-sm font-semibold text-gray-700 border-b">Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...paquete.salidas]
                        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
                        .map((salida) => {
                          const esPasada = new Date(salida.fecha + 'T00:00:00') < new Date();
                          return (
                            <tr key={salida.id} className={esPasada ? 'opacity-50' : ''}>
                              <td className="p-4 border-b text-gray-800">
                                {new Date(salida.fecha + 'T00:00:00').toLocaleDateString('es-AR', {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </td>
                              <td className="p-4 border-b text-gray-800">{salida.ciudadSalida || '-'}</td>
                              <td className="p-4 border-b text-gray-800">
                                {salida.moneda} ${salida.precio.toLocaleString('es-AR')}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg md:text-lg lg:text-lg font-semibold mb-4 pluma-underline">Incluye</h3>
                <ul className="space-y-3">
                  {paquete.incluye?.map((item, index) => (
                    <li key={index} className="flex items-start gap-3 text-gray-700">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      <span className="text-base md:text-lg">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-lg md:text-lg lg:text-lg font-semibold mb-4 pluma-underline">No Incluye</h3>
                <ul className="space-y-3">
                  {paquete.noIncluye?.map((item, index) => (
                    <li key={index} className="flex items-start gap-3 text-gray-700">
                      <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                      <span className="text-base md:text-lg">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <h2 className="text-lg md:text-lg lg:text-lg font-semibold mb-6 pluma-underline">Galería</h2>
              <ImageGallery images={paquete.galeria || []} title={paquete.titulo} />
            </div>
          </div>

          <div className="lg:col-span-1 hidden lg:block order-2 lg:order-1">
            <F1TicketsSection
              paqueteTitulo={paquete.titulo}
              paqueteSlug={paquete.slug}
              tickets={tickets}
              fallbackImage={
                paquete.imagenPortada ||
                paquete.imagenTarjeta ||
                paquete.imagenPrincipal ||
                '/images/placeholder-package.jpg'
              }
              activeId={activeId}
              onActiveChange={setActiveId}
              lockActive={false}
            />
          </div>
        </div>
      </div>
      <Lightbox
        open={zoomOpen}
        close={() => setZoomOpen(false)}
        slides={ticketImages}
        index={lightboxIndex}
        plugins={[Zoom]}
        styles={{
          container: { zIndex: 120 },
        }}
      />
    </section>
  );
}
