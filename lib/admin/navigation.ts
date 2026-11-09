export const adminNavigation = [
  { label: 'Inicio', items: [{ label: 'Dashboard', href: '/admin', icon: 'dashboard' }] },
  { label: 'Operación', items: [
    { label: 'Reservas', href: '/admin/ventas', icon: 'reservations' },
    { label: 'Excursiones', href: '/admin/paquetes', icon: 'excursions' },
    { label: 'Hoteles', href: '/admin/hoteles', icon: 'hotels' },
    { label: 'Proveedores', href: '/admin/proveedores', icon: 'providers' },
    { label: 'Vendedores', href: '/admin/vendedores', icon: 'vendors' },
    { label: 'Clientes', href: '/admin/clientes', icon: 'customers' },
  ] },
  { label: 'Administración', items: [
    { label: 'Pagos', href: '/admin/pagos', icon: 'finance' },
    { label: 'Comisiones de vendedores', href: '/admin/referidos', icon: 'providers' },
  ] },
  { label: 'Contenido y comunicación', items: [
    { label: 'Categorías', href: '/admin/categorias', icon: 'categories' },
    { label: 'Banners', href: '/admin/banners', icon: 'banners' },
    { label: 'Secciones del sitio', href: '/admin/secciones', icon: 'sections' },
    { label: 'Consultas', href: '/admin/consultas', icon: 'messages' },
    { label: 'Emails', href: '/admin/emails', icon: 'emails' },
    { label: 'Newsletter', href: '/admin/newsletter', icon: 'newsletter' },
  ] },
  { label: 'Sistema', items: [
    { label: 'Configuración', href: '/admin/seguridad', icon: 'settings' },
    { label: 'Documentación', href: '/admin/documentacion', icon: 'documentation' },
  ] },
] as const;

export function canonicalAdminPath(pathname: string) {
  return pathname.replace(/^\/admin\/reservas(?=\/|$)/, '/admin/ventas').replace(/^\/admin\/excursiones(?=\/|$)/, '/admin/paquetes').replace(/^\/admin\/prestadores(?=\/|$)/, '/admin/proveedores').replace(/^\/admin\/finanzas(?=\/|$)/, '/admin/pagos').replace(/^\/admin\/reportes\/?$/, '/admin');
}
export function isAdminNavigationActive(pathname: string, href: string) {
  const path = canonicalAdminPath(pathname);
  return href === '/admin' ? path === href : path === href || path.startsWith(`${href}/`);
}
