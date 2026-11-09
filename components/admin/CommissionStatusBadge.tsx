import { Badge } from '@/components/ui/badge';
import { referralStatus } from '@/lib/admin/referrals';

export default function CommissionStatusBadge({ status }: { status: unknown }) {
  const { label, tone } = referralStatus(status);
  return <Badge variant="outline" className="admin-commission-status" data-tone={tone}>
    <span className="admin-commission-status-dot" aria-hidden="true" />{label}
  </Badge>;
}
