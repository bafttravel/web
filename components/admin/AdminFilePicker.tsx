'use client';

import { useId, useRef, useState } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { UploadSimple, File as FileIcon, SpinnerGap, CheckCircle, X } from '@phosphor-icons/react';
import { fileRejectionLabel, fileSizeLabel } from '@/lib/admin/files';

type Props = {
  label: string; description: string; accept: Accept; maxSize?: number; maxFiles?: number;
  multiple?: boolean; disabled?: boolean; busy?: boolean; processingLabel?: string; successLabel?: string;
  onFilesSelected: (files: File[]) => void | Promise<void>;
  files?: File[]; onRemove?: (index: number) => void; showSelectedFiles?: boolean; retryable?: boolean; className?: string;
};

export default function AdminFilePicker({ label, description, accept, maxSize, maxFiles = 1, multiple = false, disabled = false, busy = false, processingLabel = 'Procesando archivos…', successLabel = 'Archivos seleccionados', onFilesSelected, files, onRemove, showSelectedFiles = true, retryable = true, className = '' }: Props) {
  const id = useId();
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  const waiting = busy || working;
  const process = async (next: File[], rejection = '') => {
    if (lock.current || disabled || busy) return;
    lock.current = true; setWorking(true); setDone(false); setError(rejection); setSelected(next);
    try { await onFilesSelected(next); setDone(true); }
    catch (e) { setError(e instanceof Error && !/failed to fetch|upload failed|network|fetch failed/i.test(e.message) ? e.message : 'No se pudo procesar el archivo. Intentá de nuevo.'); }
    finally { lock.current = false; setWorking(false); }
  };
  const { getRootProps, getInputProps, open, isDragActive, isDragReject } = useDropzone({
    accept, maxSize, minSize: 1, maxFiles, multiple, disabled: disabled || waiting, noClick: true, noKeyboard: true,
    onDrop: (accepted, rejected) => {
      const message = [...new Set(rejected.flatMap((item) => item.errors.map((issue) => fileRejectionLabel(issue.code, maxSize, maxFiles))))].join(' ');
      if (accepted.length) void process(accepted, message);
      else { setError(message); setSelected([]); setDone(false); }
    },
  });
  const visibleFiles = files ?? selected;
  return <div className={`admin-file-picker min-w-0 w-full space-y-3 ${className}`} aria-busy={waiting}>
    <p className="admin-file-label text-sm font-medium text-slate-700" id={`${id}-label`}>{label}</p>
    <div {...getRootProps({ role: 'group', 'aria-labelledby': `${id}-label`, 'aria-describedby': `${id}-help` })} className="admin-file-dropzone flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-5" data-active={isDragActive} data-rejected={isDragReject} data-disabled={disabled || waiting}>
      <input {...getInputProps({ 'aria-label': label })} style={{ display: 'none' }} />
      {waiting ? <SpinnerGap className="admin-file-icon animate-spin" size={24} aria-hidden="true" /> : <UploadSimple className="admin-file-icon" size={24} aria-hidden="true" />}
      <div className="admin-file-copy min-w-0 flex-1 text-sm text-slate-700"><p>{isDragActive ? isDragReject ? 'Revisá el formato de los archivos' : 'Soltá los archivos acá' : multiple ? 'Arrastrá tus archivos o seleccioná desde tu dispositivo' : 'Arrastrá tu archivo o seleccioná desde tu dispositivo'}</p><p className="mt-1 text-xs text-slate-500" id={`${id}-help`}>{description}{maxSize ? ` · Hasta ${fileSizeLabel(maxSize)} por archivo` : ''}{multiple ? ` · Hasta ${maxFiles} archivos por vez` : ''}</p></div>
      <button type="button" className="admin-file-select rounded-md bg-[#0f1f52] px-4 py-2 text-sm text-white disabled:opacity-50" onClick={open} disabled={disabled || waiting}>{multiple ? 'Seleccionar archivos' : 'Seleccionar archivo'}</button>
    </div>
    {showSelectedFiles && visibleFiles.length > 0 && <ul className="admin-file-list space-y-2" aria-label="Archivos seleccionados">{visibleFiles.map((file, index) => <li className="flex min-w-0 items-center gap-3 rounded-lg bg-slate-50 p-3" key={`${file.name}-${index}`}><FileIcon size={19} aria-hidden="true" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{file.name}</strong><small className="text-xs text-slate-500">{fileSizeLabel(file.size)}</small></span>{onRemove && <button type="button" className="admin-file-remove p-2" disabled={disabled || waiting} aria-label={`Quitar ${file.name}`} onClick={() => { onRemove(index); setSelected((previous) => previous.filter((_, i) => i !== index)); setDone(false); setError(''); }}><X size={17} aria-hidden="true" /></button>}</li>)}</ul>}
    {waiting && <p className="admin-file-status" role="status">{processingLabel}</p>}
    {!waiting && done && successLabel && visibleFiles.length > 0 && <p className="admin-file-status" role="status"><CheckCircle size={16} aria-hidden="true" />{successLabel}</p>}
    {error && <div className="admin-file-error"><p role="alert">{error}</p>{retryable && !done && selected.length > 0 && <button type="button" disabled={disabled || waiting} onClick={() => void process(selected)}>Reintentar</button>}</div>}
  </div>;
}
