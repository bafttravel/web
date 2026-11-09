/** Display-only helpers; upload endpoints remain responsible for validating file contents. */
export function fileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Tamaño desconocido';
  if (bytes < 1024) return `${bytes} B`;
  const divisor = bytes < 1024 * 1024 ? 1024 : 1024 * 1024;
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(bytes / divisor)} ${divisor === 1024 ? 'KB' : 'MB'}`;
}

export function fileRejectionLabel(code: string, maxSize?: number, maxFiles = 1): string {
  if (code === 'file-too-large') return `El archivo supera el máximo de ${fileSizeLabel(maxSize ?? 0)}.`;
  if (code === 'file-invalid-type') return 'Este formato no está permitido. Revisá los formatos indicados.';
  if (code === 'too-many-files') return `Seleccioná hasta ${maxFiles} archivo${maxFiles === 1 ? '' : 's'} por vez.`;
  if (code === 'file-empty' || code === 'file-too-small') return 'El archivo está vacío. Seleccioná otro archivo.';
  return 'No se pudo seleccionar el archivo. Intentá de nuevo.';
}

export const RECEIPT_ACCEPT = { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] };
export const IMAGE_ACCEPT = { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg'] };
export const RESERVATION_FILE_ACCEPT = { ...IMAGE_ACCEPT, 'application/pdf': ['.pdf'] };
export const RECEIPT_MAX_SIZE = 5 * 1024 * 1024;
export const IMAGE_MAX_SIZE = 10 * 1024 * 1024;
