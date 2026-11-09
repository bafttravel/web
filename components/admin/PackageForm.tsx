'use client';
import AdminDatePicker from './AdminDatePicker';

import { useState } from 'react';
import PackageOperationsEditor from './PackageOperationsEditor';
import { EMPTY_PACKAGE_OPERATIONS } from '@/lib/operations/types';
import type { Control, FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import RichTextEditor from '@/components/admin/RichTextEditor';
import ItineraryStepsEditor from '@/components/admin/ItineraryStepsEditor';
import ImageUploader from '@/components/admin/ImageUploader';
import AddonsManager from '@/components/admin/AddonsManager';
import EditableList from '@/components/admin/EditableList';
import DragDropOrderManager from '@/components/admin/DragDropOrderManager';
import SalidasManager from '@/components/admin/SalidasManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { Categoria, Salida } from '@/types';
import {
  DEFAULT_CONDICIONES,
  TRANSPORTE_OPTIONS,
  type CondicionItem,
  normalizePackageTypes,
  type PackageAdminFormData,
} from '@/lib/packages/admin-form';
import type { AddonFormItem } from '@/lib/packages/package-addons';
import { humanizeExcursionType, type ExcursionTypeOption } from '@/lib/packages/package-types';

type Props = {
  mode: 'create' | 'edit';
  categorias: Categoria[];
  excursionTypes: ExcursionTypeOption[];
  onCreateExcursionType: (label: string) => Promise<ExcursionTypeOption | null>;
  register: UseFormRegister<PackageAdminFormData>;
  control: Control<PackageAdminFormData>;
  watch: UseFormWatch<PackageAdminFormData>;
  setValue: UseFormSetValue<PackageAdminFormData>;
  errors: FieldErrors<PackageAdminFormData>;
  includeItems: string[];
  onIncludeItemsChange: (items: string[]) => void;
  selectedTransportes: string[];
  onSelectedTransportesChange: (items: string[]) => void;
  noIncludeItems: string[];
  onNoIncludeItemsChange: (items: string[]) => void;
  condicionesItems: CondicionItem[];
  onCondicionesItemsChange: (items: CondicionItem[]) => void;
  addons: AddonFormItem[];
  onAddonsChange: (items: AddonFormItem[]) => void;
  salidas: Salida[];
  onSalidasChange: (salidas: Salida[]) => void;
  imagenTarjetaPreview: string[];
  onImagenTarjetaChange: (images: string[]) => void;
  imagenPortadaMobilePreview: string[];
  onImagenPortadaMobileChange: (images: string[]) => void;
  imagenPortadaDesktopPreview: string[];
  onImagenPortadaDesktopChange: (images: string[]) => void;
  galeriaPreview: string[];
  onGaleriaChange: (images: string[]) => void;
  destacadosCount: number;
  selectedDestacadoPosition?: number | null;
  onSelectedDestacadoPositionChange?: (value: number | null) => void;
  wasDestacado?: boolean;
  currentId?: string;
  loading: boolean;
  submitState?: 'idle' | 'validating' | 'saving' | 'error';
  submitMessage?: string;
  title: string;
  subtitle: string;
  submitLabel: string;
  submittingLabel: string;
};

export default function PackageForm(props: Props) {
  const {
    mode,
    categorias,
    excursionTypes,
    onCreateExcursionType,
    register,
    control,
    watch,
    setValue,
    errors,
    includeItems,
    onIncludeItemsChange,
    selectedTransportes,
    onSelectedTransportesChange,
    noIncludeItems,
    onNoIncludeItemsChange,
    condicionesItems,
    onCondicionesItemsChange,
    addons,
    onAddonsChange,
    salidas,
    onSalidasChange,
    imagenTarjetaPreview,
    onImagenTarjetaChange,
    imagenPortadaMobilePreview,
    onImagenPortadaMobileChange,
    imagenPortadaDesktopPreview,
    onImagenPortadaDesktopChange,
    galeriaPreview,
    onGaleriaChange,
    destacadosCount,
    selectedDestacadoPosition,
    onSelectedDestacadoPositionChange,
    wasDestacado = false,
    currentId,
    loading,
    submitState = 'idle',
    submitMessage,
    title,
    subtitle,
    submitLabel,
    submittingLabel,
  } = props;
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [creatingType, setCreatingType] = useState(false);

  const visible = watch('visible');
  const destacado = watch('destacado');
  const ctaWhatsApp = watch('ctaWhatsApp');
  const mostrarDesde = watch('mostrarDesde');
  const descripcionCorta = watch('descripcionCorta');
  const mostrarItinerario = watch('mostrarItinerario');
  const categoriaIds = watch('categoriaIds');
  const tipos = watch('tipos');
  const tarifaEspecialHabilitada = watch('tarifaEspecialHabilitada');
  const reservasHabilitadas = watch('reservasHabilitadas');
  const titulo = watch('titulo');
  const isBusy = loading || submitState === 'validating' || submitState === 'saving';
  const excursionTypeOptions = [
    ...excursionTypes,
    ...normalizePackageTypes(tipos || [])
      .filter((value) => !excursionTypes.some((item) => item.value === value))
      .map((value) => ({
        id: `legacy-${value}`,
        value,
        label: humanizeExcursionType(value) || value,
      })),
  ];

  const handleCreateType = async () => {
    const trimmed = newTypeLabel.trim();
    if (!trimmed || creatingType) return;

    try {
      setCreatingType(true);
      const created = await onCreateExcursionType(trimmed);
      if (!created) return;

      const current = normalizePackageTypes(tipos || []);
      setValue('tipos', normalizePackageTypes([...current, created.value]) as PackageAdminFormData['tipos'], {
        shouldValidate: true,
      });
      setNewTypeLabel('');
    } catch (error) {
      console.error('Error creating excursion type:', error);
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el tipo');
    } finally {
      setCreatingType(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/paquetes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-gray-900 tracking-tight">{title}</h1>
          <p className="text-gray-600 mt-1">{subtitle}</p>
        </div>
      </div>

      {submitState !== 'idle' ? (
        <div
          className={`rounded-2xl border px-4 py-3 ${
            submitState === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-sky-200 bg-sky-50 text-sky-800'
          }`}
        >
          <div className="flex items-start gap-3">
            {submitState === 'error' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
            )}
            <div className="text-sm font-medium">
              {submitMessage ||
                (submitState === 'validating'
                  ? 'Validando datos...'
                  : submitState === 'saving'
                    ? submittingLabel
                    : 'Revisá los campos marcados para poder continuar.')}
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-5">
        <nav className="admin-editor-nav" aria-label="Secciones de la excursión"><a href="#editor-basics">Información</a><a href="#editor-content">Contenido</a><a href="#salidas-section">Fechas y salidas</a><a href="#editor-operations">Comisiones y costos</a><a href="#editor-publication">Publicación</a><a href="#imagenes-section">Imágenes</a></nav>
        <Card id="editor-basics">
          <CardHeader className="pb-4">
            <CardTitle>Información de la excursión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="titulo">
                Titulo <span className="text-red-500">*</span>
              </Label>
              <Input id="titulo" {...register('titulo')} placeholder="Ej: Europa Magica - 15 dias" className="mt-1.5" />
              {errors.titulo && <p className="text-base text-red-500 mt-1">{errors.titulo.message}</p>}
            </div>

            <div>
              <Label htmlFor="descripcionCorta">Descripcion corta (Recomendada)</Label>
              <Input
                id="descripcionCorta"
                {...register('descripcionCorta')}
                placeholder="Ej: Descubre Europa en 15 dias inolvidables con todo incluido"
                className="mt-1.5"
                maxLength={160}
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-sm text-gray-500">Este texto se usa solo en la tarjeta de la excursion</p>
                <p className={`text-sm ${(descripcionCorta?.length || 0) > 140 ? 'text-orange-500' : 'text-gray-500'}`}>
                  {descripcionCorta?.length || 0}/160 caracteres
                </p>
              </div>
              {errors.descripcionCorta && <p className="text-base text-red-500 mt-1">{errors.descripcionCorta.message}</p>}
            </div>

            <div id="descripcion-editor">
              <Label htmlFor="descripcion">
                Descripcion completa <span className="text-red-500">*</span> (Usa el editor para dar formato)
              </Label>
              <div className="mt-1.5">
                <Controller
                  name="descripcion"
                  control={control}
                  render={({ field }) => (
                    <RichTextEditor
                      content={field.value}
                      onChange={field.onChange}
                      placeholder="Describe la excursion... Puedes usar negritas, listas y links."
                      enableMedia={false}
                    />
                  )}
                />
              </div>
              {errors.descripcion && <p className="text-base text-red-500 mt-1">{errors.descripcion.message}</p>}
            </div>

            <div id="itinerario-section" className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="mostrarItinerario" className="text-base font-medium cursor-pointer">
                    Mostrar itinerario en la ficha pública
                  </Label>
                  <p className="text-sm text-gray-500">
                    Activá esta opción si querés que el usuario final vea el programa detallado de la excursión.
                  </p>
                </div>
                <Switch
                  id="mostrarItinerario"
                  checked={Boolean(mostrarItinerario)}
                  onCheckedChange={(checked) => setValue('mostrarItinerario', checked, { shouldValidate: true })}
                />
              </div>

              <div>
                <Label>
                  Itinerario por pasos {mostrarItinerario ? <span className="text-red-500">*</span> : null}
                </Label>
                <div className="mt-2">
                  <Controller
                    name="itinerarioSteps"
                    control={control}
                    render={({ field }) => (
                      <ItineraryStepsEditor steps={field.value || []} onChange={field.onChange} disabled={loading} />
                    )}
                  />
                </div>
                {errors.itinerarioSteps && <p className="text-base text-red-500 mt-2">{errors.itinerarioSteps.message as string}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="mapaGoogleEmbedUrl">Google Maps embebido</Label>
              <Textarea
                id="mapaGoogleEmbedUrl"
                {...register('mapaGoogleEmbedUrl')}
                placeholder='Pegá la URL de Google Maps embed o el iframe completo. Ej: <iframe src="https://www.google.com/maps?..."></iframe>'
                className="mt-1.5 min-h-[110px]"
              />
              {errors.mapaGoogleEmbedUrl && <p className="text-base text-red-500 mt-1">{errors.mapaGoogleEmbedUrl.message as string}</p>}
            </div>

            <div>
              <Label htmlFor="duracion">
                Duracion <span className="text-red-500">*</span>
              </Label>
              <Input id="duracion" {...register('duracion')} placeholder="Ej: 15 dias / 14 noches" className="mt-1.5" />
              {errors.duracion && <p className="text-base text-red-500 mt-1">{errors.duracion.message}</p>}
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div id="categorias-section">
                <Label>
                  Categorias <span className="text-red-500">*</span>
                </Label>
                <div className="mt-1.5 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="space-y-2 h-48 overflow-y-auto pr-1">
                    {categorias.map((cat) => {
                      const checked = (categoriaIds || []).includes(cat.id);
                      return (
                        <label key={cat.id} className="flex items-center gap-2.5 cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => {
                              const want = next === true;
                              const current = categoriaIds || [];
                              const updated = want
                                ? Array.from(new Set([...current, cat.id]))
                                : current.filter((id) => id !== cat.id);
                              setValue('categoriaIds', updated, { shouldValidate: true });
                            }}
                            className="border-gray-300 data-[state=checked]:bg-black data-[state=checked]:border-black"
                          />
                          <span className="text-sm text-gray-700">{cat.nombre}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {errors.categoriaIds && <p className="text-base text-red-500 mt-1">{errors.categoriaIds.message as string}</p>}
              </div>

              <div id="tipos-section">
                <Label>
                  Tipo <span className="text-red-500">*</span>
                </Label>
                <div className="mt-1.5 rounded-lg border border-gray-200 bg-gray-50 p-3 h-3/4 flex flex-col">
                  <div className="flex gap-2">
                    <Input
                      value={newTypeLabel}
                      onChange={(event) => setNewTypeLabel(event.target.value)}
                      placeholder="Crear nuevo tipo"
                      className="bg-white"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleCreateType();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => void handleCreateType()}
                      disabled={creatingType || !newTypeLabel.trim()}
                      aria-label="Crear tipo"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-3 flex-1 overflow-y-auto pr-1">
                    {excursionTypeOptions.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Aún no hay tipos creados. Agregá el primero con el botón `+`.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {excursionTypeOptions.map((opt) => {
                          const checked = (tipos || []).includes(opt.value);
                          return (
                            <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) => {
                                  const want = next === true;
                                  const current = normalizePackageTypes(tipos || []);
                                  const updated = want
                                    ? Array.from(new Set([...current, opt.value]))
                                    : current.filter((item) => item !== opt.value);
                                  setValue('tipos', updated as PackageAdminFormData['tipos'], { shouldValidate: true });
                                }}
                                className="border-gray-300 data-[state=checked]:bg-black data-[state=checked]:border-black"
                              />
                              <span className="text-sm text-gray-700">{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                {errors.tipos && <p className="text-base text-red-500 mt-1">{errors.tipos.message as string}</p>}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="precio">
                      Precio <span className="text-red-500">*</span>
                    </Label>
                    <Controller
                      name="precio"
                      control={control}
                      render={({ field }) => (
                        <FormattedAmountInput
                          id="precio"
                          value={Number(field.value) || 0}
                          onChange={field.onChange}
                          placeholder="0"
                          className="mt-1.5"
                        />
                      )}
                    />
                    {errors.precio && <p className="text-base text-red-500 mt-1">{errors.precio.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="moneda">
                      Moneda <span className="text-red-500">*</span>
                    </Label>
                    <Controller
                      name="moneda"
                      control={control}
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger className="mt-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ARS">ARS</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="tarifaEspecialHabilitada" className="text-base font-medium cursor-pointer">
                        Tarifa especial
                      </Label>
                      <p className="text-sm text-gray-500">
                        Configura un precio promocional con fecha limite. Al vencer, se muestra automaticamente la tarifa base.
                      </p>
                    </div>
                    <Switch
                      id="tarifaEspecialHabilitada"
                      checked={tarifaEspecialHabilitada}
                      onCheckedChange={(checked) => setValue('tarifaEspecialHabilitada', checked, { shouldValidate: true })}
                    />
                  </div>

                  {tarifaEspecialHabilitada ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label htmlFor="tarifaEspecialPrecio">Tarifa especial *</Label>
                        <Controller
                          name="tarifaEspecialPrecio"
                          control={control}
                          render={({ field }) => (
                            <FormattedAmountInput
                              id="tarifaEspecialPrecio"
                              value={Number(field.value) || 0}
                              onChange={field.onChange}
                              placeholder="0"
                              className="mt-1.5"
                            />
                          )}
                        />
                        {errors.tarifaEspecialPrecio && <p className="text-base text-red-500 mt-1">{errors.tarifaEspecialPrecio.message}</p>}
                      </div>
                      <div>
                        <Label htmlFor="tarifaEspecialFechaLimite">Fecha limite *</Label>
                        <Controller name="tarifaEspecialFechaLimite" control={control} render={({ field }) => <AdminDatePicker id="tarifaEspecialFechaLimite" name={field.name} ref={field.ref} value={field.value ?? ''} onValueChange={field.onChange} onBlur={field.onBlur} required className="mt-1.5" />} />
                        {errors.tarifaEspecialFechaLimite && <p className="text-base text-red-500 mt-1">{errors.tarifaEspecialFechaLimite.message}</p>}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div>
                  <Label>Transporte</Label>
                  <div className="mt-1.5 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                    {TRANSPORTE_OPTIONS.map((opt) => {
                      const checked = selectedTransportes.includes(opt.value);
                      return (
                        <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => {
                              const want = next === true;
                              onSelectedTransportesChange(
                                want ? Array.from(new Set([...selectedTransportes, opt.value])) : selectedTransportes.filter((item) => item !== opt.value)
                              );
                            }}
                            className="border-gray-300 data-[state=checked]:bg-black data-[state=checked]:border-black"
                          />
                          <span className="text-sm text-gray-700">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="mostrarDesde" className="text-base font-medium cursor-pointer">Mostrar &quot;Desde&quot;</Label>
                    <p className="text-sm text-gray-500">Se mostrara &quot;Desde $XXX&quot; en la tarjeta</p>
                  </div>
                  <Switch id="mostrarDesde" checked={mostrarDesde} onCheckedChange={(checked) => setValue('mostrarDesde', checked)} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader className="pb-4">
            <CardTitle>Excursion Destacada y Orden</CardTitle>
            <p className="text-base text-gray-500 mt-1.5">Las excursiones destacadas aparecen en la pagina de inicio (maximo 9)</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
              <div className="space-y-0.5 flex-1">
                  <Label htmlFor="destacado" className="text-sm font-medium cursor-pointer">Marcar como destacado</Label>
                <p className="text-sm text-gray-500 pr-4">Aparecera en la seccion destacados de la homepage (maximo 9)</p>
                {destacadosCount >= 9 && destacado && (mode === 'create' || !wasDestacado) && (
                  <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <p className="text-sm text-amber-700">
                      <strong>Limite alcanzado:</strong> Ya hay {destacadosCount} excursiones destacadas. Solo se mostraran las primeras 9 en el inicio.
                    </p>
                  </div>
                )}
                {destacadosCount < 9 && destacado && (
                  <p className="text-sm text-green-600 mt-2">{destacadosCount + 1} de 9 destacados</p>
                )}
              </div>
              <Switch
                id="destacado"
                checked={destacado}
                onCheckedChange={(checked) => {
                  if (checked && (mode === 'create' || !wasDestacado) && destacadosCount >= 9) {
                    toast.warning('Ya hay 9 excursiones destacadas', {
                      description: 'Solo se mostraran los primeros 9 en el inicio (ordenados por numero de orden)',
                    });
                  }
                  setValue('destacado', checked);
                }}
                className="mt-0.5"
              />
            </div>

            {destacado ? (
              mode === 'create' ? (
                titulo && titulo.length >= 5 ? (
                  <DragDropOrderManager
                    collectionName="paquetes"
                    currentId={undefined}
                    newItemName={titulo}
                    onPositionChange={onSelectedDestacadoPositionChange}
                    maxItems={9}
                    onlyDestacados
                    hideSaveButton
                  />
                ) : (
                  <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-700 font-medium">Ingresa un titulo valido (minimo 5 caracteres) para gestionar el orden de aparicion</p>
                  </div>
                )
              ) : (
                <DragDropOrderManager collectionName="paquetes" currentId={currentId} maxItems={9} onlyDestacados />
              )
            ) : (
              <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <p className="text-base text-blue-700 font-medium">Marca la excursion como destacada para gestionar su orden de aparicion</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Que Incluye?</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableList items={includeItems} onItemsChange={onIncludeItemsChange} placeholder="Ej: Vuelos ida y vuelta" emptyMessage="No hay items en 'Incluye'" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Que NO Incluye?</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableList items={noIncludeItems} onItemsChange={onNoIncludeItemsChange} placeholder="Ej: Comidas no especificadas" emptyMessage="No hay items en 'No Incluye'" />
            </CardContent>
          </Card>
        </div>

        <Card id="editor-content">
          <CardHeader className="pb-4">
            <CardTitle>Condiciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {condicionesItems.map((item, index) => (
                <div key={`condicion-${index}`} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-3">
                      <div>
                        <Label className="text-sm">Titulo</Label>
                        <Input
                          value={item.titulo}
                          onChange={(e) => {
                            const next = [...condicionesItems];
                            next[index] = { ...next[index], titulo: e.target.value };
                            onCondicionesItemsChange(next);
                          }}
                          className="mt-1.5"
                          placeholder="Ej: Reserva"
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Texto</Label>
                        <Textarea
                          value={item.texto}
                          onChange={(e) => {
                            const next = [...condicionesItems];
                            next[index] = { ...next[index], texto: e.target.value };
                            onCondicionesItemsChange(next);
                          }}
                          className="mt-1.5"
                          placeholder="Ej: Sena del 40% para asegurar tu lugar."
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (index === 0) return;
                          const next = [...condicionesItems];
                          const tmp = next[index - 1];
                          next[index - 1] = next[index];
                          next[index] = tmp;
                          onCondicionesItemsChange(next);
                        }}
                        disabled={index === 0}
                        aria-label="Subir"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (index === condicionesItems.length - 1) return;
                          const next = [...condicionesItems];
                          const tmp = next[index + 1];
                          next[index + 1] = next[index];
                          next[index] = tmp;
                          onCondicionesItemsChange(next);
                        }}
                        disabled={index === condicionesItems.length - 1}
                        aria-label="Bajar"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => onCondicionesItemsChange(condicionesItems.filter((_, itemIndex) => itemIndex !== index))}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onCondicionesItemsChange([...condicionesItems, { ...DEFAULT_CONDICIONES[0], titulo: '', texto: '' }])}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar condicion
            </Button>
          </CardContent>
        </Card>

       <Card id="salidas-section">
          <CardHeader className="pb-4">
            <CardTitle>Fechas y Salidas</CardTitle>
            <p className="text-base text-gray-600 mt-1">Carga salidas solo si esta experiencia las necesita</p>
          </CardHeader>
          <CardContent>
            <SalidasManager salidas={salidas} onSalidasChange={onSalidasChange} />
          </CardContent>
        </Card>

        <Card id="adicionales-section">
          <CardHeader className="pb-4">
            <CardTitle>Adicionales</CardTitle>
            <p className="text-base text-gray-600 mt-1">
              Opcionales que el cliente puede sumar a la reserva, después de elegir la fecha.
            </p>
          </CardHeader>
          <CardContent>
            <AddonsManager items={addons} onItemsChange={onAddonsChange} disabled={isBusy} />
          </CardContent>
        </Card>

        <div id="editor-operations"><PackageOperationsEditor value={watch('operations') ?? EMPTY_PACKAGE_OPERATIONS} onChange={(value) => setValue('operations', value, { shouldDirty: true, shouldValidate: true })} />{errors.operations && <p role="alert" className="text-red-700">Revisá hoteles, proveedores y sus condiciones: no pueden estar vacíos ni repetidos y los porcentajes deben estar entre 0 y 100.</p>}</div>
        <Card id="editor-publication">
          <CardHeader className="pb-4">
            <CardTitle>Configuración y publicación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between py-3 border-b">
              <div className="space-y-0.5">
                  <Label htmlFor="visible" className="text-sm font-medium cursor-pointer">Excursion visible</Label>
                <p className="text-sm text-gray-500 pr-4">Activar para que sea visible en el sitio web</p>
              </div>
              <Switch id="visible" checked={visible} onCheckedChange={(checked) => setValue('visible', checked)} className="mt-0.5" />
            </div>

            <div className="flex items-start justify-between py-3">
              <div className="space-y-0.5">
                  <Label htmlFor="ctaWhatsApp" className="text-sm font-medium cursor-pointer">Boton de WhatsApp</Label>
                <p className="text-sm text-gray-500 pr-4">Mostrar boton de contacto directo por WhatsApp en el detalle</p>
              </div>
              <Switch id="ctaWhatsApp" checked={ctaWhatsApp} onCheckedChange={(checked) => setValue('ctaWhatsApp', checked)} className="mt-0.5" />
            </div>

            <div className="flex items-start justify-between py-3 border-t">
              <div className="space-y-0.5">
                  <Label htmlFor="reservasHabilitadas" className="text-sm font-medium cursor-pointer">Reservas habilitadas</Label>
                <p className="text-sm text-gray-500 pr-4">Activa el calendario público y permite avanzar al checkout.</p>
              </div>
              <Switch
                id="reservasHabilitadas"
                checked={Boolean(reservasHabilitadas)}
                onCheckedChange={(checked) => setValue('reservasHabilitadas', checked, { shouldValidate: true })}
                className="mt-0.5"
              />
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <Label htmlFor="maxPersonasPorReserva">
                Máximo de personas por reserva <span className="text-red-500">*</span>
              </Label>
              <Controller
                name="maxPersonasPorReserva"
                control={control}
                render={({ field }) => (
                  <Input
                    id="maxPersonasPorReserva"
                    type="number"
                    min={1}
                    max={50}
                    value={field.value ?? 1}
                    onChange={(event) => field.onChange(Number(event.target.value) || 1)}
                    className="mt-1.5 max-w-xs"
                  />
                )}
              />
              <p className="mt-2 text-sm text-gray-500">
                El usuario podrá reservar hasta este límite en una sola operación. No hay un límite total de ventas por fecha.
              </p>
              {errors.maxPersonasPorReserva && <p className="text-base text-red-500 mt-1">{errors.maxPersonasPorReserva.message}</p>}
            </div>

            {/* <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <Label htmlFor="minLeadHours">Anticipación mínima de reserva (horas)</Label>
              <Controller
                name="minLeadHours"
                control={control}
                render={({ field }) => (
                  <Input
                    id="minLeadHours"
                    type="number"
                    min={0}
                    max={720}
                    value={field.value ?? 48}
                    onChange={(event) => field.onChange(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                    className="mt-1.5 max-w-xs"
                  />
                )}
              />
              <p className="mt-2 text-sm text-gray-500">
                Horas de anticipación mínima para poder reservar una fecha. Con el valor recomendado de{' '}
                <span className="font-semibold text-gray-700">48 hs</span>, hoy y mañana quedan bloqueados en el
                calendario y el checkout rechaza fechas fuera del plazo. Usá 0 para permitir reservas de último
                momento.
              </p>
              {errors.minLeadHours && <p className="text-base text-red-500 mt-1">{errors.minLeadHours.message}</p>}
            </div> */}

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Label className="text-base">Categorías de pasajeros</Label>
                  <p className="mt-1 text-sm text-gray-500">
                    Define los mínimos y máximos por tipo. El total se limita por el máximo de personas por reserva.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const currentMax = Math.max(1, Number(watch('maxPersonasPorReserva') ?? 1) || 1);
                    const current = Array.isArray(watch('peopleCategories')) ? (watch('peopleCategories') as any[]) : [];
                    const index = current.length + 1;
                    const baseKey = `cat-${index}`;
                    const nextKey = current.some((item) => item?.key === baseKey) ? `cat-${Date.now()}` : baseKey;
                    setValue(
                      'peopleCategories',
                      [
                        ...current,
                        {
                          key: nextKey,
                          label: `Categoría ${index}`,
                          min: 0,
                          max: currentMax,
                        },
                      ] as any,
                      { shouldValidate: true }
                    );
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar categoría
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {(Array.isArray(watch('peopleCategories')) ? watch('peopleCategories') : []).map((item: any, index: number) => (
                  <div
                    key={`${item?.key || 'cat'}-${index}`}
                    className="grid gap-3 rounded-lg border border-gray-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_160px_120px_120px_40px]"
                  >
                    <div className="space-y-1">
                      <Label className="text-sm text-gray-600">Nombre</Label>
                      <Input
                        value={String(item?.label ?? '')}
                        onChange={(event) => {
                          const current = Array.isArray(watch('peopleCategories')) ? (watch('peopleCategories') as any[]) : [];
                          const next = current.map((row, idx) => (idx === index ? { ...row, label: event.target.value } : row));
                          setValue('peopleCategories', next as any, { shouldValidate: true });
                        }}
                        placeholder="Ej: Adultos"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-sm text-gray-600">Clave</Label>
                      <Input
                        value={String(item?.key ?? '')}
                        onChange={(event) => {
                          const current = Array.isArray(watch('peopleCategories')) ? (watch('peopleCategories') as any[]) : [];
                          const next = current.map((row, idx) => (idx === index ? { ...row, key: event.target.value } : row));
                          setValue('peopleCategories', next as any, { shouldValidate: true });
                        }}
                        placeholder="adultos"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-sm text-gray-600">Mín</Label>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        value={Number(item?.min ?? 0)}
                        onChange={(event) => {
                          const value = Math.max(0, Math.floor(Number(event.target.value) || 0));
                          const current = Array.isArray(watch('peopleCategories')) ? (watch('peopleCategories') as any[]) : [];
                          const next = current.map((row, idx) => (idx === index ? { ...row, min: value } : row));
                          setValue('peopleCategories', next as any, { shouldValidate: true });
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-sm text-gray-600">Máx</Label>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        value={Number(item?.max ?? 0)}
                        onChange={(event) => {
                          const maxTotal = Math.max(1, Number(watch('maxPersonasPorReserva') ?? 1) || 1);
                          const value = Math.max(0, Math.min(50, Math.min(maxTotal, Math.floor(Number(event.target.value) || 0))));
                          const current = Array.isArray(watch('peopleCategories')) ? (watch('peopleCategories') as any[]) : [];
                          const next = current.map((row, idx) => (idx === index ? { ...row, max: value } : row));
                          setValue('peopleCategories', next as any, { shouldValidate: true });
                        }}
                      />
                    </div>

                    <div className="flex items-end justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const current = Array.isArray(watch('peopleCategories')) ? (watch('peopleCategories') as any[]) : [];
                          const next = current.filter((_, idx) => idx !== index);
                          setValue('peopleCategories', next as any, { shouldValidate: true });
                        }}
                        aria-label="Eliminar categoría"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {errors.peopleCategories && (
                <p className="mt-2 text-base text-red-500">{(errors.peopleCategories as any)?.message ?? 'Revisa las categorías.'}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card id="imagenes-section">
          <CardHeader className="pb-4">
            <CardTitle>Imagenes de la Excursion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ImageUploader
              images={imagenTarjetaPreview}
              onImagesChange={onImagenTarjetaChange}
              maxImages={1}
              label="Imagen de tarjeta *"
              description="Se usa en las cards del sitio. Medida recomendada: 1200x900 px."
            />
            <ImageUploader
              images={imagenPortadaMobilePreview}
              onImagesChange={onImagenPortadaMobileChange}
              maxImages={1}
              label="Imagen de portada mobile *"
              description="Se usa en el hero mobile de la excursion. Medida recomendada: 1080x1350 px."
            />
            <ImageUploader
              images={imagenPortadaDesktopPreview}
              onImagesChange={onImagenPortadaDesktopChange}
              maxImages={1}
              label="Imagen de portada PC *"
              description="Se usa en el hero desktop de la excursion. Medida recomendada: 1920x900 px."
            />
            <ImageUploader
              images={galeriaPreview}
              onImagesChange={onGaleriaChange}
              maxImages={8}
              label="Galeria de imagenes"
              description="Imagenes adicionales para la galeria de la excursion."
            />
          </CardContent>
        </Card>

        <div className="admin-editor-actions flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" asChild size="lg">
            <Link href="/admin/paquetes">Cancelar</Link>
          </Button>
          <Button type="submit" size="lg" className="bg-black hover:bg-gray-800 text-white min-w-[180px]" disabled={isBusy}>
            {isBusy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {submitState === 'validating' ? 'Validando...' : submittingLabel}
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
