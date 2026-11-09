import type { Reservation, ReservationReferralInfo } from '@/components/landing-reserva/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { referralDateLabel } from '@/lib/admin/referrals';
import { moneyLabel } from '@/lib/operations/currency';
import CommissionStatusBadge from './CommissionStatusBadge';

export type ReferralTableRow = Pick<Reservation, 'id' | 'packageTitle' | 'experienceTitle' | 'customerName' | 'customerEmail' | 'amountTotal' | 'currency'> & {
  createdAt?: unknown;
  referredBy?: Partial<ReservationReferralInfo>;
};

export default function ReferralReservationsTable({ rows, selected, onToggle }: { rows: ReferralTableRow[]; selected: string[]; onToggle: (id: string) => void }) {
  return <section className="admin-data-table admin-referral-table">
    <Table aria-label="Reservas y comisiones de vendedores">
      <TableHeader><TableRow>
        {['Seleccionar', 'Fecha', 'Excursión', 'Cliente', 'Vendedor', 'Venta', 'Comisión', 'Estado de comisión'].map((label) => <TableHead key={label}>{label}</TableHead>)}
      </TableRow></TableHeader>
      <TableBody>{rows.map((r) => <TableRow key={r.id}>
        <TableCell><input type="checkbox" aria-label={`Seleccionar reserva de ${r.customerName || 'cliente sin nombre'}`} checked={selected.includes(r.id)} onChange={() => onToggle(r.id)} /></TableCell>
        <TableCell className="whitespace-nowrap">{referralDateLabel(r.createdAt)}</TableCell>
        <TableCell className="font-medium">{r.packageTitle || r.experienceTitle || 'Sin excursión'}</TableCell>
        <TableCell><div className="min-w-0"><div className="admin-directory-name truncate max-w-[220px]">{r.customerName || 'Sin nombre'}</div><span className="admin-cell-secondary truncate max-w-[220px]">{r.customerEmail || 'Sin email'}</span></div></TableCell>
        <TableCell>{r.referredBy?.vendorName || '—'}</TableCell>
        <TableCell className="whitespace-nowrap">{moneyLabel(r.amountTotal, r.currency)}</TableCell>
        <TableCell className="whitespace-nowrap">{r.referredBy ? moneyLabel(r.referredBy.commissionAmount, r.referredBy.commissionCurrency) : '—'}</TableCell>
        <TableCell><CommissionStatusBadge status={r.referredBy?.payoutStatus} /></TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </section>;
}
