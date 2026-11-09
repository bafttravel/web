export const ANALYTICS_CONSENT_KEY = 'baft.analytics-consent.v1';
export const ANALYTICS_SESSION_DENIAL_KEY = 'baft.analytics-denied-this-tab';
export const ANALYTICS_CONSENT_EVENT = 'baft:analytics-consent-changed';
export const OPEN_COOKIE_SETTINGS_EVENT = 'baft:open-cookie-settings';

export const GTM_CONTAINER_ID = 'GTM-5VXXFZ8J';
export const GA4_MEASUREMENT_ID = 'G-Z09FPGMT1D';
export const CLARITY_PROJECT_ID = 'zb406n8sbe';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
    __baftGtmLoaded?: boolean;
    __baftClarityLoaded?: boolean;
  }
}

type StoredAnalyticsConsent = {
  version: 1;
  analytics: boolean;
  savedAt: number;
};

type ConsentSaveResult = StoredAnalyticsConsent & { persisted: boolean };

const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export function readAnalyticsConsent(): StoredAnalyticsConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    if (window.sessionStorage.getItem(ANALYTICS_SESSION_DENIAL_KEY) === '1') return null;
    const raw = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    if (!raw) return null;
    const consent = JSON.parse(raw) as Partial<StoredAnalyticsConsent>;
    if (
      consent.version !== 1 ||
      typeof consent.analytics !== 'boolean' ||
      typeof consent.savedAt !== 'number' ||
      Date.now() - consent.savedAt > CONSENT_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(ANALYTICS_CONSENT_KEY);
      return null;
    }
    return consent as StoredAnalyticsConsent;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return readAnalyticsConsent()?.analytics === true;
}

export function isProductionAnalyticsDomain() {
  return typeof window !== 'undefined' && /(^|\.)baftravel\.com$/i.test(window.location.hostname);
}

export function initializeGoogleTagManager() {
  if (window.__baftGtmLoaded || !isProductionAnalyticsDomain() || !hasAnalyticsConsent()) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer?.push(arguments);
  };
  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('consent', 'update', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.dataLayer.push({
    'gtm.start': Date.now(),
    event: 'gtm.js',
    baft_ga4_measurement_id: GA4_MEASUREMENT_ID,
  });

  if (!document.getElementById('baft-google-tag-manager')) {
    const script = document.createElement('script');
    script.id = 'baft-google-tag-manager';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`;
    document.head.appendChild(script);
  }
  window.__baftGtmLoaded = true;
}

export function saveAnalyticsConsent(analytics: boolean): ConsentSaveResult {
  const consent: StoredAnalyticsConsent = { version: 1, analytics, savedAt: Date.now() };
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify(consent));
    window.sessionStorage.removeItem(ANALYTICS_SESSION_DENIAL_KEY);
  } catch {
    // If consent cannot be persisted, do not enable optional tracking.
    try {
      window.localStorage.removeItem(ANALYTICS_CONSENT_KEY);
      window.sessionStorage.setItem(ANALYTICS_SESSION_DENIAL_KEY, '1');
    } catch {
      // Keep the current page untracked if storage is unavailable.
    }
    return { ...consent, analytics: false, persisted: false };
  }
  return { ...consent, persisted: true };
}

export function pushAnalyticsEvent(name: string, parameters: Record<string, unknown> = {}): boolean {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return false;
  initializeGoogleTagManager();
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: name, ...parameters });
  return true;
}

export function isAnalyticsExcludedPath(pathname: string): boolean {
  const path = stripLocalePrefix(pathname);
  return [
    '/admin',
    '/vendedor',
    '/login',
    '/registro',
    '/user',
    '/consultar-reserva',
    '/carrito',
    '/e2e',
  ].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isClarityExcludedPath(pathname: string): boolean {
  const path = stripLocalePrefix(pathname);
  return (
    isAnalyticsExcludedPath(pathname) ||
    path === '/checkout' ||
    path.startsWith('/checkout/')
  );
}

export function isCheckoutPath(pathname: string): boolean {
  return stripLocalePrefix(pathname) === '/checkout';
}

export function isCheckoutHref(href: string): boolean {
  try {
    return isCheckoutPath(new URL(href, window.location.href).pathname);
  } catch {
    return false;
  }
}

export function isWhatsAppHref(href: string): boolean {
  try {
    const host = new URL(href, window.location.href).hostname.toLowerCase();
    return host === 'wa.me' || host.endsWith('.whatsapp.com') || host === 'whatsapp.com';
  } catch {
    return false;
  }
}

export function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(?:es|en)(?=\/|$)/, '') || '/';
}

export function trackPurchaseWhenConsented(purchase: {
  transactionId: string;
  valueMinor: number;
  currency: string;
  itemSlug?: string | null;
  itemName?: string | null;
  quantity?: number | null;
}): () => void {
  const send = () => {
    const transactionId = purchase.transactionId.trim();
    const currency = purchase.currency.trim().toUpperCase();
    if (
      !transactionId ||
      !currency ||
      !Number.isFinite(purchase.valueMinor) ||
      purchase.valueMinor <= 0 ||
      !hasAnalyticsConsent()
    ) {
      return;
    }

    const storageKey = `baft.analytics-purchase.${transactionId}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
    } catch {
      // GA4's transaction_id remains the cross-session duplicate safeguard.
    }

    const parameters: Record<string, unknown> = {
      transaction_id: transactionId,
      value: purchase.valueMinor / 100,
      currency,
    };
    if (purchase.itemSlug || purchase.itemName) {
      parameters.items = [
        {
          ...(purchase.itemSlug ? { item_id: purchase.itemSlug } : {}),
          ...(purchase.itemName ? { item_name: purchase.itemName } : {}),
          quantity: Math.max(1, Math.floor(Number(purchase.quantity) || 1)),
        },
      ];
    }

    if (pushAnalyticsEvent('purchase', parameters)) {
      try {
        window.sessionStorage.setItem(storageKey, '1');
      } catch {
        // The GA4 transaction_id is still sent for server-side deduplication.
      }
    }
  };

  send();
  window.addEventListener(ANALYTICS_CONSENT_EVENT, send);
  window.addEventListener('storage', send);
  return () => {
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, send);
    window.removeEventListener('storage', send);
  };
}
