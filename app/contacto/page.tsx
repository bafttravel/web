import Navbar from '@/components/Navbar';
import HomeFooter from '@/components/home/HomeFooter';
import WhatsAppButton from '@/components/WhatsAppButton';
import { CONTACT_INFO, SOCIAL_MEDIA, SITE_NAME, SITE_URL } from '@/lib/constants';
import type { Metadata } from 'next';
import { MapPin, Clock, Phone, Mail, Radio } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { siteConfig } from '@/lib/siteConfig';
import { getTranslations } from 'next-intl/server';

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  title: `Contacto - ${SITE_NAME}`,
  description: `Contactate con ${SITE_NAME}. Atención online y presencial. Consultas por WhatsApp o email.`,
  alternates: { canonical: `${siteUrl}/contacto` },
};

export default async function ContactoPage() {
  const p = await getTranslations('public');
  const telefonos = [CONTACT_INFO.telefono, CONTACT_INFO.telefonoSecundario].filter(Boolean).join(' / ');
  return (
    <>
      <Navbar variant="homeMockup" reserveSpace />
      <WhatsAppButton />

      <main className="bg-white min-h-screen pt-32 md:pt-40">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-5xl mb-16">
          <div className="pt-24 mb-10">
            <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-6 tracking-tight">{p('contactTitle')}</h1>
            <p className="text-base md:text-lg text-gray-600 max-w-3xl leading-relaxed">
              {p('contactDescription')}
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-primary mb-8">{p('weAre', { siteName: SITE_NAME })}</h2>
            
            <ul className="space-y-5 text-gray-700 text-base md:text-lg font-medium">
              <li className="flex items-center gap-4">
                <MapPin className="w-6 h-6 text-primary shrink-0" strokeWidth={2} />
                <span>{CONTACT_INFO.direccion}</span>
              </li>
              <li className="flex items-center gap-4">
                <Clock className="w-6 h-6 text-primary shrink-0" strokeWidth={2} />
                <span>{CONTACT_INFO.horario}</span>
              </li>
              <li className="flex items-center gap-4">
                <Phone className="w-6 h-6 text-primary shrink-0" strokeWidth={2} />
                <span>{telefonos}</span>
              </li>
              <li className="flex items-center gap-4">
                <FaWhatsapp className="w-6 h-6 text-primary shrink-0" />
                <span>{CONTACT_INFO.whatsappDisplay}</span>
              </li>
              {SOCIAL_MEDIA.whatsappChannel && (
                <li className="flex items-center gap-4">
                  <Radio className="w-6 h-6 text-primary shrink-0" strokeWidth={2} />
                  <a
                    href={SOCIAL_MEDIA.whatsappChannel}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    {p('channel')}
                  </a>
                </li>
              )}
              {SOCIAL_MEDIA.email && (
                <li className="flex items-center gap-4">
                  <Mail className="w-6 h-6 text-primary shrink-0" strokeWidth={2} />
                  <a href={SOCIAL_MEDIA.email} className="hover:text-primary transition-colors">
                    {CONTACT_INFO.email}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Mapa Full Width */}
        {siteConfig.features.showContactMap && (
          <div className="w-full h-[400px] md:h-[500px] bg-gray-100 relative">
            <iframe 
              src={CONTACT_INFO.mapUrl} 
              className="w-full h-full border-0 absolute inset-0" 
              allowFullScreen={false} 
              loading="lazy" 
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        )}
      </main>

      <HomeFooter />
    </>
  );
}
