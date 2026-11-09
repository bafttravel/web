'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface AdminPaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  itemName?: string;
}

export default function AdminPagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemName = 'elementos'
}: AdminPaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

  // Calcular rango de páginas a mostrar
  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 7;

    if (totalPages <= maxVisiblePages) {
      // Mostrar todas las páginas si son pocas
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Siempre mostrar primera página
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Páginas alrededor de la actual
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Siempre mostrar última página
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  }, [totalPages, currentPage]);

  if (totalItems === 0) return null;

  return (
    <div className="admin-pagination flex flex-col sm:flex-row items-center justify-between gap-4 py-5 px-6 bg-gradient-to-r from-gray-50 to-white border-t-2 border-gray-200">
      {/* Info de resultados */}
      <div className="text-base text-gray-600">
        Mostrando <span className="font-bold text-black">{startIndex + 1}</span> a{' '}
        <span className="font-bold text-black">{endIndex}</span> de{' '}
        <span className="font-bold text-black">{totalItems}</span> {itemName}
      </div>

      {/* Controles de paginación */}
      <div className="flex items-center gap-4">
        {/* Selector de items por página */}
        <Select 
          value={itemsPerPage.toString()} 
          onValueChange={(value) => {
            onItemsPerPageChange(Number(value));
            onPageChange(1); // Resetear a primera página
          }}
        >
          <SelectTrigger className="w-[150px] h-10 border-2 border-gray-300 hover:border-black transition-colors font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 por página</SelectItem>
            <SelectItem value="25">25 por página</SelectItem>
            <SelectItem value="50">50 por página</SelectItem>
            <SelectItem value="100">100 por página</SelectItem>
          </SelectContent>
        </Select>

        {/* Botones de navegación */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            {/* Primera página */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
              className="h-10 w-10 p-0 border-2 hover:bg-gray-100 hover:border-black disabled:opacity-30 transition-all"
              title="Primera página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>

            {/* Página anterior */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-10 w-10 p-0 border-2 hover:bg-gray-100 hover:border-black disabled:opacity-30 transition-all"
              title="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Números de página */}
            <div className="hidden sm:flex items-center gap-1">
              {pageNumbers.map((page, index) => (
                page === '...' ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-gray-400">
                    {page}
                  </span>
                ) : (
                  <Button
                    key={page}
                    variant={currentPage === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onPageChange(page as number)}
                    className={`
                      h-10 w-10 p-0 font-semibold transition-all
                      ${currentPage === page
                        ? 'bg-black text-white hover:bg-gray-800 shadow-md border-2 border-black'
                        : 'border-2 hover:bg-gray-100 hover:border-black'
                      }
                    `}
                  >
                    {page}
                  </Button>
                )
              ))}
            </div>

            {/* Info de página en móvil */}
            <div className="sm:hidden px-3 text-base text-gray-600 font-medium">
              {currentPage} / {totalPages}
            </div>

            {/* Página siguiente */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="h-10 w-10 p-0 border-2 hover:bg-gray-100 hover:border-black disabled:opacity-30 transition-all"
              title="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Última página */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="h-10 w-10 p-0 border-2 hover:bg-gray-100 hover:border-black disabled:opacity-30 transition-all"
              title="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

