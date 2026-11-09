'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Baby, Calendar, ChevronRight, CreditCard, Loader2, Lock, Mail, ReceiptText, ShieldCheck, TicketPlus, User, Users } from 'lucide-react';
import type { Experience } from '@/components/landing-reserva/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArgentineDateInput } from '@/components/ui/argentine-date-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NationalitySelect } from '@/components/ui/nationality-select';
import { PhoneWithPrefixInput } from '@/components/ui/phone-with-prefix-input';
import { Textarea } from '@/components/ui/textarea';
import { applyPhonePrefix, getCountryDialCode } from '@/lib/countries';
import { buildLeadTimeMessage, getMinLeadHours, isDateBookable } from '@/lib/packages/booking-rules';
import type { PeopleBreakdown } from '@/lib/packages/people-categories';
import { useTranslations } from 'next-intl';
import WeTravelPaymentModal from './WeTravelPaymentModal';
import { parseWeTravelTrackingSession, type WeTravelTrackingSession } from '@/lib/wetravel-tracking';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const NAME_MIN_LENGTH = 2;
const PHONE_MIN_DIGITS = 8;
const CHECKOUT_STORAGE_PREFIX = 'checkout_form_v2_';

type CheckoutPricing = {
  unitAmountAdults: number;
  unitAmountMinors: number;
  baseSubtotalAmount: number;
  extrasTotalAmount: number;
  subtotalAmount: number;
  currency: string;
};

type CheckoutClientProps = {
  experience: Experience;
  date: string;
  people: number;
  pax?: PeopleBreakdown;
  pricing?: CheckoutPricing;
  initialError?: string | null;
  selectedAddons?: Array<{ id: string; title: string; amount: number }>;
};

type CheckoutStep = 'form' | 'payment';
type PaymentMethod = 'mercadopago' | 'wetravel';

function paymentMethodForCountry(countryName: string): PaymentMethod | null {
  const normalized = countryName.trim().toLocaleLowerCase('es');
  if (!normalized) return null;
  return normalized === 'argentina' ? 'mercadopago' : 'wetravel';
}

type CheckoutFormState = {
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerCountry: string;
  customerPhone: string;
  customerDocument: string;
  customerBirthDate: string;
  customerAge: string;
  customerHotel: string;
  customerComments: string;
};

type TravelerFormState = {
  nationality: string;
  diet: string;
  firstName: string;
  lastName: string;
  age: string;
  birthDate: string;
  phone: string;
  document: string;
};

const EMPTY_TRAVELER: TravelerFormState = {
  nationality: '',
  diet: '',
  firstName: '',
  lastName: '',
  age: '',
  birthDate: '',
  phone: '',
  document: '',
};

const PEOPLE_CATEGORY_LABELS: Record<string, string> = {
  adults: 'Adultos',
  minors: 'Menores',
  children: 'Niños',
};

const PEOPLE_CATEGORY_ICONS: Record<string, typeof User> = {
  adults: User,
  minors: Baby,
  children: Baby,
};

function getSiteUrl() {
  return typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL ?? '';
}

function getCheckoutStorageKey(slug: string, date: string, people: number) {
  return `${CHECKOUT_STORAGE_PREFIX}${slug}_${date}_${people}`;
}

function countPhoneDigits(value: string) {
  return String(value ?? '').replace(/\D+/g, '').length;
}

