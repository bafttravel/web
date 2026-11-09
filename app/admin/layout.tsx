import { Poppins } from 'next/font/google';
import './workspace.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${poppins.className} admin-scope`}>{children}</div>;
}
