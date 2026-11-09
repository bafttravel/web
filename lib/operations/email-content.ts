import { adminDb } from '@/lib/firebaseAdmin';
import { buildClienteCompraConfirmadaHtml, buildClienteCompraConfirmadaText } from '@/lib/emails/reserva-confirmada';
import { buildVoucherReminder } from '@/lib/vouchers/delivery';
import { voucherData } from '@/lib/vouchers/model';
import { CONTACT_INFO, SITE_NAME } from '@/lib/constants';
import { decideVoucherDelivery } from '@/lib/vouchers/schedule';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** Voucher contents are rebuilt at delivery, not frozen weeks before pickup is assigned. */
export async function currentReservationEmail(reservationId: string, type: string): Promise<{
  suppressed: boolean;
  html?: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  voucherDecision?: ReturnType<typeof decideVoucherDelivery>;
}> {
  const voucher = type === 'cliente_voucher_48hs' || type === 'cliente_confirmacion';
  if (voucher && !reservationId) throw new Error('El recordatorio requiere una reserva para adjuntar su voucher');
  if (!adminDb) {
    if (voucher) throw new Error('No se puede generar el voucher: base de reservas no disponible');
    return { suppressed: false };
  }
  const snap = await adminDb.collection('reservas').doc(reservationId).get();
  if (!snap.exists) return { suppressed: true };
  const r = snap.data()!;
  if (r.status === 'cancelled') return { suppressed: true };
  if (!type.startsWith('cliente_')) return { suppressed: false };
  const op = r.operations;
  let voucherDecision: ReturnType<typeof decideVoucherDelivery> | undefined;
  if (voucher) {
    voucherDecision = decideVoucherDelivery({
      reservationStatus: r.status,
      date: r.date,
      departureTime: op?.pickupTime || r.departureTime,
      timeZone: r.timeZone ?? r.timezone,
    });
    if (voucherDecision.action !== 'send') return { suppressed: false, voucherDecision };
  }
  const code = String(r.reservationCode ?? '');
  const site = String(process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
  const display = voucherData(r);
  const raw = { customerName: String(r.customerName ?? ''), experienceTitle: String(r.packageTitle ?? r.experienceTitle ?? ''), dateFormatted: display.date, peopleLabel: `${r.people} pasajeros`, amountFormatted: `${(Number(r.amountTotal) / 100).toFixed(2)} ${String(r.currency).toUpperCase()}`, reservationCode: code, lookupUrl: site && code ? `${site}/consultar-reserva?code=${encodeURIComponent(code)}` : undefined, sessionId: reservationId, customerEmail: String(r.customerEmail ?? ''), pickupHotel: String(op?.pickupHotelName ?? ''), pickupAddress: String(op?.pickupAddress ?? ''), pickupTime: display.time };
  const safe = { ...raw, customerName: escape(raw.customerName), experienceTitle: escape(raw.experienceTitle), pickupHotel: escape(raw.pickupHotel), pickupAddress: escape(raw.pickupAddress) };
  if (voucher) {
    return {
      suppressed: false,
      voucherDecision,
      ...await buildVoucherReminder(r, { name: SITE_NAME, email: CONTACT_INFO.email, whatsapp: CONTACT_INFO.whatsapp }, raw.lookupUrl),
    };
  }
  return { suppressed: false, html: buildClienteCompraConfirmadaHtml(safe), text: buildClienteCompraConfirmadaText(raw) };
}
