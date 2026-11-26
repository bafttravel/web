// Leave room for multipart headers below Vercel's 4.5 MB request limit.
export const MAX_MULTIPART_FILE_BYTES = 4 * 1024 * 1024;

export function validateImageSize(file: File, maxSizeMB: number = 5): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
}

export function getFileSizeInMB(file: File): number {
  return file.size / (1024 * 1024);
}

export async function compressImage(file: File, maxSizeMB: number = 2): Promise<File> {
  // Si la imagen es menor al límite, retornarla sin comprimir
  if (validateImageSize(file, maxSizeMB)) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = document.createElement('img');
      img.src = event.target?.result as string;
      
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('El navegador no pudo preparar la imagen.');

          for (const maxDimension of [2560, 1920, 1440, 1080]) {
            const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            for (const quality of [0.9, 0.75, 0.6]) {
              const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', quality));
              if (!blob || blob.size === 0 || blob.size > maxSizeMB * 1024 * 1024) continue;
              resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }));
              return;
            }
          }
          throw new Error('No pudimos reducir la imagen lo suficiente. Probá con una versión más liviana.');
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error('Error al cargar imagen'));
    };
    
    reader.onerror = () => reject(new Error('Error al leer archivo'));
  });
}

