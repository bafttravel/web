import rawConfig from '@/site-config.json';

export type SiteToken = 'siteName' | 'siteDescription' | 'logoTitleText';

export type SiteConfig = {
  branding: {
    siteName: string;
    siteDescription: string;
    siteUrlDefault: string;
    logo: {
      imagePath: string;
      imageUrl?: string;
      titleText: string;
      altTextTemplate?: string;
    };
    palette: {
      primary: string;
      secondary: string;
      success: string;
      successStrong: string;
      dark: string;
      cream: string;
    };
  };
  company: {
    adminEmailDefault: string;
    internalNotificationsEmail: string;
    whatsappMessageDefault: string;
    contact: {
      direccion: string;
      horario: string;
      email: string;
      telefono: string;
      telefonoSecundario?: string;
      whatsappNumber: string;
      mapUrl: string;
    };
    social: {
      facebook: string;
      instagram: string;
      instagramHandle: string;
      threads?: string;
      tiktok?: string;
      whatsappChannel?: string;
      email: string;
    };
    legal: {
      razonSocial: string;
      cuit: string;
      legajoRnav: string;
    };
    developerCredits: {
      name: string;
      url: string;
    };
  };
  features: {
    showContactMap: boolean;
  };
  seo: {
    locale: string;
    titleDefaultTemplate: string;
    titleTemplate: string;
    openGraphImagePath: string;
    keywords: string[];
  };
  content: {
    homeHero: {
      badge: string;
      titlePrefix: string;
      titleAccent: string;
      subtitleTemplate: string;
      backgroundImage?: string;
    };
    packagesSection: {
      badge: string;
      title: string;
      subtitleTemplate: string;
    };
    services: {
      badge: string;
      titlePrefix: string;
      titleAccent: string;
      subtitle: string;
      items: Array<{ icon: string; title: string; desc: string; cta?: { label: string; url: string } }>;
    };
    values: {
      badge: string;
      title: string;
      subtitle: string;
      items: Array<{ icon: string; number: string; title: string; desc: string }>;
    };
    about: {
      badge: string;
      titlePrefix: string;
      titleAccent: string;
      image: {
        src: string;
        altTemplate: string;
      };
      paragraphs: string[];
    };
    contactBlock: {
      badge: string;
      titlePrefix: string;
      titleAccent: string;
      subtitle: string;
    };
    contactForm: {
      title: string;
      subtitle: string;
      whatsappCta: string;
      image: {
        src: string;
        altTemplate: string;
      };
    };
    footer: {
      taglineTemplate: string;
      copyrightTemplate: string;
    };
  };
};

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isRecord(base)) return (override as T) ?? base;
  if (!isRecord(override)) return base;
  const out: Record<string, any> = { ...(base as any) };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = out[key];
    if (Array.isArray(current)) {
      out[key] = Array.isArray(value) ? value : current;
      continue;
    }
    if (isRecord(current)) {
      out[key] = deepMerge(current, value);
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

function ensureString(value: unknown, fallback: string, opts?: { allowEmpty?: boolean }) {
  const allowEmpty = opts?.allowEmpty ?? false;
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!allowEmpty && trimmed.length === 0) return fallback;
  return value;
}

function ensureBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function ensureStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value.map((v) => String(v ?? '').trim()).filter((v) => v.length > 0);
}

function normalizeAboutParagraphChunk(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk;
  if (!isRecord(chunk)) return '';

  const text = typeof chunk.text === 'string' ? chunk.text : '';
  const token = typeof chunk.token === 'string' ? `{{${chunk.token}}}` : '';
  const raw = text || token;
  if (!raw) return '';

  return chunk.strong === true ? `**${raw}**` : raw;
}

function normalizeAboutParagraph(value: unknown): string {
  if (typeof value === 'string') return value.trim();

  if (Array.isArray(value)) {
    return value
      .map((chunk) => normalizeAboutParagraphChunk(chunk))
      .join('')
      .trim();
  }

  return normalizeAboutParagraphChunk(value).trim();
}

