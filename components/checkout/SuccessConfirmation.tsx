'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CalendarDays, Check, Copy, CreditCard, Mail, MapPin, Sparkles, Ticket, Users, Wallet } from 'lucide-react';
import { trackPurchaseWhenConsented } from '@/lib/analytics';

export type SuccessConfirmationProps = {
  code?: string | null;
  title: string;
  date?: string | null;
  people?: number | null;
  amountTotal?: number | null;
  currency?: string | null;
  paymentMethod: 'wetravel' | 'mercadopago';
  extras?: string[];
  location?: string;
  slug?: string | null;
  transactionId?: string | null;
};

function formatDate(date: string | null | undefined, locale: string, fallback: string) {
  if (!date || date === 'sin-fecha') return fallback;
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatAmount(amount: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function AnimatedCheck({ size = 96 }: { size?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} aria-hidden="true">
      {!reduce ? (
        <motion.span
          className="absolute inset-0 rounded-full bg-emerald-400/30"
          initial={{ scale: 0.6, opacity: 0.7 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 1.4, delay: 0.35, ease: 'easeOut' }}
        />
      ) : null}
      <motion.div
        className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_18px_40px_-12px_rgba(16,185,129,0.65)]"
        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        <svg viewBox="0 0 52 52" className="h-1/2 w-1/2 text-white" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
          <motion.path
            d="M14 27 L23 36 L39 17"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
          />
        </svg>
      </motion.div>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Ticket; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5 py-4">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
        <div className="mt-1 break-words text-[15px] font-medium first-letter:uppercase text-slate-900">{children}</div>
      </div>
    </div>
  );
}

export default function SuccessConfirmation(props: SuccessConfirmationProps) {
  const t = useTranslations('successPage');
  const locale = useLocale();
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const { code, title, date, people, amountTotal, currency, paymentMethod, extras = [], location, slug, transactionId } = props;

  useEffect(() => {
    if (!transactionId || !amountTotal || !currency) return;
    return trackPurchaseWhenConsented({
      transactionId,
      valueMinor: amountTotal,
      currency,
      itemSlug: slug,
      itemName: title,
      quantity: people,
    });
  }, [amountTotal, currency, people, slug, title, transactionId]);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* Clipboard is optional. */ }
  };

  const item = (i: number) => ({
    initial: reduce ? false : ({ opacity: 0, y: 14 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay: 0.5 + i * 0.07, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-emerald-50/70 via-white to-slate-50">
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="flex flex-col items-center text-center">
          <AnimatedCheck />
          <motion.p {...item(-4)} className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-emerald-100/70 px-3 py-1 text-xs font-semibold text-emerald-800">
            <Sparkles className="h-3.5 w-3.5" /> {t('badge')}
          </motion.p>
          <motion.h1 {...item(-3)} className="mt-4 text-balance text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {t('title')}
          </motion.h1>
          <motion.p {...item(-2)} className="mt-3 max-w-md text-balance text-base text-slate-500">
            {t('subtitle')}
          </motion.p>
        </div>

        <motion.div {...item(0)} className="mt-10 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.25)]">
          {code ? (
            <div className="flex items-center justify-between gap-4 border-b border-dashed border-slate-200 bg-slate-50/70 px-5 py-5 sm:px-7">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{t('code')}</p>
                <p className="mt-1 break-all font-mono text-xl font-semibold tracking-wide text-slate-900 sm:text-2xl">{code}</p>
              </div>
              <button
                type="button"
                onClick={copy}
                aria-label={t('copy')}
                className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                <span className="hidden sm:inline">{copied ? t('copied') : t('copy')}</span>
              </button>
            </div>
          ) : null}

          <div className="divide-y divide-slate-100 px-5 sm:px-7">
            <Row icon={Ticket} label={t('activity')}>{title}</Row>
            <Row icon={CalendarDays} label={t('date')}>{formatDate(date, locale, t('dateTbd'))}</Row>
            {typeof people === 'number' && people > 0 ? (
              <Row icon={Users} label={t('travelers')}>{t('travelersCount', { count: people })}</Row>
            ) : null}
            {location ? <Row icon={MapPin} label={t('location')}>{location}</Row> : null}
            {extras.length > 0 ? <Row icon={Sparkles} label={t('extras')}>{extras.join(', ')}</Row> : null}
            {typeof amountTotal === 'number' && amountTotal > 0 && currency ? (
              <Row icon={Wallet} label={t('total')}>
                <span className="text-lg font-semibold">{formatAmount(amountTotal, currency, locale)}</span>
              </Row>
            ) : null}
            <Row icon={CreditCard} label={t('paymentStatus')}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t('paid')}
              </span>
            </Row>
            <Row icon={CreditCard} label={t('paymentMethod')}>{paymentMethod === 'wetravel' ? 'WeTravel' : 'Mercado Pago'}</Row>
          </div>
        </motion.div>

        <motion.div {...item(1)} className="mt-5 flex items-start gap-3.5 rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-4 text-left">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <Mail className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-slate-900">{t('nextTitle')}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{t('nextBody')}</p>
          </div>
        </motion.div>

        <motion.div {...item(2)} className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={`/${locale}`} className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-slate-900 px-7 text-sm font-semibold text-white transition hover:bg-slate-700 active:scale-[0.98]">
            {t('backHome')}
          </Link>
          {slug ? (
            <Link href={`/excursion/${slug}`} className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-7 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]">
              {t('viewExcursion')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
