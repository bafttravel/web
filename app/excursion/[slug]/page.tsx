import { doc, getDoc } from 'firebase/firestore';
import { db, firebaseEnabled } from '@/lib/firebase';
import { Categoria, Paquete } from '@/types';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import HomeFooter from '@/components/home/HomeFooter';
import HomeFeaturesRow from '@/components/home/HomeFeaturesRow';
import WhatsAppButton from '@/components/WhatsAppButton';
import PaqueteSidebar from '@/components/PaqueteSidebar';
import PaqueteSchema from '@/components/PaqueteSchema';
import PaqueteCarousel from '@/components/paquete/PaqueteCarousel';
import PaqueteGalleryGrid from '@/components/paquete/PaqueteGalleryGrid';
import PaqueteGoogleMap from '@/components/paquete/PaqueteGoogleMap';
import PaqueteItinerary from '@/components/paquete/PaqueteItinerary';
import Link from 'next/link';
import { CheckCircle, XCircle, MapPin, Facebook, Instagram, Link2, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { serializeFirestoreData } from '@/lib/utils/serialize';
import { getPaqueteBySlug } from '@/lib/paquetes';
import { getOperationalSalidas, resolveDepartureConfig } from '@/lib/packages/resolve-departure';
import { getPrimaryPackageCategoryId } from '@/lib/packages/category-utils';
import { sanitizePackageRichHtml } from '@/lib/packages/rich-text-sanitize';
import { extractPlainTextFromRichText } from '@/lib/packages/rich-text-validation';
import { buildPageTitle } from '@/lib/siteConfig';
import { getLocale, getTranslations } from 'next-intl/server';
import { localizePaquete, localizeCategoria } from '@/lib/i18n/cms-content';
import type { AppLocale } from '@/i18n/routing';

/** Sin caché: los cambios del admin se ven de inmesdiato */
export const revalidate = 0;

function normalizeCondiciones(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const parsed = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const titulo = String((item as { titulo?: unknown }).titulo ?? '').trim();
      const texto = String((item as { texto?: unknown }).texto ?? '').trim();
      if (!titulo || !texto) return null;
      return { titulo, texto };
    })
    .filter((item): item is { titulo: string; texto: string } => Boolean(item));
  return parsed;
}

async function getPaquete(slug: string): Promise<Paquete | null> {
  if (!firebaseEnabled) return null;
  try {
    const paquete = await getPaqueteBySlug(slug);
    if (!paquete || !paquete.visible) return null;

    const descripcionHtml = sanitizePackageRichHtml(paquete.descripcionLarga || paquete.descripcion);
    const itinerarioHtml = sanitizePackageRichHtml(paquete.itinerario);
    const itinerarioSteps = Array.isArray((paquete as any).itinerarioSteps)
      ? (paquete as any).itinerarioSteps
        .map((step: any) => ({
          id: String(step?.id ?? '').trim(),
          titulo: String(step?.titulo ?? '').trim(),
          descripcion: sanitizePackageRichHtml(step?.descripcion),
        }))
        .filter((step: any) => Boolean(step.id) && (Boolean(step.titulo) || Boolean(step.descripcion)))
      : [];

    return {
      ...paquete,
      descripcion: descripcionHtml || '',
      descripcionLarga: descripcionHtml || '',
      itinerario: itinerarioHtml || '',
      itinerarioSteps,
      condiciones: normalizeCondiciones((paquete as Paquete & { condiciones?: unknown }).condiciones),
    };
  } catch (error) {
    console.error('Error fetching paquete:', error);
    return null;
  }
}

