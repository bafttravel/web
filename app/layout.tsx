import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans, Sora } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { SITE_NAME, CONTACT_INFO, SITE_URL, SITE_DESCRIPTION } from '@/lib/constants';
import SchemaOrg from '@/components/SchemaOrg';
import PageTransition from '@/components/PageTransition';
import { buildPageTitle, renderTemplate, siteConfig } from '@/lib/siteConfig';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import AnalyticsConsentManager from '@/components/analytics/AnalyticsConsentManager';

const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-inter',
  display: 'swap',
});

const siteUrl = SITE_URL;
const r2PublicOrigin = (() => {
  const baseUrl = process.env.R2_PUBLIC_BASE || '';
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
})();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: buildPageTitle(renderTemplate(siteConfig.seo.titleDefaultTemplate)),
    template: '%s',
  },
  description: SITE_DESCRIPTION,
  keywords: siteConfig.seo.keywords,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: siteConfig.seo.locale,
    url: siteUrl,
    siteName: SITE_NAME,
    title: `${SITE_NAME} - ${SITE_DESCRIPTION}`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: `${siteUrl}${siteConfig.seo.openGraphImagePath}`,
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} - ${SITE_DESCRIPTION}`,
    description: SITE_DESCRIPTION,
    images: [`${siteUrl}/logo-lado-v.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  verification: {
    // Agregar cuando tengas Google Search Console
    // google: 'tu-codigo-de-verificacion',
  },
  category: 'travel',
  classification: 'Travel Agency',
  other: {
    'contact:phone_number': CONTACT_INFO.telefono,
    'contact:email': CONTACT_INFO.email,
    'contact:address': CONTACT_INFO.direccion,
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { url: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: siteConfig.branding.palette.primary,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cssVars = {
    ['--sherpa-blue' as string]: siteConfig.branding.palette.primary,
    ['--sherpa-yellow' as string]: siteConfig.branding.palette.secondary,
    ['--sherpa-green' as string]: siteConfig.branding.palette.success,
    ['--sherpa-green-strong' as string]: siteConfig.branding.palette.successStrong,
    ['--sherpa-black' as string]: siteConfig.branding.palette.dark,
    ['--sherpa-cream' as string]: siteConfig.branding.palette.cream,
  } as React.CSSProperties;

  return <RootLayoutContent cssVars={cssVars}>{children}</RootLayoutContent>;
}

async function RootLayoutContent({
  children,
  cssVars,
}: {
  children: React.ReactNode;
  cssVars: React.CSSProperties;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${sora.variable} ${plusJakarta.variable} ${inter.variable}`}
      data-scroll-behavior="smooth"
      style={cssVars}
    >
      <head>
        {/* Preconnect para orígenes críticos - ordenados por prioridad */}
        {/* Firebase - crítico para páginas admin, diferido para páginas públicas */}
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        <link rel="dns-prefetch" href="https://firestore.googleapis.com" />
        <link rel="dns-prefetch" href="https://identitytoolkit.googleapis.com" />
        
        {/* R2 - para imágenes */}
        {r2PublicOrigin ? <link rel="preconnect" href={r2PublicOrigin} /> : null}
        {r2PublicOrigin ? <link rel="dns-prefetch" href={r2PublicOrigin} /> : null}
        
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" href="/favicon-96x96.png" sizes="96x96" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="font-body antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SchemaOrg />
          <AnalyticsConsentManager />
          <main id="main-content" className="relative z-0">
            <PageTransition>{children}</PageTransition>
          </main>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                zIndex: 99999,
              },
              className: 'bg-white border border-gray-200 shadow-lg',
            }}
            style={{
              zIndex: 99999,
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
