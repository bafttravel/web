import OperationsShell from '@/components/admin/OperationsShell';
import FinanceManager from '@/components/admin/FinanceManager';
import { parsePaymentView } from '@/lib/admin/payments';

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ seccion?: string }> }) {
  const { seccion } = await searchParams;
  const view = parsePaymentView(seccion);
  return <OperationsShell><FinanceManager key={view} initialView={view} /></OperationsShell>;
}
