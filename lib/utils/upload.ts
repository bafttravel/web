import { compressImage, MAX_MULTIPART_FILE_BYTES } from './imageValidation.ts';

export type UploadResult = {
  url: string;
  key: string;
};

export class UploadError extends Error {}

async function sendUpload(file: File, description: string): Promise<UploadResult> {
  const tooLarge = 'El archivo supera el límite de 4 MB. Probá con una versión más liviana.';
  if (file.size > MAX_MULTIPART_FILE_BYTES) throw new UploadError(tooLarge);

  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/upload', { method: 'POST', body: formData }).catch(() => {
    throw new UploadError(`No se pudo conectar para subir ${description}.`);
  });
  if (response.status === 413) throw new UploadError(tooLarge);

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const ref = typeof data?.reference === 'string' ? ` Referencia: ${data.reference}.` : '';
    const message = typeof data?.error === 'string' ? data.error : `No se pudo subir el archivo (HTTP ${response.status}).`;
    throw new UploadError(`${message}${ref}`);
  }
  if (typeof data?.url !== 'string' || !data.url || typeof data?.key !== 'string' || !data.key) {
    throw new UploadError('La carga no devolvió una dirección válida para el archivo.');
  }
  return { url: data.url, key: data.key };
}

export async function uploadImage(file: File): Promise<UploadResult> {
  let fileToUpload = file;
  if (file.size > MAX_MULTIPART_FILE_BYTES) {
    try {
      fileToUpload = await compressImage(file, 2);
    } catch (error) {
      throw new UploadError(error instanceof Error ? error.message : 'No se pudo comprimir la imagen.');
    }
  }
  return sendUpload(fileToUpload, 'la imagen');
}

export async function uploadMultipleImages(files: File[]): Promise<UploadResult[]> {
  const uploadPromises = files.map((file) => uploadImage(file));
  return Promise.all(uploadPromises);
}

/** Sube un archivo de video (mp4, webm, etc.) a /api/upload. Sin compresión. */
export async function uploadVideo(file: File): Promise<string> {
  return (await sendUpload(file, 'el video')).url;
}

export function uploadFile(file: File): Promise<UploadResult> {
  return sendUpload(file, 'el archivo');
}