function ensureAbsoluteUrl(value: unknown, fallback: string) {
  const candidate = ensureString(value, fallback);
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return fallback;
    return u.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function ensurePathOrUrl(value: unknown, fallback: string) {
  const candidate = ensureString(value, fallback, { allowEmpty: true }).trim();
  if (!candidate) return fallback;
  if (candidate.startsWith('/')) return candidate;
  return ensureAbsoluteUrl(candidate, fallback);
}

function extractDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeWhatsAppNumber(value: unknown) {
  const digits = extractDigits(value);
  if (!digits) return '';
  if (digits.startsWith('549') || digits.startsWith('54')) return digits;
  return digits.length >= 10 ? `54${digits}` : digits;
}

function deriveInstagramHandle(url: string) {
  const normalized = url.trim();
  if (!normalized) return '';

  try {
    const pathname = new URL(normalized).pathname.split('/').filter(Boolean)[0] || '';
    return pathname ? `@${pathname}` : '';
  } catch {
    const match = normalized.match(/instagram\.com\/([^/?#]+)/i);
    return match?.[1] ? `@${match[1]}` : '';
  }
}

function isLegacySiteConfigShape(input: Record<string, any>) {
  return isRecord(input.branding) && typeof input.branding.siteName === 'string';
}

function mapSimpleSiteConfig(input: Record<string, any>): Partial<SiteConfig> {
  const siteName = ensureString(input.branding?.name, 'BAFT');
  const siteDescription = ensureString(
    input.seo?.description,
    'BAFT es más que una agencia de turismo: es un punto de encuentro para descubrir Patagonia.'
  );
  const phone = ensureString(input.contacto?.phone, '', { allowEmpty: true });
  const email = ensureString(input.contacto?.email, '', { allowEmpty: true });
  const businessHours = ensureString(input.contacto?.businessHours, '', { allowEmpty: true });
  const logoValue = ensureString(input.logo?.url, '', { allowEmpty: true });
  const heroImage = ensureString(input.hero?.image, '', { allowEmpty: true });

  const socialItems = Array.isArray(input.redes?.items) ? input.redes.items : [];
  const getSocialUrl = (platform: string) =>
    ensureString(
      socialItems.find((item: any) => String(item?.platform || '').toLowerCase() === platform)?.url,
      '',
      { allowEmpty: true }
    );

  const facebook = getSocialUrl('facebook');
  const instagram = getSocialUrl('instagram');

  const serviceIcons = ['Globe', 'Plane', 'Headphones', 'Users'];
  const valueIcons = ['Award', 'Heart', 'Sparkles', 'Shield', 'CheckCircle', 'Smile'];

  return {
    branding: {
      siteName,
      siteDescription,
      siteUrlDefault: 'https://example.com',
      logo: {
        imagePath: logoValue.startsWith('/') ? logoValue : '/images/logo_white.png',
        imageUrl: logoValue.startsWith('http') ? logoValue : '',
        titleText: siteName,
        altTextTemplate: '{{siteName}}',
      },
      palette: {
        primary: ensureString(input.palette?.primary, DEFAULT_SITE_CONFIG.branding.palette.primary),
        secondary: ensureString(input.palette?.secondary, DEFAULT_SITE_CONFIG.branding.palette.secondary),
        success: '#4E7A45',
        successStrong: '#36572F',
        dark: ensureString(input.palette?.secondary, DEFAULT_SITE_CONFIG.branding.palette.dark),
        cream: '#F5F1E8',
      },
    },
    company: {
      adminEmailDefault: email,
      internalNotificationsEmail: ensureString(input.contacto?.internalNotificationsEmail, '', { allowEmpty: true }),
      whatsappMessageDefault: `Hola ${siteName}! Quiero consultar por: `,
      contact: {
        direccion: 'Patagonia, Argentina',
        horario: businessHours,
        email,
        telefono: phone,
        telefonoSecundario: '',
        whatsappNumber: normalizeWhatsAppNumber(phone),
        mapUrl: '',
      },
      social: {
        facebook,
        instagram,
        instagramHandle: deriveInstagramHandle(instagram),
        threads: '',
        tiktok: '',
        whatsappChannel: '',
        email: email ? `mailto:${email}` : '',
      },
      legal: {
        razonSocial: siteName,
        cuit: '',
        legajoRnav: '',
      },
      developerCredits: DEFAULT_SITE_CONFIG.company.developerCredits,
    },
    features: {
      showContactMap: ensureBoolean(input.mapa?.show, false),
    },
    seo: {
      locale: 'es_AR',
      titleDefaultTemplate: ensureString(input.seo?.title, siteName),
      titleTemplate: `%s | ${siteName}`,
      openGraphImagePath: ensurePathOrUrl(input.seo?.image, logoValue || '/images/logo_white.png'),
      keywords: [
        siteName.toLowerCase(),
        'patagonia',
        'turismo',
        'el calafate',
        'excursiones',
        'aventura',
      ],
    },
    content: {
      homeHero: {
        badge: 'Patagonia auténtica',
        titlePrefix: 'Descubrí',
        titleAccent: ensureString(input.hero?.title, siteName),
        subtitleTemplate: siteDescription,
        backgroundImage: heroImage || '/images/banner.jpg',
      },
      packagesSection: {
        badge: 'Excursiones',
        title: '',
        subtitleTemplate: 'Propuestas pensadas para conocer la Patagonia a tu manera.',
      },
      services: {
        badge: 'Servicios',
        titlePrefix: 'Experiencias',
        titleAccent: 'para cada viajero',
        subtitle: 'Te acompañamos a elegir la mejor forma de vivir Patagonia.',
        items: Array.isArray(input.content?.services?.items)
          ? input.content.services.items.map((item: any, index: number) => {
              const rawCta = item?.cta;
              const cta =
                isRecord(rawCta) && (rawCta.label || rawCta.url)
                  ? { label: ensureString(rawCta.label, '', { allowEmpty: true }), url: ensureString(rawCta.url, '', { allowEmpty: true }) }
                  : undefined;
              return {
                icon: serviceIcons[index % serviceIcons.length],
                title: ensureString(item?.title, '', { allowEmpty: true }),
                desc: ensureString(item?.description, '', { allowEmpty: true }),
                cta,
              };
            })
          : [],
      },
      values: {
        badge: 'Valores',
        title: `Por qué elegir ${siteName}`,
        subtitle: 'Atención cercana, experiencia local y propuestas flexibles.',
        items: Array.isArray(input.content?.values?.items)
          ? input.content.values.items.map((item: any, index: number) => ({
              icon: valueIcons[index % valueIcons.length],
              number: String(index + 1).padStart(2, '0'),
              title: ensureString(item?.title, '', { allowEmpty: true }),
              desc: ensureString(item?.description, '', { allowEmpty: true }),
            }))
          : [],
      },
      about: {
        badge: 'Sobre nosotros',
        titlePrefix: 'Somos',
        titleAccent: siteName,
        image: {
          src: heroImage || '/images/banner.jpg',
          altTemplate: '{{siteName}}',
        },
        paragraphs: Array.isArray(input.content?.about?.paragraphs)
          ? input.content.about.paragraphs
          : [],
      },
      contactBlock: {
        badge: 'Contacto',
        titlePrefix: 'Estamos para',
        titleAccent: 'ayudarte',
        subtitle: 'Escribinos y te asesoramos según tu viaje, tu tiempo y tu presupuesto.',
      },
      contactForm: {
        title: 'Hablemos de tu viaje',
        subtitle: 'Respondemos por email o WhatsApp para ayudarte a planificar tu experiencia.',
        whatsappCta: 'Consultar por WhatsApp',
        image: {
          src: heroImage || '/images/banner.jpg',
          altTemplate: 'Contacto {{siteName}}',
        },
      },
      footer: {
        taglineTemplate: siteDescription,
        copyrightTemplate: '© {{year}} {{logoTitleText}}. Todos los derechos reservados.',
      },
    },
  };
}

function adaptRawSiteConfig(input: unknown): Partial<SiteConfig> {
  if (!isRecord(input)) return {};
  if (isLegacySiteConfigShape(input)) return input as Partial<SiteConfig>;
  return mapSimpleSiteConfig(input);
}

const DEFAULT_SITE_CONFIG: SiteConfig = {
  branding: {
    siteName: 'Sitio',
    siteDescription: 'Descripción del sitio',
    siteUrlDefault: 'https://example.com',
    logo: {
      imagePath: '/logo_white.png',
      imageUrl: '',
      titleText: 'Sitio',
      altTextTemplate: '{{siteName}} Logo',
    },
    palette: {
      primary: '#0B6E4F',
      secondary: '#F2C14E',
      success: '#16A34A',
      successStrong: '#15803D',
      dark: '#0F172A',
      cream: '#FAF7F0',
    },
  },
  company: {
    adminEmailDefault: 'admin@example.com',
    internalNotificationsEmail: '',
    whatsappMessageDefault: 'Hola! Quiero consultar por: ',
    contact: {
      direccion: '',
      horario: '',
      email: '',
      telefono: '',
      telefonoSecundario: '',
      whatsappNumber: '',
      mapUrl: '',
    },
    social: {
      facebook: '',
      instagram: '',
      instagramHandle: '',
      threads: '',
      tiktok: '',
      whatsappChannel: '',
      email: '',
    },
    legal: {
      razonSocial: '',
      cuit: '',
      legajoRnav: '',
    },
    developerCredits: {
      name: 'Tucs Digital',
      url: '',
    },
  },
  features: {
    showContactMap: true,
  },
  seo: {
    locale: 'es_AR',
    titleDefaultTemplate: '{{siteName}}',
    titleTemplate: '%s | {{siteName}}',
    openGraphImagePath: '/og-image.jpg',
    keywords: [],
  },
  content: {
    homeHero: {
      badge: '',
      titlePrefix: '',
      titleAccent: '',
      subtitleTemplate: '{{siteDescription}}',
      backgroundImage: '/images/hero-placeholder.svg',
    },
    packagesSection: {
      badge: '',
      title: '',
      subtitleTemplate: '',
    },
    services: {
      badge: '',
      titlePrefix: '',
      titleAccent: '',
      subtitle: '',
      items: [],
    },
    values: {
      badge: '',
      title: '',
      subtitle: '',
      items: [],
    },
    about: {
      badge: '',
      titlePrefix: '',
      titleAccent: '',
      image: {
        src: '/images/hero1.webp',
        altTemplate: 'Equipo de {{siteName}}',
      },
      paragraphs: [],
    },
    contactBlock: {
      badge: '',
      titlePrefix: '',
      titleAccent: '',
      subtitle: '',
    },
    contactForm: {
      title: '',
      subtitle: '',
      whatsappCta: 'Abrir WhatsApp',
      image: {
        src: '/images/3.jpg',
        altTemplate: '{{siteName}}',
      },
    },
    footer: {
      taglineTemplate: '{{siteDescription}}',
      copyrightTemplate: '© {{year}} {{logoTitleText}}. Todos los derechos reservados.',
    },
  },
};

function normalizeSiteConfig(input: SiteConfig): SiteConfig {
  const rawSiteName = ensureString(input.branding?.siteName, DEFAULT_SITE_CONFIG.branding.siteName);
  const siteName = rawSiteName.trim().toLowerCase() === 'baft' ? 'BAFT' : rawSiteName;
  const siteDescription = ensureString(input.branding?.siteDescription, DEFAULT_SITE_CONFIG.branding.siteDescription);
  const siteUrlDefault = ensureAbsoluteUrl(input.branding?.siteUrlDefault, DEFAULT_SITE_CONFIG.branding.siteUrlDefault);

  const rawLogoTitleText = ensureString(
    input.branding?.logo?.titleText,
    ensureString(siteName, DEFAULT_SITE_CONFIG.branding.logo.titleText)
  );
  const logoTitleText = rawLogoTitleText.trim().toLowerCase() === 'baft' ? 'BAFT' : rawLogoTitleText;

  return {
    branding: {
      siteName,
      siteDescription,
      siteUrlDefault,
      logo: {
        imagePath: ensureString(input.branding?.logo?.imagePath, DEFAULT_SITE_CONFIG.branding.logo.imagePath),
        imageUrl: ensureString(input.branding?.logo?.imageUrl, '', { allowEmpty: true }),
        titleText: logoTitleText,
        altTextTemplate: ensureString(
          input.branding?.logo?.altTextTemplate,
          DEFAULT_SITE_CONFIG.branding.logo.altTextTemplate || '{{siteName}} Logo'
        ),
      },
      palette: {
        primary: ensureString(input.branding?.palette?.primary, DEFAULT_SITE_CONFIG.branding.palette.primary),
        secondary: ensureString(input.branding?.palette?.secondary, DEFAULT_SITE_CONFIG.branding.palette.secondary),
        success: ensureString(input.branding?.palette?.success, DEFAULT_SITE_CONFIG.branding.palette.success),
        successStrong: ensureString(input.branding?.palette?.successStrong, DEFAULT_SITE_CONFIG.branding.palette.successStrong),
        dark: ensureString(input.branding?.palette?.dark, DEFAULT_SITE_CONFIG.branding.palette.dark),
        cream: ensureString(input.branding?.palette?.cream, DEFAULT_SITE_CONFIG.branding.palette.cream),
      },
    },
    company: {
      adminEmailDefault: ensureString(input.company?.adminEmailDefault, DEFAULT_SITE_CONFIG.company.adminEmailDefault),
      internalNotificationsEmail: ensureString(input.company?.internalNotificationsEmail, '', { allowEmpty: true }),
      whatsappMessageDefault: ensureString(input.company?.whatsappMessageDefault, DEFAULT_SITE_CONFIG.company.whatsappMessageDefault),
      contact: {
        direccion: ensureString(input.company?.contact?.direccion, DEFAULT_SITE_CONFIG.company.contact.direccion, { allowEmpty: true }),
        horario: ensureString(input.company?.contact?.horario, DEFAULT_SITE_CONFIG.company.contact.horario, { allowEmpty: true }),
        email: ensureString(input.company?.contact?.email, DEFAULT_SITE_CONFIG.company.contact.email, { allowEmpty: true }),
        telefono: ensureString(input.company?.contact?.telefono, DEFAULT_SITE_CONFIG.company.contact.telefono, { allowEmpty: true }),
        whatsappNumber: ensureString(input.company?.contact?.whatsappNumber, DEFAULT_SITE_CONFIG.company.contact.whatsappNumber, { allowEmpty: true }),
        mapUrl: ensureString(input.company?.contact?.mapUrl, DEFAULT_SITE_CONFIG.company.contact.mapUrl, { allowEmpty: true }),
      },
      social: {
        facebook: ensureString(input.company?.social?.facebook, DEFAULT_SITE_CONFIG.company.social.facebook, { allowEmpty: true }),
        instagram: ensureString(input.company?.social?.instagram, DEFAULT_SITE_CONFIG.company.social.instagram, { allowEmpty: true }),
        instagramHandle: ensureString(input.company?.social?.instagramHandle, DEFAULT_SITE_CONFIG.company.social.instagramHandle, { allowEmpty: true }),
        threads: ensureString(input.company?.social?.threads, '', { allowEmpty: true }),
        tiktok: ensureString(input.company?.social?.tiktok, '', { allowEmpty: true }),
        email: ensureString(input.company?.social?.email, DEFAULT_SITE_CONFIG.company.social.email, { allowEmpty: true }),
      },
      legal: {
        razonSocial: ensureString(input.company?.legal?.razonSocial, DEFAULT_SITE_CONFIG.company.legal.razonSocial, { allowEmpty: true }),
        cuit: ensureString(input.company?.legal?.cuit, DEFAULT_SITE_CONFIG.company.legal.cuit, { allowEmpty: true }),
        legajoRnav: ensureString(input.company?.legal?.legajoRnav, DEFAULT_SITE_CONFIG.company.legal.legajoRnav, { allowEmpty: true }),
      },
      developerCredits: {
        name: ensureString(input.company?.developerCredits?.name, DEFAULT_SITE_CONFIG.company.developerCredits.name),
        url: ensureString(input.company?.developerCredits?.url, DEFAULT_SITE_CONFIG.company.developerCredits.url, { allowEmpty: true }),
      },
    },
    features: {
      showContactMap: ensureBoolean(input.features?.showContactMap, DEFAULT_SITE_CONFIG.features.showContactMap),
    },
    seo: {
      locale: ensureString(input.seo?.locale, DEFAULT_SITE_CONFIG.seo.locale),
      titleDefaultTemplate: ensureString(input.seo?.titleDefaultTemplate, DEFAULT_SITE_CONFIG.seo.titleDefaultTemplate),
      titleTemplate: ensureString(input.seo?.titleTemplate, DEFAULT_SITE_CONFIG.seo.titleTemplate),
      openGraphImagePath: ensureString(input.seo?.openGraphImagePath, DEFAULT_SITE_CONFIG.seo.openGraphImagePath),
      keywords: ensureStringArray(input.seo?.keywords, DEFAULT_SITE_CONFIG.seo.keywords),
    },
    content: {
      homeHero: {
        badge: ensureString(input.content?.homeHero?.badge, DEFAULT_SITE_CONFIG.content.homeHero.badge, { allowEmpty: true }),
        titlePrefix: ensureString(input.content?.homeHero?.titlePrefix, DEFAULT_SITE_CONFIG.content.homeHero.titlePrefix, { allowEmpty: true }),
        titleAccent: ensureString(input.content?.homeHero?.titleAccent, DEFAULT_SITE_CONFIG.content.homeHero.titleAccent, { allowEmpty: true }),
        subtitleTemplate: ensureString(input.content?.homeHero?.subtitleTemplate, DEFAULT_SITE_CONFIG.content.homeHero.subtitleTemplate),
        backgroundImage: ensurePathOrUrl(
          input.content?.homeHero?.backgroundImage,
          DEFAULT_SITE_CONFIG.content.homeHero.backgroundImage || '/images/hero-placeholder.svg'
        ),
      },
      packagesSection: {
        badge: ensureString(input.content?.packagesSection?.badge, DEFAULT_SITE_CONFIG.content.packagesSection.badge, { allowEmpty: true }),
        title: ensureString(input.content?.packagesSection?.title, DEFAULT_SITE_CONFIG.content.packagesSection.title, { allowEmpty: true }),
        subtitleTemplate: ensureString(input.content?.packagesSection?.subtitleTemplate, DEFAULT_SITE_CONFIG.content.packagesSection.subtitleTemplate, { allowEmpty: true }),
      },
      services: {
        badge: ensureString(input.content?.services?.badge, DEFAULT_SITE_CONFIG.content.services.badge, { allowEmpty: true }),
        titlePrefix: ensureString(input.content?.services?.titlePrefix, DEFAULT_SITE_CONFIG.content.services.titlePrefix, { allowEmpty: true }),
        titleAccent: ensureString(input.content?.services?.titleAccent, DEFAULT_SITE_CONFIG.content.services.titleAccent, { allowEmpty: true }),
        subtitle: ensureString(input.content?.services?.subtitle, DEFAULT_SITE_CONFIG.content.services.subtitle, { allowEmpty: true }),
        items: Array.isArray(input.content?.services?.items)
          ? input.content.services.items
              .map((it: any) => {
                const rawCta = it?.cta;
                const cta =
                  isRecord(rawCta) && (rawCta.label || rawCta.url)
                    ? { label: ensureString(rawCta.label, '', { allowEmpty: true }), url: ensureString(rawCta.url, '', { allowEmpty: true }) }
                    : undefined;
                return {
                  icon: ensureString(it?.icon, 'Users'),
                  title: ensureString(it?.title, '', { allowEmpty: true }),
                  desc: ensureString(it?.desc, '', { allowEmpty: true }),
                  cta,
                };
              })
              .filter((it: any) => it.title.trim().length > 0 || it.desc.trim().length > 0)
          : [],
      },
      values: {
        badge: ensureString(input.content?.values?.badge, DEFAULT_SITE_CONFIG.content.values.badge, { allowEmpty: true }),
        title: ensureString(input.content?.values?.title, DEFAULT_SITE_CONFIG.content.values.title, { allowEmpty: true }),
        subtitle: ensureString(input.content?.values?.subtitle, DEFAULT_SITE_CONFIG.content.values.subtitle, { allowEmpty: true }),
        items: Array.isArray(input.content?.values?.items)
          ? input.content.values.items
              .map((it: any) => ({
                icon: ensureString(it?.icon, 'Award'),
                number: ensureString(it?.number, '', { allowEmpty: true }),
                title: ensureString(it?.title, '', { allowEmpty: true }),
                desc: ensureString(it?.desc, '', { allowEmpty: true }),
              }))
              .filter((it: any) => it.title.trim().length > 0 || it.desc.trim().length > 0)
          : [],
      },
      about: {
        badge: ensureString(input.content?.about?.badge, DEFAULT_SITE_CONFIG.content.about.badge, { allowEmpty: true }),
        titlePrefix: ensureString(input.content?.about?.titlePrefix, DEFAULT_SITE_CONFIG.content.about.titlePrefix, { allowEmpty: true }),
        titleAccent: ensureString(input.content?.about?.titleAccent, DEFAULT_SITE_CONFIG.content.about.titleAccent, { allowEmpty: true }),
        image: {
          src: ensureString(input.content?.about?.image?.src, DEFAULT_SITE_CONFIG.content.about.image.src),
          altTemplate: ensureString(input.content?.about?.image?.altTemplate, DEFAULT_SITE_CONFIG.content.about.image.altTemplate),
        },
        paragraphs: Array.isArray(input.content?.about?.paragraphs)
          ? input.content.about.paragraphs
              .map((v: unknown) => normalizeAboutParagraph(v))
              .filter((v: string) => v.length > 0)
          : [],
      },
      contactBlock: {
        badge: ensureString(input.content?.contactBlock?.badge, DEFAULT_SITE_CONFIG.content.contactBlock.badge, { allowEmpty: true }),
        titlePrefix: ensureString(input.content?.contactBlock?.titlePrefix, DEFAULT_SITE_CONFIG.content.contactBlock.titlePrefix, { allowEmpty: true }),
        titleAccent: ensureString(input.content?.contactBlock?.titleAccent, DEFAULT_SITE_CONFIG.content.contactBlock.titleAccent, { allowEmpty: true }),
        subtitle: ensureString(input.content?.contactBlock?.subtitle, DEFAULT_SITE_CONFIG.content.contactBlock.subtitle, { allowEmpty: true }),
      },
      contactForm: {
        title: ensureString(input.content?.contactForm?.title, DEFAULT_SITE_CONFIG.content.contactForm.title, { allowEmpty: true }),
        subtitle: ensureString(input.content?.contactForm?.subtitle, DEFAULT_SITE_CONFIG.content.contactForm.subtitle, { allowEmpty: true }),
        whatsappCta: ensureString(input.content?.contactForm?.whatsappCta, DEFAULT_SITE_CONFIG.content.contactForm.whatsappCta),
        image: {
          src: ensureString(input.content?.contactForm?.image?.src, DEFAULT_SITE_CONFIG.content.contactForm.image.src),
          altTemplate: ensureString(input.content?.contactForm?.image?.altTemplate, DEFAULT_SITE_CONFIG.content.contactForm.image.altTemplate),
        },
      },
      footer: {
        taglineTemplate: ensureString(input.content?.footer?.taglineTemplate, DEFAULT_SITE_CONFIG.content.footer.taglineTemplate),
        copyrightTemplate: ensureString(input.content?.footer?.copyrightTemplate, DEFAULT_SITE_CONFIG.content.footer.copyrightTemplate),
      },
    },
  };
}

export const siteConfig: SiteConfig = normalizeSiteConfig(
  deepMerge(DEFAULT_SITE_CONFIG, adaptRawSiteConfig(rawConfig)) as SiteConfig
);

export function resolveTokenValue(token: SiteToken): string {
  if (token === 'siteName') return siteConfig.branding.siteName;
  if (token === 'siteDescription') return siteConfig.branding.siteDescription;
  return siteConfig.branding.logo.titleText;
}

export function renderTemplate(template: string, vars?: Record<string, string>) {
  if (typeof template !== 'string' || template.length === 0) return '';
  const baseVars: Record<string, string> = {
    siteName: siteConfig.branding.siteName,
    siteDescription: siteConfig.branding.siteDescription,
    logoTitleText: siteConfig.branding.logo.titleText,
    year: String(new Date().getFullYear()),
    ...(vars ?? {}),
  };

  return Object.entries(baseVars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    template
  );
}

export function buildPageTitle(pageTitle?: string | null) {
  const siteName = siteConfig.branding.siteName;
  const normalizedPageTitle = String(pageTitle ?? '').trim();
  if (!normalizedPageTitle) return siteName;
  if (normalizedPageTitle.toLowerCase() === siteName.toLowerCase()) return siteName;
  return `${normalizedPageTitle} | ${siteName}`;
}

export function getBrandLogoSrc() {
  const candidate = (siteConfig.branding.logo.imageUrl || '').trim();
  const local = (siteConfig.branding.logo.imagePath || '').trim();
  if (candidate.length > 0) return candidate;
  if (local.length > 0) return local;
  return DEFAULT_SITE_CONFIG.branding.logo.imagePath;
}

export function isRemoteUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export function getBrandLogoAbsolute(siteUrl: string) {
  const src = getBrandLogoSrc();
  if (isRemoteUrl(src)) return src;
  return `${siteUrl}${src}`;
}
