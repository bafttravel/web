'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Navbar from '@/components/Navbar';
import HomeFooter from '@/components/home/HomeFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CONTACT_INFO, SITE_NAME } from '@/lib/constants';

type PublicReservation = {
  code: string;
  status: string;
  paymentStatus: string;
  paymentStatusLabel?: string;
  commercialStatus?: string;
  commercialStatusLabel?: string;
  operationalStatus?: string;
  operationalStatusLabel?: string;
  voucherStatus?: string;
  customerEmailStatus?: string;
  publicState?: { tone: 'success' | 'pending' | 'warning' | 'error'; title: string; description: string };
  packageTitle: string;
  departureDate: string;
  people: number;
  selectedSeats: string[] | null;
  selectedExtras: Array<{ code: string; label: string; amount: number }>;
  amountTotal: number;
  currency: string;
  customerMasked: { name: string; email: string };
  orderId: string | null;
  createdAt: any;
};

function formatCurrency(amount: number, currency: string) {
  const value = (amount || 0) / 100;
  const c = String(currency || 'ARS').toUpperCase();
  if (c === 'ARS') return `$${value.toLocaleString('es-AR')}`;
  if (c === 'BRL') return `R$ ${value.toLocaleString('pt-BR')}`;
  return `${value.toFixed(2)} ${c}`;
}

function formatDateLabel(date: string, locale: string, fallback: string) {
  if (!date || date === 'sin-fecha') return fallback;
  try {
    return new Date(`${date}T12:00:00`).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return date;
  }
}

export default function ConsultarReservaClient({ initialCode }: { initialCode: string }) {
  const t = useTranslations('public');
  const locale = useLocale();
  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState('');
  const [document, setDocument] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<PublicReservation | null>(null);

  const canSubmit = useMemo(() => {
    const hasIdentity = email.trim().length > 0 || document.trim().length > 0;
    return code.trim().length > 0 && hasIdentity && !loading;
  }, [code, email, document, loading]);

  const submit = async () => {
    setError(null);
    setReservation(null);
    setLoading(true);
    try {
      const res = await fetch('/api/reservas/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(document.trim() ? { document: document.trim() } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(t('lookupError'));
        return;
      }
      setReservation(json.reservation as PublicReservation);
    } catch {
      setError(t('lookupError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <Navbar variant="homeMockup" reserveSpace />

      <main className="container mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t('lookupTitle')}</h1>
          <p className="text-sm text-gray-600">{t('lookupDescription')}</p>
        </div>

        <Card className="bg-white/90 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-gray-900">{t('lookupData')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>{t('reservationCodeOrNumber')}</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej: 000001" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('optionalEmail')}</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tuemail@mail.com" />
              </div>
              <div className="space-y-1">
                <Label>{t('optionalDocument')}</Label>
                <Input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="Solo números" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCode('');
                  setEmail('');
                  setDocument('');
                  setReservation(null);
                  setError(null);
                }}
                disabled={loading}
              >
                {t('clear')}
              </Button>
              <Button onClick={() => void submit()} disabled={!canSubmit}>
                {loading ? t('searching') : t('consult')}
              </Button>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {reservation ? (
          <Card className="mt-6 bg-white/90 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-gray-900">{t('reservationDetail')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const msg = reservation.publicState ?? {
                  tone: 'pending' as const,
                  title: 'Estado en proceso',
                  description: 'Estamos verificando tu operación. Si necesitás ayuda, contactanos.',
                };
                const tone =
                  msg.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : msg.tone === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : msg.tone === 'error'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-gray-200 bg-gray-50 text-gray-700';
                return (
                  <div className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>
                    <div className="font-semibold">{msg.title}</div>
                    <div className="mt-1">{msg.description}</div>
                  </div>
                );
              })()}

              <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t('reservationCode')}</div>
                  <div className="mt-1 font-mono font-semibold text-gray-900">{reservation.code}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t('holder')}</div>
                  <div className="mt-1 font-semibold text-gray-900">{reservation.customerMasked.name}</div>
                  <div className="text-xs text-gray-600">{reservation.customerMasked.email}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t('excursion')}</div>
                  <div className="mt-1 font-semibold text-gray-900">{reservation.packageTitle}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t('departure')}</div>
                  <div className="mt-1 font-semibold text-gray-900">{formatDateLabel(reservation.departureDate, locale, t('dateToCoordinate'))}</div>
                  <div className="text-xs text-gray-600">{reservation.people} pasajero(s)</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t('payment')}</div>
                  <div className="mt-1 font-semibold text-gray-900">{reservation.paymentStatusLabel || reservation.paymentStatus}</div>
                  <div className="text-xs text-gray-600">{formatCurrency(reservation.amountTotal, reservation.currency)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t('extras')}</div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {reservation.selectedExtras.length
                      ? reservation.selectedExtras.map((extra) => extra.label).join(', ')
                      : t('withoutExtras')}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t('sale')}</div>
                  <div className="mt-1 font-semibold text-gray-900">{reservation.commercialStatusLabel || reservation.status}</div>
                  <div className="text-xs text-gray-600">{reservation.operationalStatusLabel || '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t('communication')}</div>
                  <div className="mt-1 font-semibold text-gray-900">{reservation.voucherStatus || '—'}</div>
                  <div className="text-xs text-gray-600">{t('customerEmail')}: {reservation.customerEmailStatus || '—'}</div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('antiScamNotice')}</div>
                <div className="mt-2">{t('officialChannelsNotice', { siteName: SITE_NAME })}</div>
                <div className="mt-2 text-sm text-gray-900">
                  {t('officialContact')}: {CONTACT_INFO.email && <><span className="font-semibold">{CONTACT_INFO.email}</span> ·{' '}</>}
                  <span className="font-semibold">{CONTACT_INFO.telefono}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </main>

      <HomeFooter />
    </div>
  );
}
