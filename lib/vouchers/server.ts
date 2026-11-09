import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { voucherData, voucherFilename, type VoucherSource } from './model.ts';
import { renderVoucherPdf } from './pdf.ts';

export async function buildReservationVoucher(source: VoucherSource) {
  // Local, bundled brand asset: no remote URL supplied by a reservation is fetched.
  const logo = await readFile(path.join(process.cwd(), 'public', 'images', 'logo.png'));
  const data = voucherData(source);
  const bytes = renderVoucherPdf(data, logo);
  return { bytes, filename: voucherFilename(data.code) };
}
