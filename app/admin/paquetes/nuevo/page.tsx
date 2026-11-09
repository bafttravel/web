'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { operationsFetch } from '@/lib/operations/client';
import { collection, Timestamp, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadMultipleImages } from '@/lib/utils/upload';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import ProtectedRoute from '@/components/admin/ProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import { toast } from 'sonner';
import { slugify } from '@/lib/utils/slugify';
import { revalidateFrontPaths } from '@/lib/revalidate';
import type { Categoria } from '@/types';
import PackageForm from '@/components/admin/PackageForm';
import { usePackageEditorState } from '@/components/admin/usePackageEditorState';
import { countFeaturedPackages, createExcursionType, fetchActiveCategorias, subscribeExcursionTypes } from '@/lib/packages/admin-queries';
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
  packageAdminDefaultValues,
  packageAdminFormSchema,
  type PackageAdminFormData,
} from '@/lib/packages/admin-form';
import type { ExcursionTypeOption } from '@/lib/packages/package-types';

export default function NuevoPaquetePage() {
  const [loading, setLoading] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'validating' | 'saving' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [excursionTypes, setExcursionTypes] = useState<ExcursionTypeOption[]>([]);
  const [destacadosCount, setDestacadosCount] = useState(0);
  const [selectedDestacadoPosition, setSelectedDestacadoPosition] = useState<number | null>(null);
  const router = useRouter();
  const defaultCondiciones = useMemo(() => DEFAULT_CONDICIONES.map((item) => ({ ...item })), []);
  const editor = usePackageEditorState({ defaultCondiciones });

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

  // Cargar categorías y contar destacados
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [categoriasData, destacados] = await Promise.all([
          fetchActiveCategorias(),
          countFeaturedPackages(),
        ]);
        setCategorias(categoriasData);
        setDestacadosCount(destacados);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Error al cargar datos');
      }
    };

    fetchData();
  }, []);

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
    setSubmitState('saving');
    setSubmitMessage('Preparando la excursion para guardar...');
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
    setLoading(true);
    try {
      const cardFiles = editor.imagenTarjetaPreview.map((preview, index) =>
        dataURLtoFile(preview, `paquete-card-${Date.now()}-${index}.jpg`)
      );
      const coverMobileFiles = editor.imagenPortadaMobilePreview.map((preview, index) =>
        dataURLtoFile(preview, `paquete-cover-mobile-${Date.now()}-${index}.jpg`)
      );
      const coverDesktopFiles = editor.imagenPortadaDesktopPreview.map((preview, index) =>
        dataURLtoFile(preview, `paquete-cover-desktop-${Date.now()}-${index}.jpg`)
      );
      const galleryFiles = editor.galeriaPreview.map((preview, index) =>
        dataURLtoFile(preview, `paquete-gallery-${Date.now()}-${index}.jpg`)
      );

      toast.info('Subiendo imágenes...', { id: 'upload' });
      const [imagenTarjetaResult] = await uploadMultipleImages(cardFiles);
      const [imagenPortadaMobileResult] = await uploadMultipleImages(coverMobileFiles);
      const [imagenPortadaDesktopResult] = await uploadMultipleImages(coverDesktopFiles);
      const galeriaResults = galleryFiles.length > 0 ? await uploadMultipleImages(galleryFiles) : [];
      const imagenTarjetaUrl = imagenTarjetaResult.url;
      const imagenTarjetaKey = imagenTarjetaResult.key;
      const imagenPortadaMobileUrl = imagenPortadaMobileResult.url;
      const imagenPortadaMobileKey = imagenPortadaMobileResult.key;
      const imagenPortadaDesktopUrl = imagenPortadaDesktopResult.url;
      const imagenPortadaDesktopKey = imagenPortadaDesktopResult.key;
      const galeriaUrls = galeriaResults.length > 0 ? galeriaResults.map((item) => item.url) : [];
      const galeriaKeys = galeriaResults.length > 0 ? galeriaResults.map((item) => item.key) : [];
      toast.success('Imágenes subidas correctamente', { id: 'upload' });

      const slug = slugify(data.titulo);

      // Determinar el orden a usar
      let nuevoOrden: number;
      
      if (data.destacado && selectedDestacadoPosition !== null) {
        // Usar posición elegida para destacados
        nuevoOrden = selectedDestacadoPosition;
        
        // Actualizar órdenes de paquetes destacados existentes
        const paquetesSnapshot = await getDocs(collection(db, 'paquetes'));
        const paquetesData = paquetesSnapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data()
          } as { id: string; orden: number; destacado?: boolean }))
          .filter(p => p.destacado === true); // Solo destacados
        
        const batch = writeBatch(db);
        
        paquetesData.forEach((paquete) => {
          if (paquete.orden >= nuevoOrden) {
            batch.update(doc(db, 'paquetes', paquete.id), {
              orden: paquete.orden + 1
            });
          }
        });
        
        await batch.commit();
      } else {
        // Orden por defecto (al final)
        const paquetesSnapshot = await getDocs(collection(db, 'paquetes'));
        const maxOrden = paquetesSnapshot.docs.length > 0 
          ? Math.max(...paquetesSnapshot.docs.map(doc => (doc.data().orden || 0))) 
          : 0;
        nuevoOrden = maxOrden + 1;
      }

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
            imagenPrincipal: imagenTarjetaUrl,
            imagenPrincipalKey: imagenTarjetaKey,
            imagenTarjeta: imagenTarjetaUrl,
            imagenTarjetaKey,
            imagenPortada: imagenPortadaDesktopUrl,
            imagenPortadaKey: imagenPortadaDesktopKey,
            imagenPortadaMobile: imagenPortadaMobileUrl,
            imagenPortadaMobileKey,
            imagenPortadaDesktop: imagenPortadaDesktopUrl,
            imagenPortadaDesktopKey,
            galeria: galeriaUrls,
            galeriaKeys,
          },
          extra: {
            orden: nuevoOrden,
            fechaCreacion: Timestamp.now(),
          },
        }),
      };

      // Subir imágenes de adicionales (dataURL) y reinyectar URLs finales
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
        toast.success('Imágenes de adicionales listas', { id: 'upload-addons' });
      }

      await operationsFetch('/api/admin/package-operations', { method: 'POST', body: JSON.stringify({ package: sanitizedData, operations: data.operations ?? { hotels: [], providers: [], costsComplete: false } }) });
      await revalidateFrontPaths(['/excursiones', `/excursion/${slug}`]);

      toast.success('✅ Excursion creada correctamente', {
        description: 'Puedes reordenarlo arrastrando desde la lista principal',
      });
      router.push('/admin/paquetes');
    } catch (error) {
      console.error('Error creating paquete:', error);
      setSubmitState('error');
      setSubmitMessage('No pudimos crear la excursion. Revisa los datos e intenta nuevamente.');
      toast.error('Error al crear la excursion');
    } finally {
      setLoading(false);
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
          : 'Hay datos pendientes para poder guardar la excursion.')
    );
    toast.error(
      detailedMessage ||
        (totalErrors > 0
          ? `Revisa ${totalErrors} campo${totalErrors === 1 ? '' : 's'} antes de guardar`
          : 'Hay datos pendientes para poder guardar')
    );
    scrollToFormTarget(firstPath);
  };

  return (
    <ProtectedRoute>
      <AdminLayout>
        <div className="max-w-5xl mx-auto space-y-6 pb-12">
          <form
            onSubmitCapture={() => {
              setSubmitState('validating');
              setSubmitMessage('Validando datos de la excursion...');
            }}
            onSubmit={handleSubmit(onSubmit, onInvalid)}
          >
            <PackageForm
              mode="create"
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
              onImagenTarjetaChange={editor.setImagenTarjetaPreview}
              imagenPortadaMobilePreview={editor.imagenPortadaMobilePreview}
              onImagenPortadaMobileChange={editor.setImagenPortadaMobilePreview}
              imagenPortadaDesktopPreview={editor.imagenPortadaDesktopPreview}
              onImagenPortadaDesktopChange={editor.setImagenPortadaDesktopPreview}
              galeriaPreview={editor.galeriaPreview}
              onGaleriaChange={editor.setGaleriaPreview}
              destacadosCount={destacadosCount}
              selectedDestacadoPosition={selectedDestacadoPosition}
              onSelectedDestacadoPositionChange={setSelectedDestacadoPosition}
              loading={loading}
              submitState={submitState}
              submitMessage={submitMessage}
              title="Nueva Excursion"
              subtitle="Crea una nueva excursion"
              submitLabel="Crear Excursion"
              submittingLabel="Creando..."
            />
          </form>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
