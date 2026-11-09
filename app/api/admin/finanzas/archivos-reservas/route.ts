import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/vendor-admin';
import { serializeFirestoreData } from '@/lib/utils/serialize';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const guard = await guardAdmin(request);
  if (guard instanceof NextResponse) return guard;

  try {
    const archives = await guard.db
      .collection('reservationDeletionArchives')
      .orderBy('deletedAt', 'desc')
      .get();
    const rows = [];

    for (let start = 0; start < archives.docs.length; start += 10) {
      const page = await Promise.all(archives.docs.slice(start, start + 10).map(async (archive) => {
        const [payments, ledger] = await Promise.all([
          archive.ref.collection('payments').get(),
          guard.db.collection('operationsLedger').where('reservationId', '==', archive.id).get(),
        ]);
        return {
          id: archive.id,
          ...archive.data(),
          payments: payments.docs.map((payment) => ({ ...payment.data(), id: payment.id })),
          ledger: ledger.docs.map((entry) => ({ ...entry.data(), id: entry.id })),
        };
      }));
      rows.push(...page);
    }

    return NextResponse.json(
      { archives: serializeFirestoreData(rows) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[admin/finanzas] No se pudo cargar el archivo de reservas eliminadas', error);
    return NextResponse.json({ error: 'No se pudo cargar la evidencia archivada' }, { status: 500 });
  }
}
