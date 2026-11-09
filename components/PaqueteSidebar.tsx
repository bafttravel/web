'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import type { Paquete } from '@/types';
import { Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, Info, MapPin, ShieldCheck, Users, X } from 'lucide-react';
import BookingAddonsStep from '@/components/paquete/BookingAddonsStep';
import WhatsAppOfficialIcon from '@/components/WhatsAppOfficialIcon';
import { getWhatsAppLink } from '@/lib/utils/whatsapp';
import {
  buildBookingCalendarMonth,
  filterAvailabilityToBookingWindow,
  type BookingAvailabilityItem,
} from '@/lib/packages/booking-calendar';
import { getPackageAddonOptions } from '@/lib/packages/resolve-departure';
import {
  buildLeadTimeMessage,
  getFirstBookableDateIso,
  getMinLeadHours,
  formatIsoDateEs,
} from '@/lib/packages/booking-rules';
import {
  clampPeopleBreakdownToMax,
  getPeopleBreakdownTotal,
  normalizePeopleBreakdown,
  normalizePeopleCategories,
  type PeopleBreakdown,
  type PeopleCategoryConfig,
} from '@/lib/packages/people-categories';

interface PaqueteSidebarProps {
  paquete: Paquete;
  bookingDates?: BookingAvailabilityItem[];
}

const MODAL_SPRING = { type: 'spring', stiffness: 340, damping: 32 } as const;

