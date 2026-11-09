import { voucherData, type VoucherSource } from './model.ts';
import { buildReservationVoucher } from './server.ts';
import { reminderHtml, reminderText } from '../emails/voucher-reminder.ts';

/** Generate at send time. If PDF generation fails, reject the whole delivery instead
 * of sending a reminder claiming an attachment that does not exist. */
export async function buildVoucherReminder(source: VoucherSource, brand: { name: string; email: string; whatsapp: string }, lookupUrl?: string) {
  const data = voucherData(source);
  const reminder = {
    customerName: data.customer, experienceTitle: data.service, dateFormatted: data.date,
    pickupTime: data.time, pickupAddress: data.pickup,
    reservationCode: data.code === 'Sin código' ? undefined : data.code, lookupUrl,
  };
  const pdf = await buildReservationVoucher(source);
  return { html: reminderHtml(reminder, brand), text: reminderText(reminder, brand), attachments: [{ filename: pdf.filename, content: Buffer.from(pdf.bytes) }] };
}
