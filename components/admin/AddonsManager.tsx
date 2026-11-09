'use client';
import AdminFilePicker from './AdminFilePicker';
import { IMAGE_ACCEPT, IMAGE_MAX_SIZE } from '@/lib/admin/files';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronDown, ChevronUp, Copy, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  MAX_PACKAGE_ADDONS,
  createEmptyAddon,
  type AddonFormItem,
} from '@/lib/packages/package-addons';
import { getAllPaquetesAdmin } from '@/lib/paquetes';
import { getPackageAddonOptions } from '@/lib/packages/resolve-departure';

type Props = {
  items: AddonFormItem[];
  onItemsChange: (items: AddonFormItem[]) => void;
  disabled?: boolean;
  currentId?: string;
};

function formatPricePreview(price: number) {
  return `$${(Math.max(0, Number(price) || 0)).toLocaleString('es-AR')}`;
}

export default function AddonsManager({ items, onItemsChange, disabled, currentId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?.id ?? null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const patchItem = (id: string, patch: Partial<AddonFormItem>) => {
    onItemsChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    onItemsChange(next);
  };

  const handleImageFile = async (id: string, file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadingId(id);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(file);
      });
      patchItem(id, { image: dataUrl, imageKey: null });
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        El precio de cada adicional se cobra una sola vez por reserva.
      </p>

      <Button
        type="button"
        variant="outline"
        onClick={() => setShowImport((prev) => !prev)}
        disabled={disabled}
        className="w-full"
      >
        <Copy className="mr-2 h-4 w-4" />
        {showImport ? 'Ocultar importar desde otra excursión' : 'Importar desde otra excursión'}
      </Button>
      {showImport ? (
        <AddonImporter
          currentId={currentId}
          disabled={disabled}
          onImport={(imported) => {
            const existingTitles = new Set(items.map((item) => item.title.trim().toLowerCase()).filter(Boolean));
            const fresh = imported.filter((item) => !existingTitles.has(item.title.trim().toLowerCase()));
            if (fresh.length === 0) {
              toast.info('Esos adicionales ya están en esta excursión.');
              return;
            }
            const room = Math.max(0, MAX_PACKAGE_ADDONS - items.length);
            const toAdd = fresh.slice(0, room);
            onItemsChange([...items, ...toAdd]);
            if (toAdd[0]) setExpandedId(toAdd[0].id);
            toast.success(
              toAdd.length === 1
                ? `Adicional importado: ${toAdd[0].title}`
                : `${toAdd.length} adicionales importados.`
            );
            if (fresh.length > toAdd.length) {
              toast.warning(`Solo cabían ${toAdd.length} de ${fresh.length} (máximo ${MAX_PACKAGE_ADDONS}).`);
            }
          }}
        />
      ) : null}

      <div className="space-y-3">
        {items.map((item, index) => {
          const expanded = expandedId === item.id;
          const uploading = uploadingId === item.id;
          return (
            <div
              key={item.id}
              className={`rounded-xl border bg-white transition ${
                item.enabled ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-80'
              }`}
            >
              <div className="flex items-center gap-3 p-3">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-expanded={expanded}
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                    {item.image ? (
                      <Image src={item.image} alt={item.title || `Adicional ${index + 1}`} fill className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <ImagePlus className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-gray-900">
                      {item.title.trim() || `Adicional ${index + 1} (sin título)`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatPricePreview(item.price)} · {item.enabled ? 'Visible' : 'Oculto'}
                    </div>
                  </div>
                  {expanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => moveItem(index, -1)}
                    disabled={disabled || index === 0}
                    aria-label="Subir"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => moveItem(index, 1)}
                    disabled={disabled || index === items.length - 1}
                    aria-label="Bajar"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => onItemsChange(items.filter((row) => row.id !== item.id))}
                    disabled={disabled}
                    aria-label="Eliminar adicional"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {expanded ? (
                <CardContent className="space-y-4 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                    <div>
                      <Label className="text-sm font-semibold">Visible en el modal</Label>
                      <p className="text-xs text-gray-500">Apagalo para ocultarlo sin borrarlo.</p>
                    </div>
                    <Switch
                      checked={item.enabled}
                      onCheckedChange={(checked) => patchItem(item.id, { enabled: checked })}
                      disabled={disabled}
                      aria-label={`Visible: ${item.title || 'adicional'}`}
                    />
                  </div>

                  <div>
                    <Label className="text-sm">
                      Título <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={item.title}
                      onChange={(event) => patchItem(item.id, { title: event.target.value })}
                      placeholder="Ej: Almuerzo en el refugio"
                      maxLength={80}
                      className="mt-1.5"
                      disabled={disabled}
                    />
                  </div>

                  <div>
                    <Label className="text-sm">Descripción</Label>
                    <Textarea
                      value={item.description}
                      onChange={(event) => patchItem(item.id, { description: event.target.value })}
                      placeholder="Ej: Menú patagónico con bebida incluida, servido al mediodía."
                      maxLength={400}
                      className="mt-1.5 min-h-[80px]"
                      disabled={disabled}
                    />
                    <p className="mt-1 text-right text-xs text-gray-400">{item.description.length}/400</p>
                  </div>

                  <div>
                    <Label className="text-sm">
                      Precio (por reserva) <span className="text-red-500">*</span>
                    </Label>
                    <FormattedAmountInput
                      value={Number(item.price) || 0}
                      onChange={(value) => patchItem(item.id, { price: Math.max(0, Math.floor(Number(value) || 0)) })}
                      placeholder="0"
                      className="mt-1.5 max-w-xs"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Se cobra una sola vez por reserva, no por persona. En la moneda del paquete.
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm">Imagen de tarjeta</Label>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                        {item.image ? (
                          <Image src={item.image} alt={item.title || 'Adicional'} fill className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-400">
                            <ImagePlus className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <AdminFilePicker label={item.image ? 'Cambiar imagen del adicional' : 'Imagen del adicional'} description="Imágenes. Se sube al guardar la excursión." accept={IMAGE_ACCEPT} maxSize={IMAGE_MAX_SIZE} disabled={disabled} busy={uploading} onFilesSelected={async ([file]) => { await handleImageFile(item.id, file); }} processingLabel="Preparando imagen…" successLabel="" showSelectedFiles={false} />
                        {item.image ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => patchItem(item.id, { image: '', imageKey: null })}
                            disabled={disabled}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Quitar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Recomendado: 800x600 px. Se sube al guardar la excursión.</p>
                  </div>
                </CardContent>
              ) : null}
            </div>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
          <p className="text-sm font-medium text-gray-700">Sin adicionales</p>
          <p className="mt-1 text-xs text-gray-500">
            Agregá el primero para vender más que la excursión: traslados, comidas, fotos, seguros, etc.
          </p>
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        onClick={() => {
          const next = createEmptyAddon();
          onItemsChange([...items, next]);
          setExpandedId(next.id);
        }}
        disabled={disabled || items.length >= MAX_PACKAGE_ADDONS}
        className="w-full"
      >
        <Plus className="mr-2 h-4 w-4" />
        Agregar adicional {items.length > 0 ? `(${items.length}/${MAX_PACKAGE_ADDONS})` : ''}
      </Button>
    </div>
  );
}

/* ------------------------- importar desde otra excursión ------------------------- */

function AddonImporter({
  currentId,
  disabled,
  onImport,
}: {
  currentId?: string;
  disabled?: boolean;
  onImport: (items: AddonFormItem[]) => void;
}) {
  const [packages, setPackages] = useState<Array<{ id: string; titulo: string; count: number; addons: AddonFormItem[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAllPaquetesAdmin()
      .then((all) => {
        if (cancelled) return;
        const withAddons = all
          .filter((p) => !currentId || p.id !== currentId)
          .map((p) => ({
            id: p.id,
            titulo: String(p.titulo ?? 'Sin título'),
            count: getPackageAddonOptions(p as any).length,
            addons: getPackageAddonOptions(p as any).map((option) => ({
              id: `addon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
              title: option.title,
              description: option.description,
              price: option.price,
              image: option.image,
              imageKey: null,
              enabled: true,
            })),
          }))
          .filter((p) => p.count > 0)
          .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
        setPackages(withAddons);
        if (withAddons[0]) setSourceId(withAddons[0].id);
      })
      .catch(() => {
        if (!cancelled) toast.error('No pudimos cargar las excursiones.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  useEffect(() => {
    setCheckedIds([]);
  }, [sourceId]);

  const source = packages.find((p) => p.id === sourceId) ?? null;

  const toggle = (addonId: string) =>
    setCheckedIds((prev) => (prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]));

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando excursiones con adicionales…
        </p>
      ) : packages.length === 0 ? (
        <p className="text-sm text-gray-500">Ninguna otra excursión tiene adicionales para importar.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Excursión de origen</Label>
            <Select value={sourceId} onValueChange={setSourceId} disabled={disabled}>
              <SelectTrigger className="mt-1.5 bg-white">
                <SelectValue placeholder="Elegí una excursión" />
              </SelectTrigger>
              <SelectContent>
                {packages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.titulo} ({p.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {source ? (
            <div className="space-y-1.5">
              {source.addons.map((addon) => {
                const checked = checkedIds.includes(addon.id);
                return (
                  <label
                    key={addon.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(addon.id)}
                        disabled={disabled}
                        className="h-4 w-4 accent-neutral-900"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{addon.title}</span>
                        {addon.description ? (
                          <span className="block truncate text-xs text-gray-500">{addon.description}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                      ${addon.price.toLocaleString('es-AR')}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              if (!source) return;
              const selected = source.addons.filter((addon) => checkedIds.includes(addon.id));
              if (selected.length === 0) {
                toast.info('Marcá al menos un adicional para importar.');
                return;
              }
              onImport(selected);
              setCheckedIds([]);
            }}
            disabled={disabled || checkedIds.length === 0}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copiar {checkedIds.length > 0 ? `${checkedIds.length} ` : ''}a esta excursión
          </Button>
          <p className="text-xs text-gray-500">
            Se copian título, descripción, precio e imagen. Después podés editarlos acá sin afectar la excursión de origen.
          </p>
        </div>
      )}
    </div>
  );
}
