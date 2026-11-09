import { buildVoucherReminder } from '@/lib/vouchers/delivery';
import { voucherFixture } from '../voucher-fixture';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.ADMIN_DESIGN_PREVIEW !== '1') return new Response(null, { status: 404 });
  const delivery = await buildVoucherReminder(voucherFixture, { name: 'BAFT', email: 'contacto@example.test', whatsapp: '5492966701907' });
  if (new URL(request.url).searchParams.get('format') === 'email') return new Response(delivery.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  const pdf = delivery.attachments[0];
  return new Response(pdf.content, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${pdf.filename}"`, 'Cache-Control': 'no-store' } });
}
