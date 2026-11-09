'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SquaresFour, CalendarBlank, Compass, Buildings, Handshake, UsersThree, Users,
  Wallet, FolderSimple, ImageSquare, Layout, Newspaper,
  ChatsCircle, EnvelopeSimple, PaperPlaneTilt, SlidersHorizontal, BookOpenText,
  SidebarSimple, MagnifyingGlass, ArrowUpRight, SignOut, X, CaretRight, Plus, CircleNotch,
  type Icon,
} from '@phosphor-icons/react';
import { useAuth } from '@/hooks/useAuth';
import { adminNavigation, isAdminNavigationActive } from '@/lib/admin/navigation';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

const icons: Record<string, Icon> = {
  dashboard: SquaresFour, reservations: CalendarBlank, excursions: Compass, hotels: Buildings,
  providers: Handshake, vendors: UsersThree, customers: Users, finance: Wallet,
  categories: FolderSimple, banners: ImageSquare, sections: Layout,
  blog: Newspaper, messages: ChatsCircle, emails: EnvelopeSimple, newsletter: PaperPlaneTilt,
  settings: SlidersHorizontal, documentation: BookOpenText,
};

type WorkspaceProps = { children: ReactNode; pathname: string; email?: string | null; onLogout?: () => void; loggingOut?: boolean; preview?: boolean };

