"use client";

import Link from "next/link";
import Image from "next/image";
import { Clock, Instagram, Mail, MapPin, Phone, Radio } from "lucide-react";
import { FaFacebook, FaInstagram } from "react-icons/fa";
import { CONTACT_INFO, LEGAL_INFO, SITE_NAME, SOCIAL_MEDIA } from "@/lib/constants";
import { isRemoteUrl, renderTemplate, siteConfig } from "@/lib/siteConfig";
import { useLocale, useTranslations } from 'next-intl';
import { OPEN_COOKIE_SETTINGS_EVENT } from '@/lib/analytics';

const HOURS_EN: Array<[RegExp, string]> = [
  [/\blunes\b/gi, 'Monday'],
  [/\bmartes\b/gi, 'Tuesday'],
  [/\bmi[eé]rcoles\b/gi, 'Wednesday'],
  [/\bjueves\b/gi, 'Thursday'],
  [/\bviernes\b/gi, 'Friday'],
  [/\bs[aá]bados?\b/gi, 'Saturday'],
  [/\bdomingos?\b/gi, 'Sunday'],
  [/\bde\b/gi, 'from'],
  [/\b(\d{1,2}(?::\d{2})?)\s*(?:hs|hrs|h)\b\.?/gi, '$1'],
  [/\s+a\s+/g, ' to '],
  [/\s+y\s+/g, ' and '],
];

function translateHours(value: string, locale: string) {
  if (locale !== 'en' || !value) return value;
  return HOURS_EN.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

const ThreadsIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 192 192"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Threads"
    role="img"
  >
    <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" />
  </svg>
);

export default function HomeFooter() {
  const t = useTranslations('common');
  const p = useTranslations('public');
  const f = useTranslations('footer');
  const locale = useLocale();
  const prefix = `/${locale}`;
  const logoSrc = "/images/logo_white.png";
  const logoAlt = renderTemplate(siteConfig.branding.logo.altTextTemplate || "{{siteName}} Logo");
  const telefonos = [CONTACT_INFO.telefono, CONTACT_INFO.telefonoSecundario].filter(Boolean).join(" / ");
  const developer = siteConfig.company.developerCredits;

  return (
    <footer className="bg-primary text-white">
      <div className="container mx-auto px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-4 md:gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="flex h-12 w-12 items-center justify-center">
                {isRemoteUrl(logoSrc) ? (
                  <img src={logoSrc} alt={logoAlt} className="h-full w-full object-contain" />
                ) : (
                  <Image src={logoSrc} alt={logoAlt} width={48} height={48} className="h-full w-full object-contain" />
                )}
              </div>
            </div>
            <p className="text-sm leading-snug text-white/82">
              {locale === 'en' ? f('tagline') : renderTemplate(siteConfig.content.footer.taglineTemplate)}
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">{p('links')}</h3>
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link href={prefix} className="text-white/82 transition-colors hover:text-white">
                  {t('home')}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/excursiones`} className="text-white/82 transition-colors hover:text-white">
                  {t('excursions')}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}#destinos`} className="text-white/82 transition-colors hover:text-white">
                  {t('destinations')}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}#servicios`} className="text-white/82 transition-colors hover:text-white">
                  {p('services')}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/terminos-condiciones`} className="text-white/82 transition-colors hover:text-white">
                  {p('terms')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">{t('contact')}</h3>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-start space-x-2">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-white" />
                <span className="text-white/82">{CONTACT_INFO.direccion}</span>
              </li>
              <li className="flex items-center space-x-2">
                <Clock className="h-4 w-4 flex-shrink-0 text-white" />
                <span className="text-white/82">{translateHours(CONTACT_INFO.horario, locale)}</span>
              </li>
              <li className="flex items-center space-x-2">
                <Phone className="h-4 w-4 flex-shrink-0 text-white" />
                <span className="text-white/82">{telefonos}</span>
              </li>
              <li className="flex items-center space-x-2">
                <Mail className="h-4 w-4 flex-shrink-0 text-white" />
                <a href={SOCIAL_MEDIA.email} className="text-white/82 transition-colors hover:text-white">
                  {CONTACT_INFO.email}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">{p('followUs')}</h3>
            <div className="flex flex-wrap gap-3">
              {SOCIAL_MEDIA.instagram && (
                <a
                  href={SOCIAL_MEDIA.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${p('followUs')} Instagram`}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E1306C] text-white shadow-[0_10px_24px_rgba(225,48,108,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#C13584]"
                >
                  <Instagram className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {SOCIAL_MEDIA.facebook && (
                <a
                  href={SOCIAL_MEDIA.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${p('followUs')} Facebook`}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1877F2] text-white shadow-[0_10px_24px_rgba(24,119,242,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#0F67DB]"
                >
                  <FaFacebook className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {SOCIAL_MEDIA.threads && (
                <a
                  href={SOCIAL_MEDIA.threads}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${p('followUs')} Threads`}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-white shadow-[0_10px_24px_rgba(15,23,42,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-black"
                >
                  <ThreadsIcon className="h-4 w-4" />
                </a>
              )}
              {SOCIAL_MEDIA.whatsapp && (
                <a
                  href={SOCIAL_MEDIA.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={p('contactWhatsApp')}
                  data-analytics-location="footer"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_10px_24px_rgba(37,211,102,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#1EBE5D]"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {SOCIAL_MEDIA.whatsappChannel && (
                <a
                  href={SOCIAL_MEDIA.whatsappChannel}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={p('contactChannel')}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#128C7E] text-white shadow-[0_10px_24px_rgba(18,140,126,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#0F766E]"
                >
                  <Radio className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {SOCIAL_MEDIA.email && (
                <a
                  href={SOCIAL_MEDIA.email}
                  aria-label={p('sendEmail')}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#0f172a] shadow-[0_10px_24px_rgba(255,255,255,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-gray-100"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-white/15 pt-4">
          <div className="flex flex-col items-center justify-between gap-2 md:flex-row">
            <p className="text-center text-sm text-white/82 md:text-left">
              &copy; {new Date().getFullYear()} {SITE_NAME}. {p('allRightsReserved')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
              <Link href={`${prefix}/terminos-condiciones`} className="text-white/82 transition-colors hover:text-white">
                {p('terms')}
              </Link>
              <span className="text-white/45">|</span>
              <Link href={`${prefix}/privacidad`} className="text-white/82 transition-colors hover:text-white">
                {locale === 'en' ? 'Privacy and cookies' : 'Privacidad y cookies'}
              </Link>
              <span className="text-white/45">|</span>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT))}
                className="text-white/82 transition-colors hover:text-white"
              >
                {locale === 'en' ? 'Cookie settings' : 'Configurar cookies'}
              </button>
              <span className="text-white/45">|</span>
              <span className="text-white/82">{f('legajo', { number: LEGAL_INFO.legajoRnav })}</span>
            </div>
          </div>
          <div className="mt-2 border-t border-white/15 pt-2">
            <div className="flex flex-col items-center justify-center gap-1.5 md:flex-row">
              <p className="text-center text-sm text-white/82">
                {p('developedBy')} {" "}
                <a
                  href={developer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-white transition-colors hover:text-secondary"
                >
                  {developer.name}
                </a>
              </p>
              {developer.url.includes("instagram.com") && (
                <a
                  href={developer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={f('followDeveloper', { name: developer.name })}
                  className="rounded-full border border-white/20 p-2 text-white/75 transition-colors hover:border-secondary hover:text-secondary"
                >
                  <FaInstagram className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
