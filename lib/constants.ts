import { siteConfig } from '@/lib/siteConfig';

function ensureAbsoluteUrl(value: unknown, fallback: string) {
  const candidate = String(value ?? fallback).trim();
  if (candidate.length === 0) return fallback;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return fallback;
    return u.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

export const WHATSAPP_NUMBER = String(siteConfig.company.contact.whatsappNumber ?? '').trim();
export const WHATSAPP_MESSAGE_DEFAULT = String(siteConfig.company.whatsappMessageDefault ?? '').trim();

function getWhatsAppDisplay(numberValue: string) {
  const n = String(numberValue ?? '').trim();
  if (n.startsWith('549') && n.length > 3) return n.slice(3);
  if (n.startsWith('54') && n.length > 2) return n.slice(2);
  return n;
}

export const SITE_NAME = siteConfig.branding.siteName;
export const SITE_DESCRIPTION = siteConfig.branding.siteDescription;
export const SITE_URL = ensureAbsoluteUrl(process.env.NEXT_PUBLIC_SITE_URL, siteConfig.branding.siteUrlDefault);

const adminEmailCandidate = String(
  process.env.NEXT_PUBLIC_ADMIN_EMAIL || siteConfig.company.adminEmailDefault || ''
)
  .trim()
  .toLowerCase();
export const ADMIN_EMAIL = adminEmailCandidate || 'admin@example.com';

export const INTERNAL_NOTIFICATIONS_EMAIL = siteConfig.company.internalNotificationsEmail || siteConfig.company.contact.email;

export const CONTACT_INFO = {
  direccion: siteConfig.company.contact.direccion,
  horario: siteConfig.company.contact.horario,
  email: siteConfig.company.contact.email,
  telefono: siteConfig.company.contact.telefono,
  telefonoSecundario: siteConfig.company.contact.telefonoSecundario || '',
  whatsapp: WHATSAPP_NUMBER,
  whatsappDisplay: getWhatsAppDisplay(WHATSAPP_NUMBER),
  mapUrl: siteConfig.company.contact.mapUrl,
};

export const SOCIAL_MEDIA = {
  facebook: siteConfig.company.social.facebook,
  instagram: siteConfig.company.social.instagram,
  instagramHandle: siteConfig.company.social.instagramHandle,
  threads: siteConfig.company.social.threads || '',
  tiktok: siteConfig.company.social.tiktok || '',
  whatsapp: WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}` : '',
  whatsappChannel: siteConfig.company.social.whatsappChannel || '',
  email: siteConfig.company.social.email,
};

export const LEGAL_INFO = {
  razonSocial: siteConfig.company.legal.razonSocial,
  cuit: siteConfig.company.legal.cuit,
  legajoRnav: siteConfig.company.legal.legajoRnav,
};

export const DEVELOPER_CREDITS = {
  name: siteConfig.company.developerCredits.name,
  url: siteConfig.company.developerCredits.url,
};
