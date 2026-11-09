'use client';
import ReservationOperationsPanel from '@/components/admin/ReservationOperationsPanel';
import { EMPTY_RESERVATION_OPERATIONS } from '@/lib/operations/types';
import { voucherFixture } from './voucher-fixture';

const downloadPdf = async () => {
  const response = await fetch('/e2e/admin-design/voucher');
  if (!response.ok) throw new Error('No se pudo generar el voucher de prueba');
  return response.blob();
};
export default function VoucherPreview() {
  return <div className="space-y-6"><header className="admin-page-heading"><h1>Voucher y recordatorio</h1><p>Componentes reales con datos de prueba. No se envían emails ni se guardan reservas.</p></header><ReservationOperationsPanel reservation={voucherFixture} value={voucherFixture.operations ?? EMPTY_RESERVATION_OPERATIONS} onChange={() => {}} onCancel={() => {}} downloadPdf={downloadPdf} /><section><h2>Email de recordatorio</h2><iframe title="Email de recordatorio con datos de prueba" src="/e2e/admin-design/voucher?format=email" className="mt-4 h-[440px] w-full bg-white" /></section></div>;
}