function formatMoney(amount: number, currency: string) {
  const normalized = (currency || 'ars').toUpperCase();
  const locale = normalized === 'USD' ? 'en-US' : normalized === 'BRL' ? 'pt-BR' : 'es-AR';
  const symbol = normalized === 'USD' ? 'US$' : normalized === 'BRL' ? 'R$' : '$';
  return `${symbol} ${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export default function CheckoutClient({ experience, date, people, pax, pricing, initialError, selectedAddons }: CheckoutClientProps) {
  const t = useTranslations('checkout');
  const travelerCount = Math.max(1, people);
  const storageKey = getCheckoutStorageKey(experience.slug, date, travelerCount);
  const [step, setStep] = useState<CheckoutStep>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [passengers, setPassengers] = useState<TravelerFormState[]>([]);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [weTravelSession, setWeTravelSession] = useState<WeTravelTrackingSession | null>(null);
  const [trackingRestored, setTrackingRestored] = useState(false);
  const [weTravelModalOpen, setWeTravelModalOpen] = useState(false);
  const trackingStorageKey = `wetravel_tracking_v1_${JSON.stringify([experience.slug, date, travelerCount, pax ?? {}, (selectedAddons ?? []).map(addon => addon.id).sort()])}`;

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(trackingStorageKey);
      const restoredSession = raw ? parseWeTravelTrackingSession(JSON.parse(raw)) : null;
      setWeTravelSession(restoredSession);
      setWeTravelModalOpen(Boolean(restoredSession));
    } catch { /* Storage may be unavailable in private browsing. */ }
    setTrackingRestored(true);
  }, [trackingStorageKey]);
  const [touched, setTouched] = useState({
    firstName: false,
    lastName: false,
    email: false,
    country: false,
    phone: false,
    document: false,
    birthDate: false,
  });
  const [form, setForm] = useState<CheckoutFormState>({
    customerFirstName: '',
    customerLastName: '',
    customerEmail: '',
    customerCountry: '',
    customerPhone: '',
    customerDocument: '',
    customerBirthDate: '',
    customerAge: '',
    customerHotel: '',
    customerComments: '',
  });

  const bookingConfig = experience.bookingConfig as any;
  const currency = pricing?.currency ?? (bookingConfig?.currency === 'usd' || bookingConfig?.currency === 'brl' ? bookingConfig.currency : 'ars');
  const total = pricing?.subtotalAmount ?? 0;
  const extrasTotalAmount = pricing?.extrasTotalAmount ?? 0;
  const baseSubtotalAmount = Math.max(0, pricing?.baseSubtotalAmount ?? total - extrasTotalAmount);
  const showPriceBreakdown = total > 0;
  const dateLabel =
    date && date !== 'sin-fecha'
      ? new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
      : 'A coordinar';

  const checkoutExtras = useMemo(() => {
    const items: Array<{ id: string; label: string; amount: number }> = [];
    if (Array.isArray(selectedAddons)) {
      for (const addon of selectedAddons) {
        const amount = Math.max(0, Math.round(Number((addon as any)?.amount ?? 0) || 0));
        const id = String((addon as any)?.id ?? '').trim();
        const label = String((addon as any)?.title ?? '').trim();
        if (!label || amount <= 0) continue;
        items.push({ id, label, amount });
      }
    }
    return { items };
  }, [selectedAddons]);

  const paxSummary = useMemo(
    () =>
      Object.entries(pax ?? {})
        .filter(([, value]) => Number(value) > 0)
        .map(([key, value]) => ({ key, label: PEOPLE_CATEGORY_LABELS[key] ?? key, value: Number(value) })),
    [pax]
  );

  const steps = useMemo(
    () => [
      { id: 'form' as const, title: t('yourData'), icon: User },
      { id: 'payment' as const, title: t('payment'), icon: CreditCard },
    ],
    [t]
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CheckoutFormState>;
        setForm((prev) => ({
          ...prev,
          ...(parsed.customerFirstName != null && { customerFirstName: String(parsed.customerFirstName) }),
          ...(parsed.customerLastName != null && { customerLastName: String(parsed.customerLastName) }),
          ...(parsed.customerEmail != null && { customerEmail: String(parsed.customerEmail) }),
          ...(parsed.customerCountry != null && { customerCountry: String(parsed.customerCountry) }),
          ...(parsed.customerPhone != null && { customerPhone: String(parsed.customerPhone) }),
          ...(parsed.customerDocument != null && { customerDocument: String(parsed.customerDocument) }),
          ...(parsed.customerBirthDate != null && { customerBirthDate: String(parsed.customerBirthDate) }),
          ...(parsed.customerAge != null && { customerAge: String(parsed.customerAge) }),
          ...(parsed.customerHotel != null && { customerHotel: String(parsed.customerHotel) }),
          ...(parsed.customerComments != null && { customerComments: String(parsed.customerComments) }),
        }));
      }
    } catch {
      // ignore invalid JSON
    }
    setRestored(true);
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    setForm((prev) => {
      const dial = getCountryDialCode(prev.customerCountry);
      if (!dial) return prev;
      const nextPhone = applyPhonePrefix(prev.customerPhone, dial);
      return nextPhone === prev.customerPhone ? prev : { ...prev, customerPhone: nextPhone };
    });
  }, [restored]);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(form));
    } catch {
      // ignore private mode / quota
    }
  }, [form, restored, storageKey]);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('ref') || url.searchParams.get('referral') || url.searchParams.get('code');
      const stored = code && code.trim() ? '' : sessionStorage.getItem('referral_code') || '';
      const resolved = (code && code.trim()) || stored.trim();
      if (code && code.trim()) sessionStorage.setItem('referral_code', code.trim());
      setReferralCode(resolved || null);
    } catch {
      setReferralCode(null);
    }
  }, []);

  useEffect(() => {
    const needed = Math.max(0, travelerCount - 1);
    setPassengers((prev) => {
      if (prev.length === needed) return prev;
      return Array.from({ length: needed }, (_, index) => prev[index] ?? { ...EMPTY_TRAVELER });
    });
  }, [travelerCount]);

  const bookingLeadHours = getMinLeadHours(bookingConfig);
  const [renderedAt] = useState(() => Date.now());
  const bookingBaseDate = useMemo(() => new Date(renderedAt), [renderedAt]);
  const dateTooSoon = Boolean(date && date !== 'sin-fecha') && !isDateBookable(date, bookingLeadHours, bookingBaseDate);
  const leadTimeNotice = bookingLeadHours > 0 ? buildLeadTimeMessage(bookingLeadHours) : '';

  // Un error que viene del servidor (ej: fecha que cayó del plazo entre la excursión y el checkout)
  // bloquea el pago y se muestra con link para volver a elegir fecha.
  const blockedError = dateTooSoon ? initialError : null;
  const selectedDialCode = getCountryDialCode(form.customerCountry);
  const countryPaymentMethod = paymentMethodForCountry(form.customerCountry);

  const handleNationalityChange = (countryName: string) => {
    const nextPaymentMethod = paymentMethodForCountry(countryName);
    setForm((prev) => ({
      ...prev,
      customerCountry: countryName,
      customerPhone: applyPhonePrefix(prev.customerPhone, getCountryDialCode(countryName)),
    }));
    setPaymentMethod(nextPaymentMethod);
  };

  const firstNameError = touched.firstName && form.customerFirstName.trim().length < NAME_MIN_LENGTH;
  const lastNameError = touched.lastName && form.customerLastName.trim().length < NAME_MIN_LENGTH;
  const emailError = touched.email && (!form.customerEmail.trim() || !EMAIL_REGEX.test(form.customerEmail.trim()));
  const countryError = touched.country && !form.customerCountry.trim();
  const phoneError = touched.phone && countPhoneDigits(form.customerPhone) < PHONE_MIN_DIGITS;
  const documentError = touched.document && !form.customerDocument.trim();
  const birthDateError = touched.birthDate && !DATE_REGEX.test(form.customerBirthDate.trim());
  const [passengersTouched, setPassengersTouched] = useState(false);

  const passengerErrors = useMemo(
    () =>
      passengers.map((traveler) => ({
        firstName: traveler.firstName.trim().length < NAME_MIN_LENGTH,
        lastName: traveler.lastName.trim().length < NAME_MIN_LENGTH,
        age: !Number.isFinite(Number(traveler.age)) || Number(traveler.age) < 0 || Number(traveler.age) > 120 || !traveler.age.trim(),
        birthDate: !DATE_REGEX.test(traveler.birthDate.trim()),
        phone: countPhoneDigits(traveler.phone) < PHONE_MIN_DIGITS,
        document: !traveler.document.trim(),
      })),
    [passengers]
  );

  const passengersValid = passengerErrors.every(
    (item) => !item.firstName && !item.lastName && !item.age && !item.birthDate && !item.phone && !item.document
  );

  const updatePassenger = (index: number, patch: Partial<TravelerFormState>) => {
    setPassengers((current) => current.map((traveler, i) => (i === index ? { ...traveler, ...patch } : traveler)));
  };

  const handleSubmitForm = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      country: true,
      phone: true,
      document: true,
      birthDate: true,
    });

    if (form.customerFirstName.trim().length < NAME_MIN_LENGTH) {
      setError(t('firstName'));
      return;
    }
    if (form.customerLastName.trim().length < NAME_MIN_LENGTH) {
      setError(t('lastName'));
      return;
    }
    if (!EMAIL_REGEX.test(form.customerEmail.trim())) {
      setError(t('invalidEmail'));
      return;
    }
    if (!form.customerCountry.trim() || !countryPaymentMethod) {
      setError(t('selectCountryError'));
      setTouched((prev) => ({ ...prev, country: true }));
      return;
    }
    if (form.customerPhone.trim().length < PHONE_MIN_DIGITS || countPhoneDigits(form.customerPhone) < PHONE_MIN_DIGITS) {
      setError(t('invalidPhone'));
      return;
    }
    if (dateTooSoon) {
      setError(
        leadTimeNotice ||
        'La fecha elegida no cumple la anticipación mínima de reserva. Volvé atrás y elegí otra fecha.'
      );
      return;
    }
    if (!form.customerDocument.trim()) {
      setError(t('requiredField'));
      return;
    }
    if (!DATE_REGEX.test(form.customerBirthDate.trim())) {
      setError(t('invalidDate'));
      return;
    }
    if (!passengersValid) {
      setPassengersTouched(true);
      setError('Completá los datos de todos los pasajeros.');
      return;
    }

    setError(null);
    setPaymentMethod(countryPaymentMethod);
    setStep('payment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const createPaymentPreference = async (method: PaymentMethod = paymentMethod ?? countryPaymentMethod ?? 'mercadopago') => {
    if (isLoading || !trackingRestored) return;
    if (method === 'wetravel' && weTravelSession) {
      setWeTravelModalOpen(true);
      return;
    }
    if (weTravelSession) return;
    if (blockedError) {
      setError(blockedError);
      return;
    }
    setError(null);
    setIsLoading(true);
    if (method === 'wetravel') setWeTravelModalOpen(true);

    try {
      const baseUrl = getSiteUrl();
      const addonIds = Array.isArray(selectedAddons)
        ? selectedAddons.map((addon) => String((addon as any)?.id ?? '').trim()).filter(Boolean)
        : [];
      const passengerDetails = passengers.map((traveler) => {
        const age = Math.max(0, Math.min(120, Number(traveler.age) || 0));
        return {
          firstName: traveler.firstName.trim(),
          lastName: traveler.lastName.trim(),
          age,
          birthDate: traveler.birthDate.trim(),
          phone: traveler.phone.trim(),
          document: traveler.document.trim(),
          nationality: traveler.nationality.trim(),
          diet: traveler.diet.trim(),
          travelerType: age < 18 ? 'minor' : 'adult',
        };
      });
      const response = await fetch('/api/mercadopago/preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: experience.slug,
          packageId: experience.id,
          date,
          people: travelerCount,
          ...(pax ? { peopleBreakdown: pax } : {}),
          ...(addonIds.length ? { addonIds } : {}),
          ...(passengerDetails.length ? { passengerDetails } : {}),
          customerEmail: form.customerEmail.trim(),
          customerName: `${form.customerFirstName.trim()} ${form.customerLastName.trim()}`.trim(),
          customerCountry: form.customerCountry.trim() || undefined,
          customerPhone: form.customerPhone.trim() || undefined,
          customerDocument: form.customerDocument.trim() || undefined,
          customerBirthDate: form.customerBirthDate.trim() || undefined,
          ...(form.customerAge.trim() ? { customerAge: Number(form.customerAge) } : {}),
          customerHotel: form.customerHotel.trim() || undefined,
          customerComments: form.customerComments.trim() || undefined,
          successUrl: `${baseUrl}/checkout/success?slug=${encodeURIComponent(experience.slug)}&date=${encodeURIComponent(date)}&people=${encodeURIComponent(String(travelerCount))}`,
          failureUrl: `${baseUrl}/checkout/cancel?slug=${encodeURIComponent(experience.slug)}`,
          pendingUrl: `${baseUrl}/checkout/success?slug=${encodeURIComponent(experience.slug)}&date=${encodeURIComponent(date)}&people=${encodeURIComponent(String(travelerCount))}`,
          ...(referralCode ? { referralCode } : {}),
          paymentMethod: method,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || t('paymentStartError'));
      }

      const data = (await response.json()) as { url?: string; intentId?: string; provider?: string };
      if (!data.url) {
        throw new Error(t('paymentUrlError'));
      }

      if (method === 'wetravel') {
        const session = parseWeTravelTrackingSession(data);
        if (!session || data.provider !== 'wetravel') throw new Error(t('paymentUrlError'));
        setWeTravelSession(session);
        try { sessionStorage.setItem(trackingStorageKey, JSON.stringify(session)); } catch { /* Keep tracking in memory. */ }
        setWeTravelModalOpen(true);
      } else {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar el pago.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!trackingRestored) return <div className="flex min-h-64 items-center justify-center" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" />{t('checkingPayment')}</div>;

  return (
    <div className="min-h-screen bg-[#F5FAFF] px-4 py-10 md:px-6 lg:px-8">
      {weTravelSession || weTravelModalOpen ? (
        <WeTravelPaymentModal
          open={weTravelModalOpen}
          onOpenChange={setWeTravelModalOpen}
          intentId={weTravelSession?.intentId ?? ''}
          paymentUrl={weTravelSession?.url ?? ''}
          creating={isLoading}
          error={weTravelSession ? null : error}
          onRetry={() => void createPaymentPreference('wetravel')}
          onBack={() => {
            try { sessionStorage.removeItem(trackingStorageKey); } catch { /* Storage is optional. */ }
            setWeTravelModalOpen(false);
            setWeTravelSession(null);
            setStep('form');
          }}
        />
      ) : null}
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Link
            href={`/excursion/${experience.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#D8E7F5] bg-white px-4 py-2 text-sm font-extrabold text-[#112B49] shadow-[0_10px_24px_rgba(17,43,73,0.08)] transition-all hover:-translate-y-0.5 hover:border-[#B7D8EF] hover:bg-[#F8FCFF] hover:text-[#0B7FA5] hover:shadow-[0_14px_30px_rgba(17,43,73,0.12)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a la excursión
          </Link>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#D4E6F7] bg-white p-6 shadow-[0_16px_36px_rgba(15,66,116,0.08)]">
              <div className="flex flex-wrap items-center gap-3">
                {steps.map((item, index) => {
                  const Icon = item.icon;
                  const isActive = step === item.id;
                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      <div
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] ${isActive ? 'bg-[#2BB8BF] text-white' : 'bg-[#EEF6FF] text-[#5A7898]'
                          }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {item.title}
                      </div>
                      {index < steps.length - 1 ? <ChevronRight className="h-4 w-4 text-[#A5BAD1]" /> : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {step === 'form' ? (
                <motion.div
                  key="form-step"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <Card className="rounded-3xl border-[#D4E6F7] shadow-[0_16px_36px_rgba(15,66,116,0.08)]">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-2xl font-black tracking-[-0.02em] text-[#0B2240]">{t('completeYourData')}</CardTitle>
                      <p className="text-sm text-[#5A7898]">{t('reserveDirectly')}</p>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleSubmitForm} className="space-y-5" noValidate>
                        {blockedError ? (
                          <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                            <Calendar className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                              {blockedError}{' '}
                              <Link
                                href={`/excursion/${experience.slug}`}
                                className="underline underline-offset-2 hover:text-red-800"
                              >
                                Volver a la excursión
                              </Link>
                            </span>
                          </div>
                        ) : null}
                        <div className="text-sm font-extrabold uppercase tracking-[0.1em] text-[#0B2240]">
                          Pasajero 1
                        </div>
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="customerFirstName">{t('firstName')} *</Label>
                            <Input
                              id="customerFirstName"
                              value={form.customerFirstName}
                              onChange={(event) => setForm((prev) => ({ ...prev, customerFirstName: event.target.value }))}
                              onBlur={() => setTouched((prev) => ({ ...prev, firstName: true }))}
                              placeholder="Ej: Juan"
                            />
                            {firstNameError ? <p className="text-xs font-semibold text-red-500">{t('minimumTwoCharacters')}</p> : null}
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="customerLastName">{t('lastName')} *</Label>
                            <Input
                              id="customerLastName"
                              value={form.customerLastName}
                              onChange={(event) => setForm((prev) => ({ ...prev, customerLastName: event.target.value }))}
                              onBlur={() => setTouched((prev) => ({ ...prev, lastName: true }))}
                              placeholder="Ej: Garcia"
                            />
                            {lastNameError ? <p className="text-xs font-semibold text-red-500">{t('minimumTwoCharacters')}</p> : null}
                          </div>
                          <div className="col-span-2 space-y-1.5 md:col-span-1">
                            <Label htmlFor="customerEmail">{t('email')} *</Label>
                            <div className="relative">
                              <Input
                                id="customerEmail"
                                type="email"
                                value={form.customerEmail}
                                onChange={(event) => setForm((prev) => ({ ...prev, customerEmail: event.target.value }))}
                                onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                                placeholder="tu@email.com"
                                className="pl-10"
                              />
                              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7C95AE]" />
                            </div>
                            {emailError ? <p className="text-xs font-semibold text-red-500">{t('invalidEmailInline')}</p> : null}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="customerNationality">{t('country')} *</Label>
                            <NationalitySelect
                              id="customerNationality"
                              value={form.customerCountry}
                              onChange={handleNationalityChange}
                              placeholder={t('selectCountry')}
                            />
                            {countryError ? <p className="text-xs font-semibold text-red-500">{t('selectCountryError')}</p> : null}
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="customerPhone">{t('whatsapp')} *</Label>
                            <PhoneWithPrefixInput
                              id="customerPhone"
                              value={form.customerPhone}
                              dialCode={selectedDialCode}
                              onValueChange={(next) => setForm((prev) => ({ ...prev, customerPhone: next }))}
                              onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
                              placeholder="11 ..."
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="customerDocument">{t('document')} *</Label>
                            <Input
                              id="customerDocument"
                              value={form.customerDocument}
                              onChange={(event) => setForm((prev) => ({ ...prev, customerDocument: event.target.value }))}
                              onBlur={() => setTouched((prev) => ({ ...prev, document: true }))}
                              placeholder={t('documentPlaceholder')}
                            />
                            {documentError ? <p className="text-xs font-semibold text-red-500">{t('requiredField')}</p> : null}
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="customerBirthDate">{t('birthDate')} *</Label>
                            <ArgentineDateInput
                              id="customerBirthDate"
                              value={form.customerBirthDate}
                              onChange={(value) => setForm((prev) => ({ ...prev, customerBirthDate: value }))}
                              onBlur={() => setTouched((prev) => ({ ...prev, birthDate: true }))}
                            />
                            {birthDateError ? <p className="text-xs font-semibold text-red-500">{t('invalidDate')}</p> : null}
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="customerAge">{t('age')}</Label>
                            <Input
                              id="customerAge"
                              type="number"
                              min={0}
                              max={120}
                              inputMode="numeric"
                              value={form.customerAge}
                              onChange={(event) => setForm((prev) => ({ ...prev, customerAge: event.target.value }))}
                              placeholder="Ej: 30"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="customerHotel">{t('hotel')}</Label>
                            <Input
                              id="customerHotel"
                              value={form.customerHotel}
                              onChange={(event) => setForm((prev) => ({ ...prev, customerHotel: event.target.value }))}
                              placeholder={t('hotelPlaceholder')}
                            />
                          </div>
                        </div>

                        {passengers.length > 0 ? (
                          <div className="space-y-4 border-t border-[#E3EDF7] pt-4">
                            {passengers.map((traveler, index) => {
                              const errors = passengerErrors[index];
                              const showErrors = passengersTouched;
                              return (
                                <div key={index} className="space-y-3 rounded-2xl border border-[#E3EDF7] bg-[#F8FBFF] p-4">
                                  <div className="text-sm font-extrabold uppercase tracking-[0.1em] text-[#0B2240]">
                                    {t('passenger', { number: index + 2 })}
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                      <Label htmlFor={`passenger-${index}-firstName`}>{t('name')} *</Label>
                                      <Input
                                        id={`passenger-${index}-firstName`}
                                        value={traveler.firstName}
                                        onChange={(event) => updatePassenger(index, { firstName: event.target.value })}
                                        placeholder="Ej: Juan"
                                      />
                                      {showErrors && errors?.firstName ? <p className="text-xs font-semibold text-red-500">{t('minimumCharacters')}</p> : null}
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label htmlFor={`passenger-${index}-lastName`}>{t('lastName')} *</Label>
                                      <Input
                                        id={`passenger-${index}-lastName`}
                                        value={traveler.lastName}
                                        onChange={(event) => updatePassenger(index, { lastName: event.target.value })}
                                        placeholder="Ej: Garcia"
                                      />
                                      {showErrors && errors?.lastName ? <p className="text-xs font-semibold text-red-500">{t('minimumCharacters')}</p> : null}
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label htmlFor={`passenger-${index}-age`}>{t('age')} *</Label>
                                      <Input
                                        id={`passenger-${index}-age`}
                                        type="number"
                                        min={0}
                                        max={120}
                                        value={traveler.age}
                                        onChange={(event) => updatePassenger(index, { age: event.target.value })}
                                        placeholder="Ej: 30"
                                      />
                                      {showErrors && errors?.age ? <p className="text-xs font-semibold text-red-500">{t('invalidAge')}</p> : null}
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label htmlFor={`passenger-${index}-birthDate`}>{t('birthDate')} *</Label>
                                      <ArgentineDateInput
                                        id={`passenger-${index}-birthDate`}
                                        value={traveler.birthDate}
                                        onChange={(value) => updatePassenger(index, { birthDate: value })}
                                      />
                                      {showErrors && errors?.birthDate ? <p className="text-xs font-semibold text-red-500">{t('invalidDate')}</p> : null}
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label htmlFor={`passenger-${index}-phone`}>{t('whatsapp')} *</Label>
                                      <Input
                                        id={`passenger-${index}-phone`}
                                        value={traveler.phone}
                                        onChange={(event) => updatePassenger(index, { phone: event.target.value })}
                                        placeholder="+54 11 ..."
                                      />
                                      {showErrors && errors?.phone ? <p className="text-xs font-semibold text-red-500">{t('invalidPhoneInline')}</p> : null}
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label htmlFor={`passenger-${index}-document`}>{t('document')} *</Label>
                                      <Input
                                        id={`passenger-${index}-document`}
                                        value={traveler.document}
                                        onChange={(event) => updatePassenger(index, { document: event.target.value })}
                                        placeholder={t('documentPlaceholder')}
                                      />
                                      {showErrors && errors?.document ? <p className="text-xs font-semibold text-red-500">{t('requiredField')}</p> : null}
                                    </div>
                                    <div className="space-y-1.5"><Label htmlFor={`passenger-${index}-nationality`}>{t('country')}</Label><NationalitySelect id={`passenger-${index}-nationality`} value={traveler.nationality} onChange={(nationality) => updatePassenger(index, { nationality })} placeholder={t('selectCountry')} /></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        <div className="space-y-1.5">
                          <Label htmlFor="customerComments">{t('comments')}</Label>
                          <Textarea
                            id="customerComments"
                            value={form.customerComments}
                            onChange={(event) => setForm((prev) => ({ ...prev, customerComments: event.target.value }))}
                            placeholder={t('commentsPlaceholder')}
                          />
                        </div>

                        {error ? (
                          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                            {error}
                          </div>
                        ) : null}

                        <Button
                          type="submit"
                          disabled={Boolean(blockedError)}
                          className="h-12 w-full rounded-2xl bg-[#2BB8BF] text-base font-bold hover:bg-[#22A9B0] disabled:cursor-not-allowed disabled:opacity-60 text-white"
                        >
                          {t('continueToPayment')}
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : null}

              {step === 'payment' ? (
                <motion.div
                  key="payment-step"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <Card className="rounded-3xl border-[#D4E6F7] shadow-[0_16px_36px_rgba(15,66,116,0.08)]">
                    <CardHeader className="pb-3 text-center">
                    <CardTitle className="text-2xl font-black tracking-[-0.02em] text-[#0B2240]">{t('finalizeReservation')}</CardTitle>
                      <p className="text-sm text-[#5A7898]">{t('redirectingToPayment')}</p>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <button
                        type="button"
                        onClick={() => void createPaymentPreference()}
                        disabled={isLoading || Boolean(blockedError)}
                        className="flex cursor-pointer w-full items-center justify-between rounded-2xl border border-[#D7E8F7] bg-white px-4 py-3.5 text-left transition hover:shadow-[0_12px_28px_rgba(15,66,116,0.1)] disabled:opacity-60"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-16 items-center justify-center rounded-xl bg-[#E8F4FF] p-1.5">
                            {isLoading ? (
                              <Loader2 className="h-5 w-5 animate-spin text-[#009EE3]" />
                            ) : (
                              <Image
                                src={paymentMethod === 'mercadopago' ? '/images/mercado-pago-logo.png' : '/images/wetravel-logo.png'}
                                alt={paymentMethod === 'mercadopago' ? 'Mercado Pago' : 'WeTravel'}
                                width={56}
                                height={28}
                                className="h-full w-full object-contain"
                              />
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-[#0B2240]">{t('continueToPayment')} · {paymentMethod === 'mercadopago' ? t('mercadoPago') : t('weTravel')}</div>
                          </div>
                        </div>
                        <div className="rounded-full bg-[#009EE3] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                          {t('pay')}
                        </div>
                      </button>

                      {error ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                          {error}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        className="w-full cursor-pointer text-center text-sm font-semibold text-[#5A7898] transition hover:text-[#2BB8BF]"
                        onClick={() => setStep('form')}
                      >
                        <ArrowLeft className="h-4 w-4 inline-block mr-1" />
                        {t('back')}
                      </button>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <aside className="xl:sticky xl:top-8">
            <div className="rounded-3xl border border-[#D4E6F7] bg-white p-6 shadow-[0_16px_36px_rgba(15,66,116,0.08)]">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7C95AE]">{t('reservationSummary')}</div>
              <h2 className="mt-2 text-xl font-black leading-snug tracking-[-0.02em] text-[#0B2240]">{experience.title}</h2>

              <div className="mt-6 space-y-5">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7C95AE]">
                    <Calendar className="h-3.5 w-3.5 text-[#2BB8BF]" />
                    Salida
                  </div>
                  <div className="mt-1.5 text-sm font-bold capitalize text-[#12325D]">{dateLabel}</div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7C95AE]">
                    <Users className="h-3.5 w-3.5 text-[#2BB8BF]" />
                    Pasajeros
                  </div>
                  {paxSummary.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {paxSummary.map((item) => {
                        return (
                          <span
                            key={item.key}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#F8FBFF] px-2.5 py-1 text-xs font-semibold text-[#12325D] ring-1 ring-[#E3EDF7]"
                          >
                            {item.value} {item.label.toLowerCase()}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-1.5 text-sm font-bold text-[#12325D]">
                      {travelerCount} {travelerCount === 1 ? 'pasajero' : 'pasajeros'}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-[#E3EDF7] pt-5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7C95AE]">
                  <ReceiptText className="h-3.5 w-3.5 text-[#2BB8BF]" />
                  Resumen
                </div>

                {showPriceBreakdown ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-[#486887]">
                        Subtotal · {travelerCount} {travelerCount === 1 ? 'pasajero' : 'pasajeros'}
                      </span>
                      <span className="font-semibold tabular-nums text-[#12325D]">
                        {formatMoney(baseSubtotalAmount / 100, currency)}
                      </span>
                    </div>

                    {checkoutExtras.items.length > 0 ? (
                      <div className="space-y-2.5">
                        {checkoutExtras.items.map((item) => (
                          <div key={item.id || item.label} className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex min-w-0 items-center gap-1.5 text-[#486887]">
                              <TicketPlus className="h-3.5 w-3.5 shrink-0 text-[#F5B301]" />
                              <span className="truncate">{item.label}</span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-[#12325D]">
                              {formatMoney((item.amount / 100) * travelerCount, currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="my-4 h-px bg-[#E3EDF7]" />

                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-bold text-[#0B2240]">Total</span>
                      <div className="text-right">
                        <div className="flex items-baseline justify-end gap-1.5">
                          <span className="text-[26px] font-black tabular-nums tracking-[-0.02em] text-[#0B2240]">
                            {formatMoney(total / 100, currency)}
                          </span>
                          <span className="text-xs font-bold uppercase text-[#7C95AE]">{currency}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] font-medium text-[#7C95AE]">{t('finalPrice')}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold text-[#0B2240]">Total</span>
                    <span className="text-[26px] font-black tabular-nums tracking-[-0.02em] text-[#0B2240]">
                      {formatMoney(total / 100, currency)}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center gap-2 rounded-2xl bg-[#F8FBFF] px-3.5 py-3 ring-1 ring-[#E3EDF7] justify-center">
                <Lock className="h-3.5 w-3.5 shrink-0 text-[#2BB8BF]" />
                        <span className="text-[11px] font-semibold text-[#486887]">{t('protectedPayment')}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
