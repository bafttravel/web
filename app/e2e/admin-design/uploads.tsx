'use client';

import { useRef, useState } from 'react';
import AdminFilePicker from '@/components/admin/AdminFilePicker';
import ImageUploader from '@/components/admin/ImageUploader';
import { RECEIPT_ACCEPT, RECEIPT_MAX_SIZE } from '@/lib/admin/files';
import { Button } from '@/components/ui/button';

export default function UploadsPreview() {
  const [files, setFiles] = useState<File[]>([]);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const finish = useRef<(() => void) | null>(null);
  const [cardImages, setCardImages] = useState<string[]>([]);
  const [coverImages, setCoverImages] = useState<string[]>([]);
  return <div className="space-y-6">
    <header><h1>Adjuntos · vista de prueba</h1><p>Prueba de interfaz. No se suben archivos ni se modifica información real.</p></header>
    <AdminFilePicker label="Comprobante de prueba" description="PDF, JPG o PNG" accept={RECEIPT_ACCEPT} maxSize={RECEIPT_MAX_SIZE} files={files} onFilesSelected={async (selected) => {
      setFiles(selected); setPending(true);
      await new Promise<void>((resolve, reject) => { finish.current = () => { setPending(false); finish.current = null; if (failed) reject(new Error('No se pudo adjuntar el archivo de prueba. Reintentá.')); else resolve(); }; });
    }} onRemove={(index) => setFiles((previous) => previous.filter((_, i) => i !== index))} processingLabel="Subiendo comprobante de prueba…" successLabel="Adjunto de prueba, sin subir a ningún servidor" />
    <div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2"><input type="checkbox" checked={failed} disabled={pending} onChange={(e) => setFailed(e.target.checked)} />Simular un error</label><Button disabled={!pending} onClick={() => finish.current?.()}>Completar prueba</Button></div>
    <ImageUploader images={cardImages} onImagesChange={setCardImages} maxImages={2} label="Imágenes de tarjeta" />
    <ImageUploader images={coverImages} onImagesChange={setCoverImages} maxImages={1} label="Imagen de portada" />
  </div>;
}
