'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { trackPurchaseWhenConsented } from '@/lib/analytics';

type DirectState =
  | { ok: true; reservationId?: string; reservationCode?: string; paymentStatus?: string; amountTotal?: number; currency?: string; emailStatus?: string }
  | { ok: false; message?: string };

/**
 * Verificación del flujo directo (checkout sin carrito): consulta el pago en
 * Mercado Pago vía /api/mercadopago/verify-direct y crea la reserva + los
 * emails si el webhook todavía no lo hizo (caso típico en localhost, donde
 * Mercado Pago no puede llamar al webhook local).
 */
export default function DirectVerification({
  intentId,
  paymentId,
  itemSlug,
  itemName,
  quantity,
}: {
  intentId: string;
  paymentId?: string;
  itemSlug?: string;
  itemName?: string;
  quantity?: number;
}) {
  const t = useTranslations('checkout');
  const [state, setState] = useState<DirectState | null>(null);
  const [checking, setChecking] = useState(true);
  const triedRef = useRef(false);

  useEffect(() => {
    if (!state?.ok || !state.reservationId || state.paymentStatus?.toLowerCase() !== 'approved') return;
    return trackPurchaseWhenConsented({
      transactionId: state.reservationId,
      valueMinor: Number(state.amountTotal ?? 0),
      currency: state.currency || 'ARS',
      itemSlug,
      itemName,
      quantity,
    });
  }, [itemName, itemSlug, quantity, state]);

  useEffect(() => {
    if (!intentId) return;
    if (triedRef.current) return;
    triedRef.current = true;
    let active = true;
    const delays = [0, 4000, 9000, 16000, 26000];
    (async () => {
      for (let i = 0; i < delays.length; i += 1) {
        if (i > 0) await new Promise((r) => setTimeout(r, delays[i] - delays[i - 1]));
        if (!active) return;
        try {
          const res = await fetch('/api/mercadopago/verify-direct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ intentId, paymentId: paymentId || undefined }),
            cache: 'no-store',
          });
          const payload = await res.json().catch(() => null);
          if (!active) return;
          if (res.ok && payload?.ok) {
            setState({
              ok: true,
              reservationId: String(payload.reservationId ?? ''),
              reservationCode: String(payload.reservationCode ?? ''),
              paymentStatus: String(payload.paymentStatus ?? ''),
              amountTotal: Number(payload.amountTotal ?? 0) || 0,
              currency: String(payload.currency ?? 'ARS'),
              emailStatus: String(payload.emailStatus ?? ''),
            });
            setChecking(false);
            return;
          }
          if (i === delays.length - 1) {
            setState({ ok: false, message: String(payload?.error ?? payload?.message ?? 'Pago en verificación') });
            setChecking(false);
          }
        } catch {
          if (i === delays.length - 1 && active) {
            setState({ ok: false, message: 'No pudimos verificar el pago todavía' });
            setChecking(false);
          }
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [intentId, paymentId]);

  if (state?.ok) {
    return (
      <div className="mt-4 space-y-3">
        {state.reservationCode ? (
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('reservationCodeLabel')}
            </p>
            <p className="mt-1 font-mono text-sm text-gray-900">{state.reservationCode}</p>
            <p className="mt-2 text-sm text-gray-600">
              {t('saveCode')}
            </p>
          </div>
        ) : null}
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{t('reservationRegistered')}</p>
            <p className="mt-1 text-emerald-700">
              {state.emailStatus === 'sent'
                ? t('emailSent')
                : t('emailQueued')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
        <div>
          <p className="font-semibold text-gray-800">{t('confirmingPayment')}</p>
          <p className="mt-1">{t('registeringReservation')}</p>
        </div>
      </div>
    );
  }

  if (state && !state.ok) {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {state.message === t('paymentInVerification') || !state.message ? (
          <Clock className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        )}
        <div>
          <p className="font-semibold">{t('paymentVerification')}</p>
          <p className="mt-1 text-amber-700">
            {t('paymentVerificationDescription')}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
