import { NextRequest, NextResponse } from 'next/server';
import { routing, type AppLocale } from './i18n/routing';

const PUBLIC_PREFIXES = [
  '/',
  '/agencias',
  '/blog',
  '/carrito',
  '/categoria',
  '/checkout',
  '/consultar-reserva',
  '/contacto',
  '/destinos',
  '/educativos',
  '/excursion',
  '/excursiones',
  '/login',
  '/paquete',
  '/paquetes',
  '/privacidad',
  '/registro',
  '/riodejaneiro',
  '/terminos-condiciones',
  '/transportes',
  '/user',
];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getLocaleFromPath(pathname: string): AppLocale | null {
  const firstSegment = pathname.split('/')[1];
  return routing.locales.includes(firstSegment as AppLocale) ? firstSegment as AppLocale : null;
}

function negotiateLocale(request: NextRequest): AppLocale {
  const cookie = request.cookies.get('NEXT_LOCALE')?.value;
  if (routing.locales.includes(cookie as AppLocale)) return cookie as AppLocale;
  const acceptLanguage = request.headers.get('accept-language')?.toLowerCase() || '';
  return acceptLanguage.startsWith('en') ? 'en' : routing.defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isPublicPath(pathname) && !getLocaleFromPath(pathname)) return NextResponse.next();

  const locale = getLocaleFromPath(pathname) ?? negotiateLocale(request);
  const pathWithoutLocale = getLocaleFromPath(pathname)
    ? pathname.slice(locale.length + 1) || '/'
    : pathname;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-baft-locale', locale);

  if (!getLocaleFromPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
    const response = NextResponse.redirect(redirectUrl, 308);
    response.cookies.set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
    return response;
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = pathWithoutLocale;
  const response = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
  response.cookies.set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return response;
}

export default proxy;

export const config = {
  matcher: ['/((?!api|admin|vendedor|_next|.*\\..*).*)'],
};
