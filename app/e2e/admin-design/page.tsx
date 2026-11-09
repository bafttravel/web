import { notFound } from 'next/navigation';
import AdminDesignPreview from './preview';
import '../../admin/workspace.css';

export const metadata = { robots: { index: false, follow: false } };

/** Development-only component fixture; never authenticates or reads the business database. */
export default async function AdminDesignPage({ searchParams }: { searchParams: Promise<{ screen?: string; legacy?: string }> }) {
  if (process.env.NODE_ENV === 'production' || process.env.ADMIN_DESIGN_PREVIEW !== '1') notFound();
  const { screen, legacy } = await searchParams;
  return <AdminDesignPreview screen={screen === 'hotels' || screen === 'providers' || screen === 'finance' || screen === 'commissions' || screen === 'datepickers' || screen === 'uploads' || screen === 'manual-reservation' || screen === 'reservation-form' || screen === 'voucher' ? screen : 'dashboard'} legacy={legacy === 'referral' || legacy === 'currencies' ? legacy : undefined} />;
}
