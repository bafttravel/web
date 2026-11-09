'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_SESSION_DENIAL_KEY,
  CLARITY_PROJECT_ID,
  OPEN_COOKIE_SETTINGS_EVENT,
  initializeGoogleTagManager,
  isProductionAnalyticsDomain,
  isAnalyticsExcludedPath,
  isCheckoutHref,
  isCheckoutPath,
  isClarityExcludedPath,
  isWhatsAppHref,
  pushAnalyticsEvent,
  readAnalyticsConsent,
  saveAnalyticsConsent,
} from '@/lib/analytics';

type Copy = {
  title: string;
  description: string;
  details: string;
  accept: string;
  reject: string;
  configure: string;
  settingsTitle: string;
  necessaryTitle: string;
  necessaryDescription: string;
  analyticsTitle: string;
  analyticsDescription: string;
  save: string;
  cancel: string;
  privacy: string;
};

const COPY: Record<'es' | 'en', Copy> = {
  es: {
    title: 'Tu privacidad importa',
    description: 'Usamos cookies necesarias para que el sitio funcione. Si lo aceptás, también usamos analíticas para entender y mejorar la experiencia.',
    details: 'Las analíticas incluyen Google Analytics 4 y Microsoft Clarity. No activaremos estas herramientas hasta que nos des permiso.',
    accept: 'Aceptar analíticas',
    reject: 'Rechazar',
    configure: 'Configurar',
    settingsTitle: 'Preferencias de cookies',
    necessaryTitle: 'Necesarias',
    necessaryDescription: 'Permiten funciones esenciales del sitio y siempre están activas.',
    analyticsTitle: 'Analíticas',
    analyticsDescription: 'Permiten medir visitas y uso del sitio con Google Analytics 4 y Microsoft Clarity.',
    save: 'Guardar preferencias',
    cancel: 'Cancelar',
    privacy: 'Privacidad y cookies',
  },
  en: {
    title: 'Your privacy matters',
    description: 'We use necessary cookies to make the site work. If you agree, we also use analytics to understand and improve your experience.',
    details: 'Analytics includes Google Analytics 4 and Microsoft Clarity. These tools will stay off until you allow them.',
    accept: 'Accept analytics',
    reject: 'Reject',
    configure: 'Settings',
    settingsTitle: 'Cookie preferences',
    necessaryTitle: 'Necessary',
    necessaryDescription: 'These support essential site features and are always active.',
    analyticsTitle: 'Analytics',
    analyticsDescription: 'Measures site visits and usage with Google Analytics 4 and Microsoft Clarity.',
    save: 'Save preferences',
    cancel: 'Cancel',
    privacy: 'Privacy and cookies',
  },
};

function initializeClarity() {
  if (!isProductionAnalyticsDomain()) return;
  if (window.__baftClarityLoaded) {
    window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
    return;
  }

  const clarity = window.clarity || Object.assign(
    (...args: unknown[]) => {
      const queuedClarity = window.clarity;
      if (!queuedClarity) return;
      queuedClarity.q = queuedClarity.q || [];
      queuedClarity.q.push(args);
    },
    { q: [] as unknown[][] }
  );
  window.clarity = clarity;
  clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });

  if (!document.getElementById('baft-microsoft-clarity')) {
    const script = document.createElement('script');
    script.id = 'baft-microsoft-clarity';
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
    document.head.appendChild(script);
  }
  window.__baftClarityLoaded = true;
}

function updateGoogleConsent(analytics: boolean) {
  window.gtag?.('consent', 'update', {
    analytics_storage: analytics ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
}

function updateClarityConsent(analytics: boolean) {
  window.clarity?.('consentv2', {
    ad_Storage: 'denied',
    analytics_Storage: analytics ? 'granted' : 'denied',
  });
}

function suspendClarity() {
  updateClarityConsent(false);
  window.clarity?.('consent', false);
}

function clearAnalyticsCookies() {
  if (typeof document === 'undefined') return;
  const names = document.cookie
    .split(';')
    .map((part) => part.trim().split('=')[0])
    .filter((name) => /^(_ga(?:_|$)|_gid$|_gat(?:_|$)|_clck$|_clsk$)/i.test(name));
  const hostname = window.location.hostname;
  const domainParts = hostname.split('.');
  const domains = new Set<string | null>([null, hostname, `.${hostname}`]);
  if (domainParts.length > 2) {
    const parentDomain = `.${domainParts.slice(-2).join('.')}`;
    domains.add(parentDomain);
  }

  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
    }
  }
}

function isCurrentPageTrackable(pathname: string) {
  return !isAnalyticsExcludedPath(pathname) && isProductionAnalyticsDomain();
}