/** Presentation is separate from authentication, allowing isolated visual tests with synthetic data. */
export function AdminWorkspace({ children, pathname, email, onLogout, loggingOut = false, preview = false }: WorkspaceProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const allItems = useMemo(() => adminNavigation.flatMap((group) => [...group.items]), []);
  const current = allItems.find((item) => isAdminNavigationActive(pathname, item.href));
  const subpage = current && pathname !== current.href && !['/admin/reservas', '/admin/reportes', '/admin/excursiones'].includes(pathname);
  const lastSegment = pathname.split('/').filter(Boolean).at(-1) ?? '';
  const subpageTitle = ['nuevo', 'nueva'].includes(lastSegment) ? 'Nuevo registro' : lastSegment === 'buscar' ? 'Búsqueda' : 'Detalle';
  const results = allItems.filter((item) => item.label.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));

  useEffect(() => {
    const saved = localStorage.getItem('baft:admin:sidebar');
    if (saved === 'collapsed') queueMicrotask(() => setCollapsed(true));
    document.body.setAttribute('data-admin-ui', 'true');
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen((open) => !open); }
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.removeAttribute('data-admin-ui'); window.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = sidebarRef.current;
    const focusables = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []).filter((element) => element.getClientRects().length > 0);
    focusables()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || searchOpen) return;
      const nodes = focusables(); const first = nodes[0]; const last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [mobileOpen, searchOpen]);

  const toggleCollapsed = () => setCollapsed((value) => { localStorage.setItem('baft:admin:sidebar', !value ? 'collapsed' : 'expanded'); return !value; });
  return <div className="admin-workspace" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
    <a className="admin-skip" href="#admin-main">Saltar al contenido</a>
    {mobileOpen && <button className="admin-mobile-scrim" aria-label="Cerrar navegación" onClick={() => setMobileOpen(false)} />}
    <aside ref={sidebarRef} className="admin-sidebar" aria-label="Navegación de administración">
      <div className="admin-brand"><Link href="/admin" aria-label="BAFT — Dashboard"><span className="admin-brand-symbol">b.</span><span className="admin-brand-copy">BAFT<span>Administración</span></span></Link><button className="admin-mobile-close admin-icon-button" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)}><X size={19} /></button></div>
      <button className="admin-sidebar-search" onClick={() => { setSearch(''); setSearchOpen(true); }} title="Buscar sección (Ctrl + K)"><MagnifyingGlass size={18} /><span>Ir a una sección</span><kbd>⌘ K</kbd></button>
      <nav className="admin-navigation">{adminNavigation.map((group) => <div className="admin-nav-group" key={group.label}><p className="admin-nav-label">{group.label}</p>{group.items.map((item) => {
        const Glyph = icons[item.icon]; const active = isAdminNavigationActive(pathname, item.href);
        return <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} aria-label={item.label} aria-current={active ? 'page' : undefined} className="admin-nav-item" onClick={() => setMobileOpen(false)}><Glyph size={19} weight={active ? 'fill' : 'regular'} /><span>{item.label}</span>{active && <span className="admin-nav-dot" />}</Link>;
      })}</div>)}</nav>
      <div className="admin-sidebar-footer"><div className="admin-account"><span className="admin-avatar">{(email?.[0] ?? 'A').toUpperCase()}</span><span className="admin-account-copy"><strong>Administrador</strong><span>{email || 'Panel de gestión'}</span></span><button className="admin-icon-button" title="Cerrar sesión" aria-label="Cerrar sesión" disabled={loggingOut || !onLogout} onClick={onLogout}>{loggingOut ? <CircleNotch size={18} className="animate-spin" /> : <SignOut size={18} />}</button></div></div>
    </aside>

    <div className="admin-stage" inert={mobileOpen ? true : undefined}><header className="admin-topbar"><div className="admin-topbar-leading"><button className="admin-icon-button admin-desktop-toggle" title={collapsed ? 'Expandir navegación' : 'Contraer navegación'} aria-label={collapsed ? 'Expandir navegación' : 'Contraer navegación'} aria-expanded={!collapsed} onClick={toggleCollapsed}><SidebarSimple size={20} /></button><button className="admin-icon-button admin-mobile-toggle" aria-label="Abrir menú" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><SidebarSimple size={20} /></button><span className="admin-topbar-divider" /><nav aria-label="Ruta actual" className="admin-breadcrumb"><Link href="/admin">Administración</Link><CaretRight size={12} /><span>{current?.label ?? 'Administración'}</span>{subpage && <><CaretRight size={12} /><span>{subpageTitle}</span></>}</nav></div><div className="admin-topbar-actions">{preview && <span className="admin-preview-label">Vista de prueba</span>}<Link href="/" target="_blank" rel="noopener noreferrer" className="admin-site-link">Ver sitio<ArrowUpRight size={15} /></Link><span className="admin-topbar-divider" /><Link href="/admin/ventas/nueva" className="admin-quick-create"><Plus size={16} /><span>Nueva reserva</span></Link></div></header>
      <main id="admin-main" tabIndex={-1} className="admin-content">{children}</main>
      <footer className="admin-workspace-footer"><span>BAFT · Administración</span><span>Desarrollado por Tucs Digital</span></footer>
    </div>

    <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent className="admin-command" onOpenAutoFocus={(event) => { event.preventDefault(); searchRef.current?.focus(); }}><DialogTitle>Ir a una sección</DialogTitle><DialogDescription>Buscá por nombre. Acceso rápido con Ctrl / ⌘ K.</DialogDescription><div className="admin-command-input"><MagnifyingGlass size={20} /><input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reservas, hoteles, finanzas…" aria-label="Buscar sección" /></div><nav className="admin-command-results" aria-label="Resultados de navegación">{results.map((item) => { const Glyph = icons[item.icon]; return <Link key={item.href} href={item.href} onClick={() => { setSearchOpen(false); setMobileOpen(false); }}><Glyph size={19} /><span>{item.label}</span><CaretRight size={14} /></Link>; })}{!results.length && <p>No encontramos esa sección.</p>}</nav></DialogContent></Dialog>
  </div>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const { logout, user } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const handleLogout = async () => { if (loggingOut) return; setLoggingOut(true); try { await logout(); router.replace('/admin/login'); } catch { toast.error('No se pudo cerrar la sesión. Intentá nuevamente.'); } finally { setLoggingOut(false); } };
  return <AdminWorkspace pathname={pathname} email={user?.email} onLogout={() => void handleLogout()} loggingOut={loggingOut}>{children}</AdminWorkspace>;
}
