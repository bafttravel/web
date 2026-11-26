import Link from 'next/link';
import Image from 'next/image';
import { Instagram, MapPin, Phone, Mail, Clock, Radio } from 'lucide-react';
import { CONTACT_INFO, SOCIAL_MEDIA, SITE_NAME, LEGAL_INFO } from '@/lib/constants';
import { getBrandLogoSrc, isRemoteUrl, renderTemplate, siteConfig } from '@/lib/siteConfig';
import { useTranslations } from 'next-intl';

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

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    aria-label="WhatsApp"
    role="img"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

export default function Footer() {
  const p = useTranslations('public');
  const logoSrc = '/images/logo_white.png';
  const logoAlt = renderTemplate(siteConfig.branding.logo.altTextTemplate || '{{siteName}} Logo');
  const developer = siteConfig.company.developerCredits;
  const telefonos = [CONTACT_INFO.telefono, CONTACT_INFO.telefonoSecundario].filter(Boolean).join(' / ');
  return (
    <footer className="bg-black text-cream">
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 md:gap-6">
          {/* Logo y descripción */}
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 flex items-center justify-center">
                {isRemoteUrl(logoSrc) ? (
                  <img
                    src={logoSrc}
                    alt={logoAlt}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Image
                    src={logoSrc}
                    alt={logoAlt}
                    width={48}
                    height={48}
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
              <span className="font-logo text-cream text-2xl leading-none whitespace-nowrap">
                {siteConfig.branding.logo.titleText}
              </span>
            </div>
            <p className="text-gray-400 text-sm font-body leading-snug">
              {renderTemplate(siteConfig.content.footer.taglineTemplate)}
            </p>
          </div>

          {/* Enlaces rápidos — orden: Inicio, Experiencias, Excursiones, Destinos, Términos */}
          <div>
            <h3 className="font-semibold text-sm mb-2">Enlaces</h3>
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                  Inicio
                </Link>
              </li>
              <li>
                <Link href="/#experiencias" className="text-gray-400 hover:text-white transition-colors">
                  Experiencias
                </Link>
              </li>
              <li>
                <Link href="/excursiones" className="text-gray-400 hover:text-white transition-colors">
                  Excursiones
                </Link>
              </li>
              <li>
                <Link href="/#destinos" className="text-gray-400 hover:text-white transition-colors">
                  Destinos
                </Link>
              </li>
              <li>
                <Link href="/terminos-condiciones" className="text-gray-400 hover:text-white transition-colors">
                  {p('terms')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h3 className="font-semibold text-sm mb-2">Contacto</h3>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-start space-x-2">
                <MapPin className="h-4 w-4 text-white mt-0.5 flex-shrink-0" />
                <span className="text-gray-400">{CONTACT_INFO.direccion}</span>
              </li>
              <li className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-white flex-shrink-0" />
                <span className="text-gray-400">{CONTACT_INFO.horario}</span>
              </li>
              <li className="flex items-center space-x-2">
                <Phone className="h-4 w-4 text-white flex-shrink-0" />
                <span className="text-gray-400">{telefonos}</span>
              </li>
              {CONTACT_INFO.email && (
                <li className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-white flex-shrink-0" />
                  <span className="text-gray-400">{CONTACT_INFO.email}</span>
                </li>
              )}
            </ul>
          </div>

          {/* Redes sociales */}
          <div>
            <h3 className="font-semibold text-sm mb-2">{p('followUs')}</h3>
            <div className="flex space-x-2.5">
              {SOCIAL_MEDIA.instagram && (
                <a
                  href={SOCIAL_MEDIA.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${p('followUs')} Instagram`}
                  className="border border-secondary text-secondary p-2 rounded-full hover:bg-secondary/10 transition-colors"
                >
                  <Instagram className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {SOCIAL_MEDIA.threads && (
                <a
                  href={SOCIAL_MEDIA.threads}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${p('followUs')} Threads`}
                  className="border border-secondary text-secondary p-2 rounded-full hover:bg-secondary/10 transition-colors"
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
                  className="border border-secondary text-secondary p-2 rounded-full hover:bg-secondary/10 transition-colors"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                </a>
              )}
              {SOCIAL_MEDIA.whatsappChannel && (
                <a
                  href={SOCIAL_MEDIA.whatsappChannel}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={p('contactChannel')}
                  className="border border-secondary text-secondary p-2 rounded-full hover:bg-secondary/10 transition-colors"
                >
                  <Radio className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {SOCIAL_MEDIA.email && (
                <a
                  href={SOCIAL_MEDIA.email}
                  aria-label={p('sendEmail')}
                  className="border border-secondary text-secondary p-2 rounded-full hover:bg-secondary/10 transition-colors"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-4 pt-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-2">
            <p className="text-gray-400 text-sm text-center md:text-left">
              &copy; {new Date().getFullYear()} {SITE_NAME}. {p('allRightsReserved')}
            </p>
            <div className="flex flex-wrap justify-center items-center gap-3 text-sm">
              <Link 
                href="/terminos-condiciones" 
                className="text-gray-400 hover:text-white transition-colors"
              >
                {p('terms')}
              </Link>
              <span className="text-gray-500">|</span>
              <span className="text-gray-400">
                Legajo RNAV N° {LEGAL_INFO.legajoRnav}
              </span>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-2 pt-2">
            <div className="flex flex-col md:flex-row justify-center items-center gap-1.5">
              <p className="text-gray-400 text-sm text-center">
                {p('developedBy')} {' '}
                <a
                  href={developer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cream hover:text-secondary transition-colors font-medium"
                >
                  {developer.name}
                </a>
              </p>
              {developer.url.includes('instagram.com') && (
                <a
                  href={developer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Seguir a ${developer.name} en Instagram`}
                  className="border border-gray-800 text-cream/60 p-2 rounded-full hover:text-secondary hover:border-secondary transition-colors"
                >
                  <Instagram className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
