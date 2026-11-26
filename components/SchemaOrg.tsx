'use client';

import { SITE_NAME, SITE_DESCRIPTION, CONTACT_INFO, SOCIAL_MEDIA, LEGAL_INFO, SITE_URL } from '@/lib/constants';
import { getBrandLogoAbsolute } from '@/lib/siteConfig';

const siteUrl = SITE_URL;
const logoUrl = getBrandLogoAbsolute(siteUrl);

export default function SchemaOrg() {
  // Schema LocalBusiness - Para mostrar información de negocio local en Google
  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    '@id': `${siteUrl}#organization`,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    logo: logoUrl,
    image: logoUrl,
    telephone: CONTACT_INFO.telefono,
    email: CONTACT_INFO.email || undefined,
    legalName: LEGAL_INFO.razonSocial,
    taxID: LEGAL_INFO.cuit,
    address: {
      '@type': 'PostalAddress',
      streetAddress: CONTACT_INFO.direccion,
      addressLocality: 'Tandil',
      addressRegion: 'Buenos Aires',
      addressCountry: 'AR',
    },
    sameAs: [
      // SOCIAL_MEDIA.facebook,
      SOCIAL_MEDIA.instagram,
      SOCIAL_MEDIA.threads,
      SOCIAL_MEDIA.whatsapp,
    ].filter(Boolean),
    priceRange: '$$',
    areaServed: {
      '@type': 'Country',
      name: 'Argentina',
    },
    // Métodos de contacto
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: CONTACT_INFO.telefono,
      contactType: 'customer service',
      areaServed: 'AR',
      availableLanguage: ['Spanish'],
    },
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    logo: logoUrl,
    image: logoUrl,
    telephone: CONTACT_INFO.telefono,
    email: CONTACT_INFO.email || undefined,
    legalName: LEGAL_INFO.razonSocial,
    taxID: LEGAL_INFO.cuit,
    address: {
      '@type': 'PostalAddress',
      streetAddress: CONTACT_INFO.direccion,
      addressLocality: 'Tandil',
      addressRegion: 'Buenos Aires',
      addressCountry: 'AR',
    },
    sameAs: [
      // SOCIAL_MEDIA.facebook,
      SOCIAL_MEDIA.instagram,
      SOCIAL_MEDIA.threads,
      SOCIAL_MEDIA.whatsapp,
    ].filter(Boolean),
    priceRange: '$$',
    areaServed: {
      '@type': 'Country',
      name: 'Argentina',
    },
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: siteUrl,
    description: SITE_DESCRIPTION,
    publisher: {
      '@type': 'TravelAgency',
      name: SITE_NAME,
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/excursiones?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Inicio',
        item: siteUrl,
      },
    ],
  };

  return (
    <>
      {/* LocalBusiness Schema - Prioridad para rich snippets locales */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
}