function subscribeToConsent(onChange: () => void) {
  window.addEventListener(ANALYTICS_CONSENT_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getConsentSnapshot() {
  try {
    if (window.sessionStorage.getItem(ANALYTICS_SESSION_DENIAL_KEY) === '1') return 'denied-for-tab';
    return window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
  } catch {
    return null;
  }
}

function getServerConsentSnapshot() {
  return null;
}

export default function AnalyticsConsentManager() {
  const pathname = usePathname() || '/';
  const locale = useLocale();
  const copy = COPY[locale === 'en' ? 'en' : 'es'];
  const consentSnapshot = useSyncExternalStore(subscribeToConsent, getConsentSnapshot, getServerConsentSnapshot);
  const consent = consentSnapshot ? readAnalyticsConsent() : null;
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const privatePath = isClarityExcludedPath(pathname);

  useEffect(() => {
    const openPreferences = () => {
      setAnalyticsEnabled(readAnalyticsConsent()?.analytics ?? false);
      setPreferencesOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openPreferences);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openPreferences);
  }, []);

  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return;
    if (privatePath) main.setAttribute('data-clarity-mask', 'true');
    else main.removeAttribute('data-clarity-mask');
  }, [privatePath]);

  useEffect(() => {
    if (!consent?.analytics || !isProductionAnalyticsDomain()) return;

    if (!isAnalyticsExcludedPath(pathname)) initializeGoogleTagManager();
    if (isClarityExcludedPath(pathname)) suspendClarity();
    else initializeClarity();
  }, [consent?.analytics, pathname]);

  useEffect(() => {
    if (!consent?.analytics || !isCurrentPageTrackable(pathname)) return;

    const pageLocation = `${window.location.origin}${pathname}`;
    pushAnalyticsEvent('page_view', { page_path: pathname, page_location: pageLocation });
    if (isCheckoutPath(pathname)) pushAnalyticsEvent('begin_checkout', { page_path: pathname });
  }, [consent?.analytics, pathname]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const linkLocation = anchor.dataset.analyticsLocation || 'content';
      const pagePath = window.location.pathname;
      const itemSlug = anchor.dataset.itemSlug;

      if (isWhatsAppHref(anchor.href)) {
        pushAnalyticsEvent('whatsapp_click', {
          link_location: linkLocation,
          page_path: pagePath,
          ...(itemSlug ? { item_slug: itemSlug } : {}),
        });
      }

      if (isCheckoutHref(anchor.href)) {
        pushAnalyticsEvent('booking_start', {
          link_location: linkLocation,
          page_path: pagePath,
          ...(itemSlug ? { item_slug: itemSlug } : {}),
        });
      }

      try {
        const targetPath = new URL(anchor.href, window.location.href).pathname;
        if (isClarityExcludedPath(targetPath)) {
          document.getElementById('main-content')?.setAttribute('data-clarity-mask', 'true');
          suspendClarity();
        }
      } catch {
        // Ignore malformed/non-navigation links.
      }
    };

    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, []);

  const savePreferences = useCallback((analytics: boolean) => {
    const wasAllowed = consent?.analytics === true;
    const saved = saveAnalyticsConsent(analytics);
    setAnalyticsEnabled(saved.analytics);
    setPreferencesOpen(false);

    if (saved.analytics && isProductionAnalyticsDomain()) {
      if (!isAnalyticsExcludedPath(pathname)) initializeGoogleTagManager();
      if (isClarityExcludedPath(pathname)) suspendClarity();
      else initializeClarity();
    }
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));

    if (wasAllowed && !saved.analytics) {
      suspendClarity();
      updateGoogleConsent(false);
      clearAnalyticsCookies();
      if (saved.persisted) window.location.reload();
    }
  }, [consent?.analytics, pathname]);

  if (isAnalyticsExcludedPath(pathname)) return null;

  return (
    <>
      {!consent ? (
        <section
          aria-label={copy.title}
          className="fixed inset-x-3 bottom-3 z-[1000] mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_16px_60px_rgba(15,23,42,0.24)] sm:inset-x-5 sm:bottom-5 sm:p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">{copy.title}</h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">{copy.description}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{copy.details}</p>
              <Link href={`/${locale}/privacidad`} className="mt-1 inline-block text-xs font-semibold text-blue-800 underline underline-offset-2">
                {copy.privacy}
              </Link>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-48 sm:grid-cols-1">
              <button type="button" onClick={() => savePreferences(false)} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {copy.reject}
              </button>
              <button type="button" onClick={() => { setAnalyticsEnabled(false); setPreferencesOpen(true); }} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {copy.configure}
              </button>
              <button type="button" onClick={() => savePreferences(true)} className="col-span-2 min-h-10 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700 sm:col-span-1">
                {copy.accept}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {preferencesOpen ? (
        <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center sm:p-5" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="cookie-preferences-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <h2 id="cookie-preferences-title" className="text-lg font-bold text-slate-900">{copy.settingsTitle}</h2>
            <p className="mt-2 text-sm leading-5 text-slate-600">{copy.details}</p>
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-semibold text-slate-900">{copy.necessaryTitle}</h3>
                  <span className="text-xs font-semibold text-slate-500">{locale === 'en' ? 'Always on' : 'Siempre activas'}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{copy.necessaryDescription}</p>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
                <input type="checkbox" checked={analyticsEnabled} onChange={(event) => setAnalyticsEnabled(event.target.checked)} className="mt-0.5 h-4 w-4 accent-slate-900" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{copy.analyticsTitle}</span>
                  <span className="mt-1 block text-sm text-slate-600">{copy.analyticsDescription}</span>
                </span>
              </label>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPreferencesOpen(false)} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {copy.cancel}
              </button>
              <button type="button" onClick={() => savePreferences(analyticsEnabled)} className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700">
                {copy.save}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