const modalSlideVariants = {
  enter: (direction: 1 | -1) => ({ opacity: 0, x: direction * 56 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: 1 | -1) => ({ opacity: 0, x: direction * -56 }),
};

const monthSlideVariants = {
  enter: (direction: 1 | -1) => ({ opacity: 0, x: direction * 32 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: 1 | -1) => ({ opacity: 0, x: direction * -32 }),
};

const monthLabelVariants = {
  enter: (direction: 1 | -1) => ({ opacity: 0, y: direction * 10 }),
  center: { opacity: 1, y: 0 },
  exit: (direction: 1 | -1) => ({ opacity: 0, y: direction * -10 }),
};

function parsePromoDeadline(value?: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T23:59:59`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatPromoDeadline(value: string | null | undefined, locale: string) {
  const parsed = parsePromoDeadline(value);
  if (!parsed) return '';
  return parsed
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    .replace('.', '');
}

function formatDateLabel(value: string, locale: string) {
  if (!value || value === 'sin-fecha') return locale === 'en' ? 'To be coordinated' : 'A coordinar';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatMonthLabel(year: number, month: number, locale: string) {
  return new Date(year, month, 1).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
    month: 'long',
    year: 'numeric',
  });
}

function isWithin48Hours(isoDate: string): boolean {
  const target = new Date(`${isoDate}T00:00:00`);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours > -24 && diffHours <= 48;
}

export default function PaqueteSidebar({ paquete, bookingDates = [] }: PaqueteSidebarProps) {
  const locale = useLocale();
  const t = useTranslations('checkout');
  const s = useTranslations('sidebar');
  const numLocale = locale === 'en' ? 'en-US' : 'es-AR';
  const weekDays = s('weekdays').split(',');
  const destino = paquete.destino || paquete.eventoLugar || '-';
  const duracion = paquete.duracion || '-';
  const bookingEnabled = paquete.bookingConfig?.enabled !== false;
  const maxPeoplePerBooking = Math.max(
    1,
    Math.min(50, Math.floor(Number(paquete.bookingConfig?.maxPeoplePerBooking ?? paquete.capacidadMaxima ?? 6) || 6))
  );
  const defaultAdultsLabel = s('defaultAdults');
  const defaultMinorsLabel = s('defaultMinors');
  const peopleCategories: PeopleCategoryConfig[] = useMemo(
    () =>
      normalizePeopleCategories((paquete.bookingConfig as any)?.peopleCategories, maxPeoplePerBooking).map((category) => {
        if (locale !== 'en') return category;
        if (category.key === 'adults' && category.label === 'Adultos') return { ...category, label: defaultAdultsLabel };
        if (category.key === 'minors' && category.label === 'Menores') return { ...category, label: defaultMinorsLabel };
        return category;
      }),
    [maxPeoplePerBooking, paquete.bookingConfig, locale, defaultAdultsLabel, defaultMinorsLabel]
  );
  const specialPrice = Number(paquete.precioDescuentoPrimerosCupos ?? 0);
  const specialDeadline = formatPromoDeadline(paquete.tarifaEspecialFechaLimite, locale);
  const specialDeadlineDate = parsePromoDeadline(paquete.tarifaEspecialFechaLimite);
  const [renderedAt] = useState(() => Date.now());
  const baseDate = useMemo(() => new Date(renderedAt), [renderedAt]);
  const minLeadHours = getMinLeadHours(paquete.bookingConfig);
  const firstBookableDateIso = useMemo(
    () => (minLeadHours > 0 ? getFirstBookableDateIso(minLeadHours, baseDate) : ''),
    [baseDate, minLeadHours]
  );
  const leadTimeNotice = useMemo(() => (minLeadHours > 0 ? buildLeadTimeMessage(minLeadHours, locale) : ''), [minLeadHours, locale]);
  const hasSpecialPrice =
    specialPrice > 0 &&
    paquete.precio > 0 &&
    specialPrice < paquete.precio &&
    Boolean(specialDeadline) &&
    Boolean(specialDeadlineDate && specialDeadlineDate.getTime() >= renderedAt);
  const [step, setStep] = useState<'people' | 'calendar' | 'addons'>('people');
  const [modalDirection, setModalDirection] = useState<1 | -1>(1);
  const [selectedDate, setSelectedDate] = useState('');
  const [monthCursor, setMonthCursor] = useState(0);
  const [monthDirection, setMonthDirection] = useState<1 | -1>(1);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [tooltipInfo, setTooltipInfo] = useState<{ visible: boolean; x: number; y: number; date: string }>({ visible: false, x: 0, y: 0, date: '' });
  const [mounted, setMounted] = useState(false);
  const [pax, setPax] = useState<PeopleBreakdown>(() =>
    normalizePeopleBreakdown({ breakdown: null, categories: peopleCategories })
  );
  const people = Math.max(1, Math.floor(getPeopleBreakdownTotal(pax)));
  const whatsappMessage = s('whatsappMessage', { title: paquete.titulo });
  const whatsappHref = useMemo(() => getWhatsAppLink(whatsappMessage), [whatsappMessage]);
  const paymentMethods = ['VISA', 'mastercard', 'NARANJA', 'mercado pago'];
  const condiciones = useMemo(
    () =>
      Array.isArray(paquete.condiciones)
        ? paquete.condiciones
          .map((item) => ({
            titulo: String(item?.titulo ?? '').trim(),
            texto: String(item?.texto ?? '').trim(),
          }))
          .filter((item) => item.titulo.length > 0 && item.texto.length > 0)
        : [],
    [paquete.condiciones]
  );

  const visibleBookingDates = useMemo(
    () => filterAvailabilityToBookingWindow(bookingDates, baseDate),
    [baseDate, bookingDates]
  );

  const bookableBookingDates = visibleBookingDates;

  const selectedAvailability = useMemo(
    () => visibleBookingDates.find((item) => item.date === selectedDate) ?? null,
    [selectedDate, visibleBookingDates]
  );

  const getSalidaForDate = (date: string) => paquete.salidas?.find((salida) => salida.fecha === date) ?? null;

  const addonOptions = useMemo(() => getPackageAddonOptions(paquete), [paquete]);
  const hasAddons = addonOptions.length > 0;
  const addonCurrencyLabel = getSalidaForDate(selectedDate)?.moneda || paquete.moneda || 'ARS';
  const selectedAddonsTotal = useMemo(
    () =>
      addonOptions
        .filter((addon) => selectedAddonIds.includes(addon.id))
        .reduce((sum, addon) => sum + Math.max(0, Number(addon.price) || 0) * people, 0),
    [addonOptions, selectedAddonIds, people]
  );

  const toggleAddon = (id: string) => {
    setSelectedAddonIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const months = useMemo(() => {
    const monthKeys = new Set(visibleBookingDates.map((item) => item.date.slice(0, 7)));
    return [...monthKeys].sort().map((key) => {
      const [year, month] = key.split('-').map(Number);
      return { year, month: month - 1 };
    });
  }, [visibleBookingDates]);

  const monthIndexForSelectedDate = () => {
    if (!selectedDate) return 0;
    const key = selectedDate.slice(0, 7);
    const index = months.findIndex((item) => `${item.year}-${String(item.month + 1).padStart(2, '0')}` === key);
    return index >= 0 ? index : 0;
  };

  const openCalendar = () => {
    setModalDirection(1);
    setMonthCursor(selectedDate ? monthIndexForSelectedDate() : 0);
    setStep('calendar');
  };

  const goToAddons = () => {
    if (!hasAddons) return;
    setSelectedAddonIds((current) => current.filter((addonId) => addonOptions.some((addon) => addon.id === addonId)));
    setModalDirection(1);
    setStep('addons');
  };

  const backToCalendar = () => {
    setModalDirection(-1);
    setMonthCursor(selectedDate ? monthIndexForSelectedDate() : 0);
    setStep('calendar');
  };

  const closeModal = () => setStep('people');

  useEffect(() => setMounted(true), []);

  const [referralCode, setReferralCode] = useState('');
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const fromUrl = (url.searchParams.get('ref') || url.searchParams.get('referral') || url.searchParams.get('code') || '').trim();
      if (fromUrl) sessionStorage.setItem('referral_code', fromUrl);
      setReferralCode(fromUrl || sessionStorage.getItem('referral_code') || '');
    } catch {
      setReferralCode('');
    }
  }, []);

  useEffect(() => {
    if (!tooltipInfo.visible) return;
    const handler = () => setTooltipInfo({ visible: false, x: 0, y: 0, date: '' });
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [tooltipInfo.visible]);

  const maxSelectablePeopleForDate = maxPeoplePerBooking;

  useEffect(() => {
    const safeMax = Math.max(1, Math.floor(Number(maxPeoplePerBooking) || 1));
    const normalizedCategories = normalizePeopleCategories((paquete.bookingConfig as any)?.peopleCategories, safeMax);
    const normalized = normalizePeopleBreakdown({ breakdown: pax, categories: normalizedCategories });
    const clamped = clampPeopleBreakdownToMax({
      breakdown: normalized,
      categories: normalizedCategories,
      maxPeoplePerBooking: safeMax,
    });
    setPax((current) => (JSON.stringify(current) === JSON.stringify(clamped) ? current : clamped));
  }, [maxPeoplePerBooking, paquete.bookingConfig, pax]);

  useEffect(() => {
    if (!selectedDate || !selectedAvailability) return;
    if (maxSelectablePeopleForDate <= 0) {
      setSelectedDate('');
      return;
    }
    if (people <= maxSelectablePeopleForDate) return;
    setPax((current) =>
      clampPeopleBreakdownToMax({
        breakdown: current,
        categories: peopleCategories,
        maxPeoplePerBooking: maxSelectablePeopleForDate,
      })
    );
  }, [maxSelectablePeopleForDate, people, peopleCategories, selectedAvailability, selectedDate]);

  // Cursor de mes acotado a los meses con salidas disponibles (navegación única).
  const activeMonthIndex = Math.min(Math.max(0, monthCursor), Math.max(0, months.length - 1));
  const activeMonth = months[activeMonthIndex] ?? null;
  const activeMonthKey = activeMonth ? `${activeMonth.year}-${String(activeMonth.month + 1).padStart(2, '0')}` : '';
  const goPrevMonth = () => {
    if (activeMonthIndex <= 0) return;
    setMonthDirection(-1);
    setMonthCursor(activeMonthIndex - 1);
  };
  const goNextMonth = () => {
    if (activeMonthIndex >= months.length - 1) return;
    setMonthDirection(1);
    setMonthCursor(activeMonthIndex + 1);
  };

  // El modal bloquea el scroll de fondo y se cierra con Escape.
  useEffect(() => {
    if (step === 'people') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStep('people');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [step]);

  const bookingHref = useMemo(() => {
    const params = new URLSearchParams({
      slug: paquete.slug,
      date: selectedDate || 'sin-fecha',
      people: String(people),
      pax: JSON.stringify(pax),
    });
    if (selectedAddonIds.length > 0) {
      params.set('addons', selectedAddonIds.join(','));
    }
    if (referralCode) {
      params.set('ref', referralCode);
    }
    return `/${locale}/checkout?${params.toString()}`;
  }, [locale, paquete.slug, people, pax, referralCode, selectedAddonIds, selectedDate]);

  const modalSteps = hasAddons ? [t('chooseDate'), t('addExtras'), t('reservation')] : [t('chooseDate'), t('reservation')];

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-[#D4E6F7] bg-white p-5 shadow-[0_14px_34px_rgba(15,66,116,0.08)]">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">{t('directReservation')}</div>

        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {paquete.mostrarDesde ? s('priceFrom') : s('price')}
          </div>

          {hasSpecialPrice ? (
            <div className="mt-1">
              <div className="flex items-baseline gap-2 text-gray-500">
                <span className="text-lg font-semibold leading-none line-through decoration-2">
                  ${paquete.precio.toLocaleString(numLocale)}
                </span>
                <span className="text-xs font-extrabold uppercase">{paquete.moneda || 'ARS'}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[38px] font-black leading-none tracking-[-0.03em] text-black">
                  ${specialPrice.toLocaleString(numLocale)}
                </span>
                <span className="text-sm font-extrabold uppercase text-black">{paquete.moneda || 'ARS'}</span>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-semibold text-green-700">{s('specialRate')}</span> · {s('validUntil', { date: specialDeadline })}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{s('perPerson')}</p>
            </div>
          ) : (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[38px] font-black leading-none tracking-[-0.02em] text-black">
                ${paquete.precio.toLocaleString(numLocale)}
              </span>
              <span className="text-sm font-extrabold uppercase text-gray-600">{paquete.moneda || 'ARS'}</span>
            </div>
          )}
        </div>

        {String((paquete as any)?.fechaVencimiento ?? '').trim() ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-gray-700">
            <Clock className="h-4 w-4 text-gray-500" />
            {t('expires')}: <span className="font-semibold text-gray-900">{String((paquete as any).fechaVencimiento)}</span>
          </p>
        ) : null}

        <dl className="mt-4 divide-y divide-gray-100 border-t border-gray-100 text-sm">
          <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="flex items-center gap-2 text-slate-500">
              <MapPin className="h-4 w-4 text-success" />
              {s('destination')}
            </dt>
            <dd className="truncate text-right font-bold text-black">{destino}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="flex items-center gap-2 text-slate-500">
              <Calendar className="h-4 w-4 text-success" />
              {t('selectedDate')}
            </dt>
            <dd className="truncate text-right font-bold text-black">{formatDateLabel(selectedDate, locale)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="flex items-center gap-2 text-slate-500">
              <Clock className="h-4 w-4 text-success" />
              {s('duration')}
            </dt>
            <dd className="truncate text-right font-bold text-black">{duracion}</dd>
          </div>
        </dl>

        {bookingEnabled ? (
          step === 'people' ? (
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Users className="h-4 w-4 text-success" />
                {t('people')}
              </div>

              <div className="mt-1 divide-y divide-gray-100">
                {peopleCategories.map((category) => {
                  const value = Math.max(0, Number(pax[category.key] ?? category.min) || 0);
                  const canIncrement = people < maxPeoplePerBooking && value < category.max;
                  const canDecrement = value > category.min;
                  const minLabel = category.min > 0 ? s('minimum', { count: category.min }) : s('optional');
                  return (
                    <div key={category.key} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <div className="text-sm font-bold text-black">{category.label}</div>
                        <div className="text-xs text-slate-500">{minLabel}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPax((current) => ({
                              ...current,
                              [category.key]: Math.max(category.min, (Number(current[category.key] ?? 0) || 0) - 1),
                            }))
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-lg font-bold text-black transition hover:bg-gray-50 disabled:opacity-40"
                          aria-label={s('subtract', { label: category.label })}
                          disabled={!canDecrement}
                        >
                          -
                        </button>
                        <div className="min-w-[32px] text-center text-lg font-black text-black">{value}</div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!canIncrement) return;
                            setPax((current) => ({
                              ...current,
                              [category.key]: Math.min(category.max, (Number(current[category.key] ?? 0) || 0) + 1),
                            }));
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-lg font-bold text-black transition hover:bg-gray-50 disabled:opacity-40"
                          aria-label={s('add', { label: category.label })}
                          disabled={!canIncrement}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-1 text-xs text-slate-500">
                {t('people')}: <span className="font-extrabold text-black">{people}</span> · {t('maximumPerBooking')}:{' '}
                <span className="font-extrabold text-black">{maxPeoplePerBooking}</span>
              </p>

              {visibleBookingDates.length > 0 ? (
                <button
                  type="button"
                  onClick={openCalendar}
                  disabled={bookableBookingDates.length === 0}
                  className="group mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 text-[15px] font-semibold tracking-[-0.01em] text-white transition-all duration-300 hover:bg-neutral-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-30"
                >
                  {t('continue')}
                  <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </button>
              ) : (
                <Link
                  href={bookingHref}
                  data-analytics-location="package_sidebar"
                  data-item-slug={paquete.slug}
                  className="group mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 text-[15px] font-semibold tracking-[-0.01em] text-white transition-all duration-300 hover:bg-neutral-700 active:scale-[0.98]"
                >
                  {s('book')}
                  <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              )}

              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                data-analytics-location="package_sidebar"
                data-item-slug={paquete.slug}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] text-[15px] font-semibold text-white transition hover:bg-[#1EBE5A] active:scale-[0.98]"
              >
                <WhatsAppOfficialIcon className="h-5 w-5" />
                {t('askWhatsApp')}
              </a>
            </div>
          ) : null
        ) : (
          <p className="border-t border-gray-100 pt-3 text-sm text-slate-700">{s('bookingDisabled')}</p>
        )}

        {condiciones.length > 0 ? (
          <ul className="mt-4 space-y-2.5 border-t border-gray-100 pt-3 text-sm text-slate-700">
            {condiciones.map((item, index) => (
              <li key={`${item.titulo}-${index}`} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <div className="min-w-0">
                  <div className="font-semibold text-black">{item.titulo}</div>
                  <div className="mt-0.5 text-slate-600">{item.texto}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-black">
            <ShieldCheck className="h-4 w-4 text-success" />
            {s('safePurchase')}
          </div>
          <p className="mt-1 text-xs text-slate-600">{s('protectedPurchase')}</p>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">{paymentMethods.join(' · ')}</p>
        </div>
      </div>

      {mounted ? createPortal(
        <AnimatePresence>
          {bookingEnabled && step !== 'people' ? (
          <motion.div
            key="booking-modal"
            className="fixed inset-0 z-[300] flex min-h-full items-center justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={MODAL_SPRING}
              role="dialog"
              aria-modal="true"
              aria-label={t('chooseReservation')}
              className="my-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl md:max-h-[calc(100vh-2rem)]"
            >
              <div className="relative border-b border-gray-100 px-5 pb-4 pt-5">
                <button
                  type="button"
                  onClick={closeModal}
                  className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-gray-100 hover:text-black"
                  aria-label={s('close')}
                >
                  <X className="h-5 w-5" />
                </button>

                {hasAddons ? (
                  <div className="mb-3 flex flex-wrap items-center gap-1.5 pr-10">
                    {modalSteps.map((label, index) => {
                      const done = step === 'addons' && index === 0;
                      const active = (step === 'calendar' && index === 0) || (step === 'addons' && index === 1);
                      return (
                        <div key={label} className="flex items-center gap-1.5">
                          <div
                            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide transition-colors duration-300 ${active
                              ? 'bg-black text-white'
                              : done
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-slate-400'
                              }`}
                          >
                            {done ? <CheckCircle2 className="h-3 w-3" /> : <span>{index + 1}</span>}
                            {label}
                          </div>
                          {index < modalSteps.length - 1 ? <div className="h-px w-3 bg-gray-200" /> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="text-lg font-extrabold text-black">
                  {step === 'calendar' ? t('chooseDate') : t('addExtras')}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {step === 'calendar' ? (
                    <>
                      {t('availabilityFor', { count: people, unit: people === 1 ? t('person') : t('peopleUnit') })}
                    </>
                  ) : (
                    <>
                      <span className="font-extrabold text-black">{formatDateLabel(selectedDate, locale)}</span>
                      {' · '}
                      <span className="font-extrabold text-black">{people}</span>{' '}
                      {people === 1 ? t('person') : t('peopleUnit')}.
                    </>
                  )}
                </div>
              </div>

              <div className="max-h-[calc(100vh-14rem)] flex-1 overflow-y-auto px-5 py-4">
                <AnimatePresence mode="wait" initial={false} custom={modalDirection}>
                  {step === 'calendar' ? (
                    <motion.div
                      key="modal-calendar"
                      custom={modalDirection}
                      variants={modalSlideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={MODAL_SPRING}
                    >
                      {activeMonth ? (
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={goPrevMonth}
                              disabled={activeMonthIndex === 0}
                              aria-label={s('prevMonth')}
                              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-900 active:scale-90 disabled:pointer-events-none disabled:opacity-25"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <div className="relative flex-1 overflow-hidden text-center">
                              <AnimatePresence mode="wait" initial={false} custom={monthDirection}>
                                <motion.div
                                  key={activeMonthKey}
                                  custom={monthDirection}
                                  variants={monthLabelVariants}
                                  initial="enter"
                                  animate="center"
                                  exit="exit"
                                  transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                                  className="text-[15px] font-bold capitalize tracking-[-0.01em] text-neutral-900"
                                >
                                  {formatMonthLabel(activeMonth.year, activeMonth.month, locale)}
                                </motion.div>
                              </AnimatePresence>
                              {months.length > 1 ? (
                                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
                                  {s('monthsWithDepartures', { current: activeMonthIndex + 1, total: months.length })}
                                </div>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={goNextMonth}
                              disabled={activeMonthIndex >= months.length - 1}
                              aria-label={s('nextMonth')}
                              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-900 active:scale-90 disabled:pointer-events-none disabled:opacity-25"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="relative mt-4 overflow-hidden">
                            <AnimatePresence mode="wait" initial={false} custom={monthDirection}>
                              <motion.div
                                key={activeMonthKey}
                                custom={monthDirection}
                                variants={monthSlideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
                                className="min-h-[296px]"
                              >
                                <div className="grid grid-cols-7 gap-1">
                                  {weekDays.map((day, dayIndex) => (
                                    <div
                                      key={`${activeMonthKey}-weekday-${dayIndex}`}
                                      className="flex h-8 items-center justify-center text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400"
                                    >
                                      {day}
                                    </div>
                                  ))}
                                </div>
                                <div className="grid grid-cols-7 gap-1">
                                  {buildBookingCalendarMonth({
                                    year: activeMonth.year,
                                    month: activeMonth.month,
                                    entries: visibleBookingDates,
                                    minBookableDateIso: firstBookableDateIso,
                                  }).map((cell) => {
                                    const isSelected = selectedDate === cell.isoDate;
                                    const sharedClasses =
                                      'relative flex h-10 w-full items-center justify-center rounded-full text-[13px] font-semibold transition-all duration-200';
                                    const showInfo = isWithin48Hours(cell.isoDate) && cell.inMonth;

                                    const handleInfoClick = (event: React.MouseEvent) => {
                                      event.stopPropagation();
                                      if (tooltipInfo.visible && tooltipInfo.date === cell.isoDate) {
                                        setTooltipInfo({ visible: false, x: 0, y: 0, date: '' });
                                      } else {
                                        setTooltipInfo({
                                          visible: true,
                                          x: event.clientX,
                                          y: event.clientY,
                                          date: cell.isoDate,
                                        });
                                      }
                                    };

                                    const dayContent = (
                                      <span className="relative flex h-full w-full items-center justify-center">
                                        {cell.day}
                                        {cell.isSelectable && (
                                          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-green-500" />
                                        )}
                                      </span>
                                    );

                                    const infoIcon = showInfo ? (
                                      <span
                                        className="absolute top-0.5 right-0.5 cursor-pointer z-10"
                                        onClick={handleInfoClick}
                                      >
                                        <Info className="h-3.5 w-3.5 text-blue-500 hover:text-blue-700 transition-colors" />
                                      </span>
                                    ) : null;

                                    if (!cell.inMonth) {
                                      return <div key={cell.isoDate} className={sharedClasses} aria-hidden="true" />;
                                    }

                                    if (cell.isSelectable) {
                                      return (
                                        <button
                                          key={cell.isoDate}
                                          type="button"
                                          onClick={() => setSelectedDate(cell.isoDate)}
                                          className={`${sharedClasses} ${isSelected
                                            ? 'scale-105 bg-neutral-900 text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.5)]'
                                            : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-900 hover:text-white'
                                            }`}
                                          aria-label={`${s('select')} ${formatDateLabel(cell.isoDate, locale)}.`}
                                          aria-pressed={isSelected}
                                        >
                                          {dayContent}
                                          {infoIcon}
                                        </button>
                                      );
                                    }

                                    return (
                                      <div
                                        key={cell.isoDate}
                                        className={`${sharedClasses} ${cell.isTooSoon ? 'text-amber-500/60' : 'text-neutral-200'}`}
                                        aria-label={
                                          cell.isTooSoon
                                            ? s('outsideLeadTime', { day: cell.day, hours: minLeadHours })
                                            : s('noDeparture', { day: cell.day })
                                        }
                                      >
                                        {dayContent}
                                        {infoIcon}
                                      </div>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            </AnimatePresence>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {leadTimeNotice ? (
                            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                              <span>{leadTimeNotice}</span>
                            </div>
                          ) : null}
                          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">
                            {t('noDatesAvailable')}
                          </div>
                        </div>
                      )}

                      <div className="mt-6 border-t border-neutral-100 pt-4">
                        <AnimatePresence mode="wait" initial={false}>
                          {selectedDate ? (
                            <motion.div
                              key="calendar-selection"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                            >
                              <div className="flex items-end justify-between gap-3">
                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-400">
                                    {s('chosenDeparture')}
                                  </div>
                                  <div className="mt-1 text-[15px] font-bold capitalize tracking-[-0.01em] text-neutral-900">
                                    {formatDateLabel(selectedDate, locale)}
                                  </div>
                                </div>
                                {selectedAvailability ? (
                                  <div className="text-right">
                                    <div className="text-[15px] font-bold tracking-[-0.01em] text-neutral-900">
                                      {getSalidaForDate(selectedDate)?.moneda || paquete.moneda || 'ARS'} $
                                      {Number(getSalidaForDate(selectedDate)?.precio ?? paquete.precio ?? 0).toLocaleString(numLocale)}
                                    </div>
                                    <div className="text-[11px] font-medium text-neutral-400">{s('perPersonLower')}</div>
                                  </div>
                                ) : null}
                              </div>
                            </motion.div>
                          ) : (
                            <motion.p
                              key="calendar-hint"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="text-center text-[13px] text-neutral-400"
                            >
                              {t('chooseDateToContinue')}
                            </motion.p>
                          )}
                        </AnimatePresence>

                        {hasAddons ? (
                          <button
                            type="button"
                            onClick={goToAddons}
                            disabled={!selectedDate}
                            className="group mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 text-[15px] font-semibold tracking-[-0.01em] text-white transition-all duration-300 hover:bg-neutral-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-30"
                          >
                            {t('continue')}
                            <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                          </button>
                        ) : (
                          <Link
                            href={bookingHref}
                            data-analytics-location="package_sidebar"
                            data-item-slug={paquete.slug}
                            aria-disabled={!selectedDate}
                            onClick={(event) => {
                              if (!selectedDate) event.preventDefault();
                            }}
                            className={`group mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold tracking-[-0.01em] transition-all duration-300 active:scale-[0.98] ${selectedDate
                              ? 'bg-neutral-900 text-white hover:bg-neutral-700'
                              : 'pointer-events-none bg-neutral-200 text-white'
                              }`}
                          >
                            {s('book')}
                            <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                          </Link>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="modal-addons"
                      custom={modalDirection}
                      variants={modalSlideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={MODAL_SPRING}
                    >
                      <BookingAddonsStep
                        addons={addonOptions}
                        selectedIds={selectedAddonIds}
                        onToggle={toggleAddon}
                        currencyLabel={addonCurrencyLabel}
                      />

                      <div className="mt-6 border-t border-neutral-100 pt-4">
                        {selectedAddonsTotal > 0 ? (
                          <div className="mb-4 flex items-end justify-between gap-3">
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-400">
                                {s('totalAddons')}
                              </div>
                              <div className="mt-1 text-[13px] font-medium text-neutral-500">
                                {s('chosenCount', { count: selectedAddonIds.length })}
                              </div>
                            </div>
                            <div className="text-right text-[15px] font-bold tracking-[-0.01em] text-neutral-900">
                              + {addonCurrencyLabel} ${selectedAddonsTotal.toLocaleString(numLocale)}
                            </div>
                          </div>
                        ) : (
                          <p className="mb-4 text-center text-[13px] text-neutral-400">
                            {s('noAddonsHint')}
                          </p>
                        )}

                        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                          <button
                            type="button"
                            onClick={backToCalendar}
                            className="group flex h-12 items-center justify-center gap-1.5 rounded-full border border-neutral-200 px-4 text-[13px] font-semibold text-neutral-500 transition-all duration-300 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 active:scale-[0.98]"
                          >
                            <ChevronLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
                            <span className="hidden sm:inline">{t('backToDate')}</span>
                            <span className="sm:hidden">{t('back')}</span>
                          </button>
                          <Link
                            href={bookingHref}
                            data-analytics-location="package_addons_step"
                            data-item-slug={paquete.slug}
                            className="group flex h-12 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 text-[15px] font-semibold tracking-[-0.01em] text-white transition-all duration-300 hover:bg-neutral-700 active:scale-[0.98]"
                          >
                            {s('book')}
                            <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      ) : null}
      {tooltipInfo.visible && (
        <div
          className="fixed z-50 w-64 rounded-2xl border border-[#D4E6F7] bg-white p-4 shadow-[0_16px_36px_rgba(15,66,116,0.12)]"
          style={{ left: Math.min(tooltipInfo.x, typeof window !== 'undefined' ? window.innerWidth - 280 : 400), top: tooltipInfo.y + 16 }}
          onClick={() => setTooltipInfo({ visible: false, x: 0, y: 0, date: '' })}
        >
          <div className="flex items-start gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <div>
              <p className="text-sm font-semibold text-[#0B2240]">{s('upcomingDaysTitle')}</p>
              <p className="mt-1 text-sm text-[#5A7898]">{t('contactUsShort')}</p>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                data-analytics-location="availability_tooltip"
                data-item-slug={paquete.slug}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#2BB8BF] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#22A9B0]"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
