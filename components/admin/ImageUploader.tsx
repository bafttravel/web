'use client';

import { useState } from 'react';
import { X, Image as ImageIcon, Move } from 'lucide-react';
import Image from 'next/image';
import AdminFilePicker from './AdminFilePicker';
import { IMAGE_ACCEPT, IMAGE_MAX_SIZE } from '@/lib/admin/files';

interface ImageUploaderProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
  label?: string;
  description?: string;
}

export default function ImageUploader({
  images,
  onImagesChange,
  maxImages = 10,
  label = 'Imágenes',
  description = 'Arrastra imágenes o haz clic para seleccionar',
}: ImageUploaderProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);


  const handleFiles = async (files: File[]) => {
    const remainingSlots = maxImages - images.length;
    const filesToAdd = files.slice(0, remainingSlots);

    // Convertir todos los archivos a base64 usando Promise.all
    const imagePromises = filesToAdd.map((file) => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = () => reject(new Error('No se pudo leer la imagen. Probá con otra imagen.'));
        reader.readAsDataURL(file);
      });
    });

    // Esperar a que todas las imágenes se carguen
    const newImages = await Promise.all(imagePromises);
    
    // Actualizar el estado una sola vez con todas las imágenes
    onImagesChange([...images, ...newImages]);
  };


  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleDropReorder = (dropIndex: number) => {
    if (draggedIndex === null) return;

    const newImages = [...images];
    const [draggedImage] = newImages.splice(draggedIndex, 1);
    newImages.splice(dropIndex, 0, draggedImage);

    onImagesChange(newImages);
    setDraggedIndex(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-base font-medium mb-2">{label}</label>
        <p className="text-base text-gray-500 mb-4">{description}</p>
      </div>

      {/* Drop Zone */}
      {images.length < maxImages && (
        <AdminFilePicker label={`Seleccionar ${label.toLowerCase()}`} description={`Imágenes · ${images.length}/${maxImages} seleccionadas. Se suben al guardar.`} accept={IMAGE_ACCEPT} maxSize={IMAGE_MAX_SIZE} multiple={maxImages - images.length > 1} maxFiles={maxImages - images.length} onFilesSelected={handleFiles} processingLabel="Preparando imágenes…" successLabel="" showSelectedFiles={false} />
      )}

      {/* Grid de Imágenes */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((image, index) => (
            <div
              key={index}
              draggable={maxImages > 1}
              onDragStart={() => maxImages > 1 && handleDragStart(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (maxImages > 1) handleDropReorder(index);
              }}
              className={`group relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                maxImages > 1 ? 'cursor-move' : ''
              } ${
                draggedIndex === index
                  ? 'opacity-50 border-gray-900 scale-95'
                  : 'border-gray-200 hover:border-gray-400 hover:shadow-lg'
              }`}
            >
              <Image
                src={image}
                alt={maxImages === 1 ? 'Imagen de portada' : `Imagen ${index + 1}`}
                fill
                className="object-cover"
              />

              {/* Overlay con acciones */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(index);
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition-colors"
                    title="Eliminar imagen"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {maxImages > 1 && (
                  <div className="flex items-center gap-1 text-white text-sm">
                    <Move className="h-3 w-3" />
                    <span>Arrastra para ordenar</span>
                  </div>
                )}
              </div>

              {/* Número de orden - solo si hay más de 1 imagen */}
              {maxImages > 1 && (
                <div className="absolute top-2 left-2 bg-black/80 text-white text-sm font-bold w-6 h-6 rounded-full flex items-center justify-center">
                  {index + 1}
                </div>
              )}

            </div>
          ))}
        </div>
      )}

      {/* Indicador de imágenes */}
      {images.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2 text-base text-gray-700">
            <ImageIcon className="h-4 w-4" />
            <span className="font-medium">{images.length} imagen{images.length !== 1 ? 'es' : ''} seleccionada{images.length !== 1 ? 's' : ''}</span>
          </div>
          {images.length === maxImages && (
            <span className="text-sm text-gray-500">Límite alcanzado</span>
          )}
        </div>
      )}
    </div>
  );
}
