'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { Testimonial } from '@/components/landing-reserva/types';
import { TestimonialLibraryModal } from '@/components/admin/TestimonialLibraryModal';

const ITEMS_PER_PAGE = 6;

type AdminTestimonialsSectionProps = {
  testimonials: Testimonial[];
  onUpdate: (index: number, field: keyof Testimonial, value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  libraryOpen: boolean;
  onLibraryOpenChange: (open: boolean) => void;
  onAddFromLibrary: (toAdd: Testimonial[]) => void;
};

export function AdminTestimonialsSection({
  testimonials,
  onUpdate,
  onRemove,
  onAdd,
  libraryOpen,
  onLibraryOpenChange,
  onAddFromLibrary,
}: AdminTestimonialsSectionProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(testimonials.length / ITEMS_PER_PAGE));
  const start = (page - 1) * ITEMS_PER_PAGE;
  const slice = testimonials.slice(start, start + ITEMS_PER_PAGE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Testimonios</CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          Citas de viajeros que se muestran en la experiencia. Nombre, cita y rol o país.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {testimonials.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-8 text-center text-sm text-gray-500">
            No hay testimonios. Agregá desde la biblioteca o creá uno personalizado.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {slice.map((t, localIndex) => {
                const realIndex = start + localIndex;
                return (
                  <div
                    key={realIndex}
                    className="group relative rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:border-gray-300 hover:shadow"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                        #{realIndex + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemove(realIndex)}
                        className="h-7 w-7 p-0 text-gray-400 opacity-70 hover:bg-red-50 hover:text-red-600 hover:opacity-100"
                        aria-label="Quitar testimonio"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-sm text-gray-500">Nombre</Label>
                        <Input
                          placeholder="Ej: María G."
                          value={t.name}
                          onChange={(e) => onUpdate(realIndex, 'name', e.target.value)}
                          className="mt-0.5 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-sm text-gray-500">Cita</Label>
                        <Textarea
                          placeholder="Lo que dijo el viajero..."
                          value={t.quote}
                          onChange={(e) => onUpdate(realIndex, 'quote', e.target.value)}
                          rows={2}
                          className="mt-0.5 resize-none text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-sm text-gray-500">Rol o país</Label>
                        <Input
                          placeholder="Ej: Argentina"
                          value={t.role ?? ''}
                          onChange={(e) => onUpdate(realIndex, 'role', e.target.value)}
                          className="mt-0.5 h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {testimonials.length > ITEMS_PER_PAGE && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
                <p className="text-xs text-gray-500">
                  Mostrando <span className="font-medium text-gray-700">{start + 1}</span>–
                  <span className="font-medium text-gray-700">{Math.min(start + ITEMS_PER_PAGE, testimonials.length)}</span> de{' '}
                  <span className="font-medium text-gray-700">{testimonials.length}</span>
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={goPrev}
                    disabled={page <= 1}
                    className="h-8 w-8 p-0"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-16 px-2 text-center text-xs font-medium text-gray-600">
                    {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={goNext}
                    disabled={page >= totalPages}
                    className="h-8 w-8 p-0"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => onLibraryOpenChange(true)}
            className="flex-1 gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            Agregar desde biblioteca
          </Button>
          <Button
            type="button"
            onClick={onAdd}
            variant="outline"
            className="flex-1 gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Agregar testimonio personalizado
          </Button>
        </div>

        <TestimonialLibraryModal
          open={libraryOpen}
          onClose={() => onLibraryOpenChange(false)}
          onAdd={onAddFromLibrary}
        />
      </CardContent>
    </Card>
  );
}
