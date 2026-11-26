'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { MessageCircle, Phone, Radio, MapPin, Mail } from 'lucide-react';
import ContactForm from '@/components/ContactForm';
import { CONTACT_INFO, SOCIAL_MEDIA } from '@/lib/constants';
import { renderTemplate, siteConfig } from '@/lib/siteConfig';
import { useTranslations } from 'next-intl';

interface ContactSectionProps {
  showTitle?: boolean;
  paqueteTitulo?: string;
  paqueteId?: string;
}

export default function ContactSection({ showTitle = true, paqueteTitulo, paqueteId }: ContactSectionProps) {
  const t = useTranslations('public');
  const h = useTranslations('home.contactForm');
  const content = { ...siteConfig.content.contactForm, title: h('title'), subtitle: h('subtitle'), whatsappCta: h('whatsappCta') };
  const imageAlt = h('imageAlt', { siteName: siteConfig.branding.siteName });
  const contact = siteConfig.company.contact;
  const addressLabel = contact.direccion || 'Patagonia, Argentina';
  const emailHref = contact.email ? `mailto:${contact.email}` : SOCIAL_MEDIA.email;
  const emailLabel = contact.email || CONTACT_INFO.email;
  const whatsappHref = `https://wa.me/${CONTACT_INFO.whatsapp}`;
  const whatsappLabel = CONTACT_INFO.whatsappDisplay ? `+54 9 ${CONTACT_INFO.whatsappDisplay}` : CONTACT_INFO.whatsapp;
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
    },
  };

  const lineRevealVariants = {
    hidden: { y: '100%' },
    visible: {
      y: '0%',
      transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <div className="container mx-auto px-4">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={containerVariants}
      >
        <div className="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-[0_12px_30px_rgba(0,0,0,0.08)] transition-all duration-500 hover:shadow-[0_20px_44px_rgba(0,0,0,0.14)]">
          <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_70%_0%,rgba(178,244,50,0.18),transparent)] opacity-70 pointer-events-none" />
          <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[2fr_3fr]">
            <div className="p-6 md:p-7 lg:p-8">
              {showTitle && (
                <motion.div className="mb-5" variants={itemVariants}>
                  <h2 className="text-base md:text-lg font-bold mb-1.5 overflow-hidden">
                    <motion.span
                      className="block"
                      variants={lineRevealVariants}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, margin: '-120px' }}
                    >
                      {content.title}
                    </motion.span>
                  </h2>
                  <p className="text-sm md:text-base text-gray-600 overflow-hidden">
                    <motion.span
                      className="block"
                      variants={lineRevealVariants}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, margin: '-120px' }}
                    >
                      {content.subtitle}
                    </motion.span>
                  </p>
                </motion.div>
              )}
              <ContactForm paqueteTitulo={paqueteTitulo} paqueteId={paqueteId} />
            </div>
            <div className="relative min-h-[240px] lg:min-h-full">
              <Image
                src={content.image.src}
                alt={imageAlt}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 60vw"
              />
              <div className="absolute inset-0 bg-linear-to-b from-black/30 via-black/30 to-black/70" />
              <div className="absolute inset-0 flex flex-col items-end justify-end p-4 md:p-6 text-white text-right">
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-lg bg-success text-white text-xs font-semibold py-2 px-3 hover:bg-success/90"
                >
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
                  </svg>
                  <motion.span
                    className="block overflow-hidden"
                    variants={lineRevealVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-120px' }}
                  >
                    {content.whatsappCta}
                  </motion.span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

       <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50/70 p-6">
              <div className={`grid grid-cols-1 gap-4 text-gray-700 ${emailHref && emailLabel ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{t('address')}</div>
                    <div className="text-sm">{addressLabel}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MessageCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <div className="text-sm font-semibold text-gray-900">WhatsApp</div>
                    <a
                      className="text-sm hover:text-primary transition-colors"
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {whatsappLabel}
                    </a>
                  </div>
                </div>
                {emailHref && emailLabel && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{t('email')}</div>
                      <a className="text-sm hover:text-primary transition-colors" href={emailHref}>
                        {emailLabel}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
    </div>
  );
}