async function getPrimaryDestino(paquete: Paquete): Promise<Categoria | null> {
  const categoriaId = getPrimaryPackageCategoryId(paquete);
  if (!firebaseEnabled || !categoriaId) return null;

  try {
    const snapshot = await getDoc(doc(db, 'categorias', categoriaId));
    if (!snapshot.exists()) return null;

    const categoria = serializeFirestoreData<Categoria>({
      id: snapshot.id,
      ...snapshot.data(),
    });

    return categoria.activa ? categoria : null;
  } catch (error) {
    console.error('Error fetching destino:', error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const locale = (await getLocale()) as AppLocale;
  if (!firebaseEnabled) {
    const siteUrl = SITE_URL;
    const url = `${siteUrl}/${locale}/excursion/${slug}`;
    return {
      title: buildPageTitle(slug),
      description: locale === 'en' ? `Excursion ${slug} at ${SITE_NAME}.` : `Excursión ${slug} en ${SITE_NAME}.`,
      alternates: { canonical: url },
    };
  }
  const paquete = await getPaquete(slug);

  if (!paquete) {
    const x = await getTranslations('excursionPage');
    return {
      title: x('notFound'),
    };
  }

  const localizedPaquete = await localizePaquete(paquete, locale);
  const siteUrl = SITE_URL;
  const url = `${siteUrl}/${locale}/excursion/${slug}`;
  const spanishUrl = `${siteUrl}/es/excursion/${slug}`;
  const englishUrl = `${siteUrl}/en/excursion/${slug}`;

  const cleanDescription =
    localizedPaquete.descripcionCorta ||
    `${extractPlainTextFromRichText(localizedPaquete.descripcionLarga || localizedPaquete.descripcion).substring(0, 160).trim()}...`;

  const coverImage = localizedPaquete.imagenPortada || localizedPaquete.imagenTarjeta || localizedPaquete.imagenPrincipal;

  return {
    title: buildPageTitle(localizedPaquete.titulo),
    description: cleanDescription,
    alternates: {
      canonical: url,
      languages: { es: spanishUrl, en: englishUrl, 'x-default': spanishUrl },
    },
    openGraph: {
      type: 'website',
      url,
      title: buildPageTitle(localizedPaquete.titulo),
      description: cleanDescription,
      siteName: SITE_NAME,
      locale: locale === 'en' ? 'en_US' : 'es_AR',
      images: coverImage
        ? [
          {
            url: coverImage,
            width: 1200,
            height: 630,
            alt: localizedPaquete.titulo,
          },
        ]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: buildPageTitle(localizedPaquete.titulo),
      description: cleanDescription,
      images: coverImage ? [coverImage] : [],
    },
    keywords: [localizedPaquete.titulo, localizedPaquete.destino || (locale === 'en' ? 'destination' : 'destino'), locale === 'en' ? 'excursions' : 'excursiones', locale === 'en' ? 'travel' : 'viajes', locale === 'en' ? 'tourism' : 'turismo', SITE_NAME],
  };
}

export default async function ExcursionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = (await getLocale()) as AppLocale;
  const p = await getTranslations('public');
  const common = await getTranslations('common');
  const x = await getTranslations('excursionPage');
  if (!firebaseEnabled) {
    return (
      <>
        <Navbar variant="homeMockup" reserveSpace />
        <WhatsAppButton />
        <section className="bg-white py-24">
          <div className="container mx-auto px-4 md:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="mb-4 font-heading text-[32px] font-semibold leading-[40px] tracking-[0.5px] text-black">
                {slug}
              </h1>
              <p className="font-body text-base leading-relaxed text-gray-700 md:text-lg">
                {x('firebaseRequired')}
              </p>
            </div>
          </div>
        </section>
        <HomeFooter />
      </>
    );
  }
  const paqueteBase = await getPaquete(slug);

  if (!paqueteBase) {
    notFound();
  }

  const paquete = await localizePaquete(paqueteBase, locale);

  const destinoCategoriaBase = await getPrimaryDestino(paqueteBase);
  const destinoCategoria = destinoCategoriaBase ? await localizeCategoria(destinoCategoriaBase, locale) : null;

  const images = Array.from(new Set((paquete.galeria ?? []).map((s) => String(s || '').trim()).filter(Boolean)));
  const short = (paquete.descripcionCorta || '').trim();
  const destino = paquete.destino || paquete.eventoLugar || 'Argentina';
  const locationText = paquete.eventoLugar || paquete.destino || destino;
  const longDescriptionHtml = sanitizePackageRichHtml(paquete.descripcionLarga || paquete.descripcion);
  const bookingDates = getOperationalSalidas(paquete).map((salida) => ({ date: salida.fecha }));

  return (
    <div className="min-h-screen bg-[#F5FAFF]">
      <PaqueteSchema paquete={paquete} basePath="/excursion" />
      <Navbar variant="homeMockup" reserveSpace />
      <WhatsAppButton />
      <main className="container mx-auto px-4 pb-24 pt-4 sm:pb-28 sm:pt-6 md:px-6 md:py-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6A86A6] md:text-sm">
          <Link href={`/${locale}`} className="hover:text-[#2BB8BF]">
            {common('home')}
          </Link>
          <span className="mx-2">›</span>
          <Link href={`/${locale}/excursiones`} className="hover:text-[#2BB8BF]">
            {common('excursions')}
          </Link>
          <span className="mx-2">›</span>
          {destinoCategoria?.slug ? (
            <Link href={`/${locale}/destinos/${destinoCategoria.slug}`} className="hover:text-[#2BB8BF]">
              {destinoCategoria.nombre}
            </Link>
          ) : (
            <span>{destino}</span>
          )}
          <span className="mx-2">›</span>
          <span className="text-[#224165]">{paquete.titulo}</span>
        </div>

        <section className="mt-3 sm:mt-4">
          <PaqueteCarousel images={images} title={paquete.titulo} />
        </section>

        <div className="mt-4 grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <section className="order-1 min-w-0 xl:col-start-1 xl:row-start-1">
            <div className="rounded-3xl border border-[#D4E6F7] bg-white p-4 shadow-[0_14px_34px_rgba(15,66,116,0.08)] sm:p-6">

              <div>
                <h1 className="text-[28px] font-extrabold leading-[1.08] tracking-[-0.025em] text-[#0B2240] sm:text-[34px]">
                  {paquete.titulo}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-[#537190] sm:text-base">
                  {short || (locale === 'en' ? 'Breathtaking nature, adventure and comfort in a unique experience.' : 'Naturaleza imponente, aventura y confort en una experiencia única.')}
                </p>
                <div className="mt-3 inline-flex max-w-full items-start gap-2 text-xs font-semibold text-[#2A4E74] sm:text-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-[#2BB8BF]" />
                  <span className="min-w-0 break-words">{locationText}</span>
                </div>
                {longDescriptionHtml ? (
                  <div
                    className="prose prose-sm mt-5 max-w-none break-words text-[#415F7E] prose-headings:text-[#0B2240] prose-strong:text-[#17395E] prose-p:leading-7 sm:prose-base"
                    dangerouslySetInnerHTML={{ __html: longDescriptionHtml }}
                  />
                ) : (
                  <p className="mt-5 text-sm leading-7 text-[#415F7E] sm:text-base">
                    {locale === 'en' ? 'Discover unforgettable landscapes and unique experiences with a premium program combining excursions, selected accommodations and exclusive services.' : 'Descubrí paisajes inolvidables y experiencias únicas con un programa premium que combina excursiones, alojamientos seleccionados y servicios exclusivos.'}
                  </p>
                )}
              </div>

              {images.length > 1 ? (
                <div className="mt-5 sm:mt-6">
                  <PaqueteGalleryGrid images={images.slice(0)} title={paquete.titulo} />
                </div>
              ) : null}
            </div>

          </section>

          <aside id="reserva-directa" className="order-2 min-w-0 scroll-mt-24 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <div className="xl:sticky xl:top-24">
              <PaqueteSidebar paquete={paquete} bookingDates={bookingDates} />
            </div>
          </aside>

          <section className="order-3 min-w-0 space-y-5 xl:col-start-1 xl:row-start-2">
            <PaqueteItinerary steps={paquete.itinerarioSteps} html={paquete.itinerario} visible={paquete.mostrarItinerario} />

            {(paquete.incluye.length > 0 || (paquete.noIncluye && paquete.noIncluye.length > 0)) && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-[#D8EFE0] bg-[#F5FFF7] p-4 shadow-[0_12px_28px_rgba(28,122,67,0.08)] sm:p-5">
                  <h3 className="text-lg font-extrabold text-[#1A7E4F]">{p('includes')}</h3>
                  <ul className="mt-3 space-y-2.5">
                    {paquete.incluye.map((item, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm leading-6 text-[#27694B]">
                        <CheckCircle className="mt-1 h-4 w-4 shrink-0 text-[#1AA861]" />
                        <span className="min-w-0 break-words">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-3xl border border-[#F1DCDC] bg-[#FFF8F8] p-4 shadow-[0_12px_28px_rgba(154,58,58,0.08)] sm:p-5">
                  <h3 className="text-lg font-extrabold text-[#A13C3C]">{p('notIncludes')}</h3>
                  <ul className="mt-3 space-y-2.5">
                    {(paquete.noIncluye || []).map((item, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm leading-6 text-[#7F3A3A]">
                        <XCircle className="mt-1 h-4 w-4 shrink-0 text-[#D95353]" />
                        <span className="min-w-0 break-words">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <PaqueteGoogleMap title={paquete.titulo} embedUrl={paquete.mapaGoogleEmbedUrl} />

            <div className="rounded-3xl border border-[#D4E6F7] bg-white p-5 shadow-[0_14px_34px_rgba(15,66,116,0.08)]">
              <h3 className="text-sm font-bold text-[#17395E]">{x('shareExperience')}</h3>
              <div className="mt-3 flex items-center gap-2.5">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D7E8F7] bg-white text-[#2C4E73] hover:bg-[#F4FAFF]"
                  aria-label={x('shareWhatsApp')}
                >
                  <Phone className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D7E8F7] bg-white text-[#2C4E73] hover:bg-[#F4FAFF]"
                  aria-label={x('shareFacebook')}
                >
                  <Facebook className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D7E8F7] bg-white text-[#2C4E73] hover:bg-[#F4FAFF]"
                  aria-label={x('shareInstagram')}
                >
                  <Instagram className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D7E8F7] bg-white text-[#2C4E73] hover:bg-[#F4FAFF]"
                  aria-label={x('copyLinkAction')}
                >
                  <Link2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      <HomeFeaturesRow />
      <HomeFooter />
    </div>
  );
}
