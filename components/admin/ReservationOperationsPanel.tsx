'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Reservation } from '@/components/landing-reserva/types';
import type { CommissionPaymentMethod, ReservationOperationsInput } from '@/lib/operations/types';
import { operationsDownload } from '@/lib/operations/client';
import ReservationOperationsFields from './ReservationOperationsFields';
import { Button } from '@/components/ui/button';
import { adminDateLabel } from '@/lib/admin/dates';
import { voucherFilename } from '@/lib/vouchers/model';
import { salesChannelLabel } from '@/lib/admin/sales-channels';
import { FileDown, Pencil } from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';

const commissionMethodLabel = (method?: CommissionPaymentMethod | '') => method ? ({ cash: 'Pesos / efectivo', transfer: 'Transferencia / depósito', card: 'Tarjeta de crédito' } satisfies Record<CommissionPaymentMethod, string>)[method] : 'Sin definir';

export default function ReservationOperationsPanel({ reservation, value, onChange, onCancel, disabled = false, downloadPdf = operationsDownload }: {
  reservation: Reservation;
  value: ReservationOperationsInput;
  onChange: (value: ReservationOperationsInput) => void;
  onCancel: () => void;
  disabled?: boolean;
  downloadPdf?: (path: string) => Promise<Blob>;
}) {
  const [editing, setEditing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cancelEditing = () => {
    onCancel();
    setEditing(false);
  };
  const voucherText = () => {
    const op = reservation.operations;
    const code = String((reservation as unknown as Record<string, unknown>).reservationCode ?? reservation.id);
    return [`BAFT — Voucher ${code}`, `Estado: ${{ pending: 'Pendiente', reserved: 'Reservada', completed: 'Completada', cancelled: 'Cancelada' }[reservation.status]}`, `Excursión: ${reservation.packageTitle ?? reservation.experienceTitle}`, `Fecha: ${reservation.date === 'sin-fecha' ? 'A coordinar' : adminDateLabel(reservation.date)}`, `Titular: ${reservation.customerName}`, `Pasajeros: ${reservation.people}`, `Retiro: ${[op?.pickupHotelName, op?.pickupAddress].filter(Boolean).join(' — ') || 'A confirmar'}`, `Horario: ${op?.pickupTime || 'A confirmar'}`, ...(op?.notes ? [`Indicaciones: ${op.notes}`] : []), `Consultar reserva: ${window.location.origin}/consultar-reserva?code=${encodeURIComponent(code)}`].join('\n');
  };
  const download = async () => {
    setDownloading(true);
    try {
      const blob = await downloadPdf(`/api/admin/reservas/${encodeURIComponent(reservation.id)}/voucher`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = voucherFilename(String((reservation as unknown as Record<string, unknown>).reservationCode || 'Sin código'));
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo generar el PDF'); }
    finally { setDownloading(false); }
  };
  return <section className="admin-sale-card admin-sale-operations">
    <header className="admin-sale-section-heading"><div><h2>Operación y retiro</h2><p>Quién vendió, cómo se coordina el retiro y las indicaciones para el equipo.</p></div><div className="admin-sale-section-actions"><Button type="button" size="sm" variant="outline" aria-label="Descargar voucher PDF" disabled={downloading} onClick={() => void download()}><FileDown className="h-4 w-4" />{downloading ? 'Generando PDF…' : 'Voucher PDF'}</Button><Button type="button" size="sm" variant="outline" aria-label="Compartir voucher por WhatsApp" className="admin-sale-whatsapp" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(voucherText())}`, '_blank', 'noopener,noreferrer')}><SiWhatsapp aria-hidden="true" />WhatsApp</Button><Button type="button" size="sm" variant={editing ? 'outline' : 'default'} disabled={disabled} onClick={() => editing ? cancelEditing() : setEditing(true)}>{editing ? 'Cancelar edición' : <><Pencil className="h-4 w-4" />Editar operación</>}</Button></div></header>
    <div className="grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
      <p>Venta realizada por: <strong>{reservation.operations?.sellerHotelId ? reservation.operations.sellerHotelName || 'Hotel vendedor' : 'Baftravel · venta directa'}</strong></p>
      <p>Canal: <strong>{salesChannelLabel(reservation.operations?.channel ?? '')}</strong></p>
      {reservation.operations?.sellerHotelId && <p>Medio de pago: <strong>{commissionMethodLabel(reservation.operations.commissionMethod)}</strong></p>}
      <p>Retiro: <strong>{[reservation.operations?.pickupHotelName, reservation.operations?.pickupAddress].filter(Boolean).join(' — ') || 'A confirmar'}</strong></p>
      <p>Horario: <strong>{reservation.operations?.pickupTime || 'A confirmar'}</strong></p>
    </div>
    {editing && <form className="admin-sale-operations-form" onSubmit={(event) => event.preventDefault()}><fieldset disabled={disabled} className="admin-sale-operations-fieldset"><ReservationOperationsFields value={value} onChange={onChange} /></fieldset>
      <div className="admin-sale-inline-hint">Los cambios de esta sección se aplicarán con el botón flotante de guardar.</div>
    </form>}
  </section>;
}
