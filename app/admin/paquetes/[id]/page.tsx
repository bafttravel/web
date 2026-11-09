'use client';

import { use, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { operationsFetch } from '@/lib/operations/client';
import type { PackageOperations } from '@/lib/operations/types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadMultipleImages } from '@/lib/utils/upload';
import { deleteBlobByKey, getBlobKeyFromUrl } from '@/lib/utils/blob';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { slugify } from '@/lib/utils/slugify';
import { revalidateFrontPaths } from '@/lib/revalidate';
import type { Paquete, Categoria } from '@/types';
import PackageForm from '@/components/admin/PackageForm';
import { usePackageEditorState } from '@/components/admin/usePackageEditorState';
import { countFeaturedPackages, createExcursionType, fetchActiveCategorias, subscribeExcursionTypes } from '@/lib/packages/admin-queries';
import { syncPackageCategoryData } from '@/lib/packages/category-utils';
import { normalizePeopleCategories } from '@/lib/packages/people-categories';
import {
  collectFormErrorMessages,
  countFormErrors,
  findFirstErrorPath,
  getFieldLabelFromPath,
  scrollToFormTarget,
} from '@/lib/packages/admin-submit-feedback';
import {
  DEFAULT_CONDICIONES,
  buildPackageAdminPayload,
  dataURLtoFile,
  normalizePackageCategoryIds,
  normalizePackageTypes,
  packageAdminDefaultValues,
  packageAdminFormSchema,
  type PackageAdminFormData,
} from '@/lib/packages/admin-form';
import type { ExcursionTypeOption } from '@/lib/packages/package-types';

export default function EditarPaquetePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'validating' | 'saving' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [currentPackage, setCurrentPackage] = useState<Paquete | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [excursionTypes, setExcursionTypes] = useState<ExcursionTypeOption[]>([]);
  const [destacadosCount, setDestacadosCount] = useState(0);
  const [wasDestacado, setWasDestacado] = useState(false);
  const router = useRouter();
  const defaultCondiciones = useMemo(() => DEFAULT_CONDICIONES.map((item) => ({ ...item })), []);
  const editor = usePackageEditorState({ defaultCondiciones });
  const hydrateFromPackage = editor.hydrateFromPackage;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<PackageAdminFormData>({
    resolver: zodResolver(packageAdminFormSchema),
    defaultValues: packageAdminDefaultValues,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catData, destacadosOtros] = await Promise.all([
          fetchActiveCategorias(),
          countFeaturedPackages(id),
        ]);
        setCategorias(catData);
        setDestacadosCount(destacadosOtros);

        // Cargar paquete
        const docRef = doc(db, 'paquetes', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = syncPackageCategoryData(docSnap.data() as Paquete, catData);
          setCurrentPackage(data);
          setWasDestacado(data.destacado); // Guardar estado original
          setValue('titulo', data.titulo);
          const privateData = await operationsFetch<{ operations: PackageOperations }>(`/api/admin/package-operations?id=${encodeURIComponent(id)}`);
          setValue('operations', privateData.operations);
          setValue('descripcion', data.descripcionLarga || data.descripcion);
          setValue('descripcionCorta', data.descripcionCorta || '');
          setValue('mostrarItinerario', Boolean(data.mostrarItinerario));
          setValue(
            'itinerarioSteps',
            Array.isArray((data as any).itinerarioSteps) && (data as any).itinerarioSteps.length > 0
              ? (data as any).itinerarioSteps
              : data.itinerario
                ? [{ id: `step-${Date.now()}`, titulo: '', descripcion: data.itinerario }]
                : []
          );
          setValue('mapaGoogleEmbedUrl', data.mapaGoogleEmbedUrl || '');
          setValue('categoriaIds', normalizePackageCategoryIds(data.categoriaIds ?? [], data.categoriaId ?? null));
          setValue('tipos', normalizePackageTypes(data.tipos ?? [data.tipo]));
          setValue('precio', data.precio);
          setValue('tarifaEspecialHabilitada', Boolean((data as any).precioDescuentoPrimerosCupos));
          setValue('tarifaEspecialPrecio', (data as any).precioDescuentoPrimerosCupos ?? 0);
          setValue('tarifaEspecialFechaLimite', (data as any).tarifaEspecialFechaLimite || '');
          setValue('moneda', data.moneda || 'ARS');
          setValue('mostrarDesde', data.mostrarDesde ?? true); // Default true para retrocompatibilidad
          setValue('duracion', data.duracion);
          setValue('reservasHabilitadas', data.bookingConfig?.enabled !== false);
          const maxPersonas = data.bookingConfig?.maxPeoplePerBooking ?? data.capacidadMaxima ?? 6;
          setValue('maxPersonasPorReserva', maxPersonas);
          setValue(
            'minLeadHours',
            typeof (data.bookingConfig as any)?.minLeadHours === 'number'
              ? Math.max(0, Math.floor(Number((data.bookingConfig as any).minLeadHours)))
              : 48
          );
          setValue('peopleCategories', normalizePeopleCategories((data.bookingConfig as any)?.peopleCategories, maxPersonas));
          setValue('visible', data.visible);
          setValue('destacado', data.destacado);
          setValue('ctaWhatsApp', data.ctaWhatsApp);
          hydrateFromPackage(data, { getBlobKeyFromUrl });
        } else {
          toast.error('Excursion no encontrada');
          router.push('/admin/paquetes');
        }
      } catch (error) {
        setCurrentPackage(null);
        console.error('Error fetching data:', error);
        toast.error('Error al cargar datos');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [hydrateFromPackage, id, router, setValue]);

  useEffect(() => {
    const unsubscribe = subscribeExcursionTypes(
      (items) => setExcursionTypes(items),
      (error) => {
        console.error('Error syncing excursion types:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleCreateExcursionType = async (label: string) => {
    const created = await createExcursionType(label);
    toast.success('Tipo creado correctamente');
    return created;
  };

  const onSubmit = async (data: PackageAdminFormData) => {
    if (!currentPackage || !data.operations) { toast.error('No se cargaron todas las condiciones comerciales. Recargá antes de guardar para no perder datos.'); return; }
    setSubmitState('saving');
    setSubmitMessage('Preparando los cambios para guardar...');
    if (
      editor.imagenTarjetaPreview.length === 0 ||
      editor.imagenPortadaMobilePreview.length === 0 ||
      editor.imagenPortadaDesktopPreview.length === 0
    ) {
      setSubmitState('error');
      setSubmitMessage('Faltan imagenes obligatorias. Carga tarjeta, portada mobile y portada PC para continuar.');
      toast.error('Debes agregar imagen de tarjeta, portada mobile y portada PC');
      scrollToFormTarget('#imagenes-section');
      return;
    }
    setSaving(true);
    try {
      const isDataUrl = (value: string) => value.startsWith('data:');
      const cardPreview = editor.imagenTarjetaPreview[0] ?? '';
      const coverMobilePreview = editor.imagenPortadaMobilePreview[0] ?? '';
      const coverDesktopPreview = editor.imagenPortadaDesktopPreview[0] ?? '';

      const finalCard = {
        url: cardPreview,
        key: editor.imagenTarjetaKey || getBlobKeyFromUrl(cardPreview) || '',
      };
      if (isDataUrl(cardPreview)) {
        toast.info('Subiendo imagen de tarjeta...', { id: 'upload-card' });
        const [result] = await uploadMultipleImages([
          dataURLtoFile(cardPreview, `paquete-card-${Date.now()}.jpg`),
        ]);
        finalCard.url = result.url;
        finalCard.key = result.key;
        const keyToDelete = editor.originalImagenTarjetaKey ?? getBlobKeyFromUrl(editor.imagenTarjetaOriginal);
        if (keyToDelete) {
          await deleteBlobByKey(keyToDelete).catch((error) => {
            console.error('[paquetes] error borrando imagen de tarjeta:', error);
          });
        }
        toast.success('Imagen de tarjeta actualizada', { id: 'upload-card' });
      }

      const finalCoverMobile = {
        url: coverMobilePreview,
        key: editor.imagenPortadaMobileKey || getBlobKeyFromUrl(coverMobilePreview) || '',
      };
      if (isDataUrl(coverMobilePreview)) {
        toast.info('Subiendo imagen de portada mobile...', { id: 'upload-cover-mobile' });
        const [result] = await uploadMultipleImages([
          dataURLtoFile(coverMobilePreview, `paquete-cover-mobile-${Date.now()}.jpg`),
        ]);
        finalCoverMobile.url = result.url;
        finalCoverMobile.key = result.key;
        const keyToDelete = editor.originalImagenPortadaMobileKey ?? getBlobKeyFromUrl(editor.imagenPortadaMobileOriginal);
        if (keyToDelete) {
          await deleteBlobByKey(keyToDelete).catch((error) => {
            console.error('[paquetes] error borrando imagen de portada mobile:', error);
          });
        }
        toast.success('Imagen de portada mobile actualizada', { id: 'upload-cover-mobile' });
      }

      const finalCoverDesktop = {
        url: coverDesktopPreview,
        key: editor.imagenPortadaDesktopKey || getBlobKeyFromUrl(coverDesktopPreview) || '',
      };
      if (isDataUrl(coverDesktopPreview)) {
        toast.info('Subiendo imagen de portada PC...', { id: 'upload-cover-desktop' });
        const [result] = await uploadMultipleImages([
          dataURLtoFile(coverDesktopPreview, `paquete-cover-desktop-${Date.now()}.jpg`),
        ]);
        finalCoverDesktop.url = result.url;
        finalCoverDesktop.key = result.key;
        const keyToDelete = editor.originalImagenPortadaDesktopKey ?? getBlobKeyFromUrl(editor.imagenPortadaDesktopOriginal);
        if (keyToDelete) {
          await deleteBlobByKey(keyToDelete).catch((error) => {
            console.error('[paquetes] error borrando imagen de portada PC:', error);
          });
        }
        toast.success('Imagen de portada PC actualizada', { id: 'upload-cover-desktop' });
      }

      let uploadedGalleryResults: { url: string; key: string }[] = [];
      const dataUrlGaleria = editor.galleryAssets.filter((asset) => isDataUrl(asset.url));
      if (dataUrlGaleria.length > 0) {
        toast.info('Subiendo imágenes de galería...', { id: 'upload-gal' });
        const files = dataUrlGaleria.map((asset, index) =>
          dataURLtoFile(asset.url, `paquete-gallery-${Date.now()}-${index}.jpg`)
        );
        uploadedGalleryResults = await uploadMultipleImages(files);
        toast.success('Galería actualizada', { id: 'upload-gal' });
      }

      const finalGalleryAssets = editor.galleryAssets.map((asset) => {
        if (isDataUrl(asset.url)) {
          const nextResult = uploadedGalleryResults.shift();
          if (!nextResult) {
            return { url: asset.url, key: asset.key ?? '' };
          }
          return { url: nextResult.url, key: nextResult.key };
        }
        const key = asset.key ?? getBlobKeyFromUrl(asset.url) ?? '';
        return { url: asset.url, key };
      });

      const galeriaUrls = finalGalleryAssets.map((asset) => asset.url);
      const galeriaKeys = finalGalleryAssets.map((asset) => asset.key);

      const keysToDelete = new Set<string>();
      if (editor.originalImagenTarjetaKey && finalCard.key && editor.originalImagenTarjetaKey !== finalCard.key) {
        keysToDelete.add(editor.originalImagenTarjetaKey);
      }
      if (
        editor.originalImagenPortadaMobileKey &&
        finalCoverMobile.key &&
        editor.originalImagenPortadaMobileKey !== finalCoverMobile.key
      ) {
        keysToDelete.add(editor.originalImagenPortadaMobileKey);
      }
      if (
        editor.originalImagenPortadaDesktopKey &&
        finalCoverDesktop.key &&
        editor.originalImagenPortadaDesktopKey !== finalCoverDesktop.key
      ) {
        keysToDelete.add(editor.originalImagenPortadaDesktopKey);
      }
      const finalGalleryKeySet = new Set(galeriaKeys.filter((key): key is string => Boolean(key)));
      editor.originalGaleriaKeys.forEach((key) => {
        if (key && !finalGalleryKeySet.has(key)) {
          keysToDelete.add(key);
        }
      });

      if (keysToDelete.size > 0) {
        const deletions = Array.from(keysToDelete);
        const results = await Promise.allSettled(deletions.map((key) => deleteBlobByKey(key)));
        results.forEach((result, idx) => {
          if (result.status === 'rejected') {
            console.error('[paquetes] error borrando blob:', deletions[idx], result.reason);
          }
        });
      }

      const slug = slugify(data.titulo);

      const sanitizedData = {
        slug,
        ...buildPackageAdminPayload({
          data,
          categorias,
          includeItems: editor.includeItems,
          selectedTransportes: editor.selectedTransportes,
          tagItems: editor.tagItems,
          noIncludeItems: editor.noIncludeItems,
          condicionesItems: editor.condicionesItems,
          addons: editor.addons,
          salidas: editor.salidas,
          fechaVencimiento: editor.fechaVencimiento,
          imageData: {
            imagenPrincipal: finalCard.url,
            imagenPrincipalKey: finalCard.key,
            imagenTarjeta: finalCard.url,
            imagenTarjetaKey: finalCard.key,
            imagenPortada: finalCoverDesktop.url,
            imagenPortadaKey: finalCoverDesktop.key,
            imagenPortadaMobile: finalCoverMobile.url,
            imagenPortadaMobileKey: finalCoverMobile.key,
            imagenPortadaDesktop: finalCoverDesktop.url,
            imagenPortadaDesktopKey: finalCoverDesktop.key,
            galeria: galeriaUrls,
            galeriaKeys,
          },
          existingBookingConfig: currentPackage?.bookingConfig ?? null,
          extra: undefined,
        }),
      };

      // Subir imágenes nuevas de adicionales (dataURL) y reinyectar URLs finales
      const dataUrlAddons = editor.addons.filter((addon) => addon.image.startsWith('data:'));
      if (dataUrlAddons.length > 0) {
        toast.info('Subiendo imágenes de adicionales...', { id: 'upload-addons' });
        const addonFiles = dataUrlAddons.map((addon, index) =>
          dataURLtoFile(addon.image, `paquete-addon-${Date.now()}-${index}.jpg`)
        );
        const addonResults = await uploadMultipleImages(addonFiles);
        const urlById = new Map<string, { url: string; key: string }>();
        dataUrlAddons.forEach((addon, index) => {
          const result = addonResults[index];
          if (result) urlById.set(addon.id, result);
        });
        (sanitizedData as any).addons = ((sanitizedData as any).addons ?? []).map((addon: any) => {
          const uploaded = urlById.get(String(addon?.id ?? ''));
          return uploaded ? { ...addon, image: uploaded.url, imageKey: uploaded.key } : addon;
        });
        toast.success('Imágenes de adicionales actualizadas', { id: 'upload-addons' });
      }

      // Borrar blobs de adicionales eliminados o reemplazados
      const previousAddons = Array.isArray((currentPackage as any)?.addons) ? ((currentPackage as any).addons as any[]) : [];
      const finalAddonKeySet = new Set(
        (((sanitizedData as any).addons ?? []) as any[])
          .map((addon: any) => String(addon?.imageKey ?? '').trim())
          .filter(Boolean)
      );
      previousAddons.forEach((addon: any) => {
        const prevKey = String(addon?.imageKey ?? getBlobKeyFromUrl(String(addon?.image ?? '')) ?? '').trim();
        if (prevKey && !finalAddonKeySet.has(prevKey)) keysToDelete.add(prevKey);
      });

      await operationsFetch('/api/admin/package-operations', { method: 'POST', body: JSON.stringify({ id, package: sanitizedData, operations: data.operations ?? { hotels: [], providers: [], costsComplete: false }, removeSpecialPrice: !data.tarifaEspecialHabilitada }) });
      const slugNew = slugify(data.titulo);
      await revalidateFrontPaths(['/excursiones', `/excursion/${slugNew}`]);

      toast.success('Excursion actualizada correctamente');
      router.push('/admin/paquetes');
    } catch (error) {
      console.error('Error updating paquete:', error);
      setSubmitState('error');
      setSubmitMessage('No pudimos guardar los cambios. Revisa los datos e intenta nuevamente.');
      toast.error('Error al actualizar la excursion');
    } finally {
      setSaving(false);
    }
  };

  const onInvalid = (formErrors: FieldErrors<PackageAdminFormData>) => {
    const totalErrors = countFormErrors(formErrors as Record<string, unknown>);
    const firstPath = findFirstErrorPath(formErrors as Record<string, unknown>);
    const firstError = collectFormErrorMessages(formErrors as Record<string, unknown>)[0];
    const firstFieldLabel = getFieldLabelFromPath(firstError?.path ?? firstPath);
    const detailedMessage = firstError?.message
      ? `${firstFieldLabel ? `${firstFieldLabel}: ` : ''}${firstError.message}`
      : '';
    setSubmitState('error');
    setSubmitMessage(
      detailedMessage ||
        (totalErrors > 0
          ? `Revisa ${totalErrors} campo${totalErrors === 1 ? '' : 's'} antes de guardar. Te lleve al primero.`
          : 'Hay datos pendientes para poder guardar los cambios.')
    );
    toast.error(
      detailedMessage ||
        (totalErrors > 0
          ? `Revisa ${totalErrors} campo${totalErrors === 1 ? '' : 's'} antes de guardar`
          : 'Hay datos pendientes para poder guardar')
    );
    scrollToFormTarget(firstPath);
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-12 w-12 animate-spin text-gray-900" />
          </div>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AdminLayout>
        <form
          onSubmitCapture={() => {
            setSubmitState('validating');
            setSubmitMessage('Validando cambios...');
          }}
          onSubmit={handleSubmit(onSubmit, onInvalid)}
        >
          <PackageForm
            mode="edit"
            categorias={categorias}
            excursionTypes={excursionTypes}
            onCreateExcursionType={handleCreateExcursionType}
            register={register}
            control={control}
            watch={watch}
            setValue={setValue}
            errors={errors}
            includeItems={editor.includeItems}
            onIncludeItemsChange={editor.setIncludeItems}
            selectedTransportes={editor.selectedTransportes}
            onSelectedTransportesChange={editor.setSelectedTransportes}
            noIncludeItems={editor.noIncludeItems}
            onNoIncludeItemsChange={editor.setNoIncludeItems}
            condicionesItems={editor.condicionesItems}
            onCondicionesItemsChange={editor.setCondicionesItems}
            addons={editor.addons}
            onAddonsChange={editor.setAddons}
            salidas={editor.salidas}
            onSalidasChange={editor.setSalidas}
            imagenTarjetaPreview={editor.imagenTarjetaPreview}
            onImagenTarjetaChange={editor.handleImagenTarjetaChange}
            imagenPortadaMobilePreview={editor.imagenPortadaMobilePreview}
            onImagenPortadaMobileChange={editor.handleImagenPortadaMobileChange}
            imagenPortadaDesktopPreview={editor.imagenPortadaDesktopPreview}
            onImagenPortadaDesktopChange={editor.handleImagenPortadaDesktopChange}
            galeriaPreview={editor.galeriaPreview}
            onGaleriaChange={editor.handleGaleriaChange}
            destacadosCount={destacadosCount}
            wasDestacado={wasDestacado}
            currentId={id}
            loading={saving}
            submitState={submitState}
            submitMessage={submitMessage}
            title="Editar Excursion"
            subtitle="Modifica la informacion de la excursion"
            submitLabel="Guardar Cambios"
            submittingLabel="Guardando..."
          />
        </form>
      </AdminLayout>
    </ProtectedRoute>
  );
}
