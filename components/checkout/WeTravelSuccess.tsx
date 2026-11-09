'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, RotateCcw, XCircle } from 'lucide-react';
import SuccessConfirmation from './SuccessConfirmation';
import { useWeTravelStatus } from './useWeTravelStatus';

export default function WeTravelSuccess({ intentId }: { intentId: string }) {
  const t = useTranslations('weTravelModal');
  const locale = useLocale();
  const { data, state, error, timedOut, retry } = useWeTravelStatus(intentId, Boolean(intentId));

  if (state === 'confirmed' && data?.reservationCode) {
    const reservation = data.reservation;
    return (
      <SuccessConfirmation
        code={data.reservationCode}
        transactionId={intentId}
        title={reservation?.title || ''}
        date={reservation?.date}
        people={reservation?.people}
        amountTotal={reservation?.amountTotal}
        currency={reservation?.currency}
        extras={reservation?.extras}
        slug={reservation?.slug}
        paymentMethod="wetravel"
      />
    );
  }

  const bad = state === 'failed' || state === 'review';
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-6 py-16 text-center" data-testid="wetravel-tracking">
      <div role="status" aria-live="polite" className="flex flex-col items-center">
        <span className={`flex h-16 w-16 items-center justify-center rounded-full ${state === 'failed' ? 'bg-red-50 text-red-500' : state === 'review' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'}`}>
          {state === 'failed' ? <XCircle className="h-8 w-8" strokeWidth={1.75} /> : state === 'review' ? <AlertTriangle className="h-8 w-8" strokeWidth={1.75} /> : <Loader2 className="h-8 w-8 animate-spin" strokeWidth={1.75} />}
        </span>
        <h1 className="mt-6 text-balance text-2xl font-semibold tracking-tight text-slate-900">{t(`${state === 'confirmed' ? 'processing' : state}Title`)}</h1>
        <p className="mt-3 text-balance text-sm leading-relaxed text-slate-500">{t(`${state === 'confirmed' ? 'processing' : state}Description`)}</p>
        {!bad && (error || timedOut) ? <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{timedOut ? t('timeout') : t('connectionError')}</p> : null}
      </div>
      <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
        {!bad && (error || timedOut) ? (
          <button type="button" onClick={retry} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RotateCcw className="h-4 w-4" /> {t('checkAgain')}
          </button>
        ) : null}
        <Link href={`/${locale}`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-700">{t('backHome')}</Link>
      </div>
    </div>
  );
}
