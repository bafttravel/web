import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/vendor-admin';
import { buildReservationVoucher } from '@/lib/vouchers/server';

export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardAdmin(request); if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  if (!/^[\w-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Reserva inválida' }, { status: 400 });
  try {
    const snap = await guard.db.collection('reservas').doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: 'Reserva inexistente' }, { status: 404 });
    const voucher = await buildReservationVoucher(snap.data()!);
    return new Response(Buffer.from(voucher.bytes), { headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${voucher.filename}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    console.error('[voucher] No se pudo generar el documento', error);
    return NextResponse.json({ error: 'No se pudo generar el voucher PDF' }, { status: 500 });
  }
}
