import { jsPDF } from 'jspdf';
import type { VoucherData } from './model.ts';
import { voucherConditions, voucherIssuer } from './conditions.ts';

/** One renderer for both the authenticated download and customer email attachment.
 * Letter portrait matches the source PDF's MediaBox (612 x 792 pt). */
export function renderVoucherPdf(data: VoucherData, logo: Uint8Array): Uint8Array {
  const pdf = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  pdf.setProperties({ title: `Voucher ${data.code}`, author: 'BAFT', subject: 'Voucher de servicios / Service voucher' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 6; const width = pageWidth - margin * 2; const split = margin + width * .665;
  const line = (x1: number, y1: number, x2: number, y2: number) => pdf.line(x1, y1, x2, y2);
  const font = (size: number, bold = false) => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); };
  const wrap = (value: string, w: number, size = 9) => { font(size); return pdf.splitTextToSize(value, w) as string[]; };
  const label = (value: string, x: number, y: number, size = 7.5) => { font(size, true); pdf.text(value, x, y); };
  let y = 6;
  pdf.setDrawColor(0); pdf.setTextColor(0); pdf.setLineWidth(.65);
  // Header: current black logo on white, original licence and contact block.
  const headerHeight = 21;
  pdf.rect(margin, y, width, headerHeight);
  const image = pdf.getImageProperties(logo);
  const imageWidth = Math.min(48, 16 * image.width / image.height);
  const imageHeight = imageWidth * image.height / image.width;
  pdf.addImage(logo, 'PNG', margin + 3, y + (headerHeight - imageHeight) / 2, imageWidth, imageHeight);
  font(10); pdf.text([voucherIssuer.licence, voucherIssuer.disposition], margin + 55, y + 10, { lineHeightFactor: 1.4 });
  pdf.text([voucherIssuer.address, voucherIssuer.email, voucherIssuer.website], margin + 105, y + 7, { lineHeightFactor: 1.35 });
  y += headerHeight;
  const top = y;
  const leftWidth = split - margin;
  const fields = [
    { label: 'Dirigido a / To', value: `${data.customer}  x ${data.people}` },
    { label: 'Punto de retiro / Pick up', value: data.pickup },
    { label: 'Servicios a prestar / Services to be rendered', value: data.service },
  ];
  const rows = fields.map((field) => { const lines = wrap(field.value, leftWidth - 6); return { ...field, lines, height: Math.max(13, 8 + lines.length * 4) }; });
  for (const row of rows) {
    pdf.rect(margin, y, leftWidth, row.height);
    label(row.label, margin + 3, y + 4.8);
    font(9); pdf.text(row.lines, margin + 3, y + 9.5, { lineHeightFactor: 1.25 });
    y += row.height;
  }
  const bodyBottom = y;
  const rightWidth = margin + width - split;
  pdf.rect(split, top, rightWidth, bodyBottom - top);
  font(6.8, true);
  pdf.text('DOCUMENTO NO VALIDO COMO FACTURA', split + rightWidth / 2, top + 5, { align: 'center' });
  font(8); pdf.text(wrap(`Voucher: ${data.code}`, rightWidth - 6, 8), split + 3, top + 12);
  if (data.status) { font(7); pdf.text(data.status, split + 3, top + 18); }
  const middle = split + rightWidth / 2;
  const infoTop = bodyBottom - 17;
  line(split, infoTop, margin + width, infoTop); line(split, infoTop + 8.5, margin + width, infoTop + 8.5); line(middle, infoTop, middle, bodyBottom);
  label('Fecha:', split + 2, infoTop + 3); label('Date:', split + 2, infoTop + 6.5);
  label('Hora:', middle + 2, infoTop + 3); label('Hour:', middle + 2, infoTop + 6.5);
  font(8); pdf.text(data.date, middle - 2, infoTop + 6.5, { align: 'right' }); pdf.text(data.time, margin + width - 2, infoTop + 6.5, { align: 'right' });
  label('Cant. mayores:', split + 2, infoTop + 11.8); label('Cant. menores:', middle + 2, infoTop + 11.8);
  font(8); pdf.text(data.adults, middle - 2, bodyBottom - 1.5, { align: 'right' }); pdf.text(data.minors, margin + width - 2, bodyBottom - 1.5, { align: 'right' });
  const footerSplit = margin + width * .435;
  const confirmed = wrap(data.confirmedBy, footerSplit - margin - 6);
  const booked = wrap(data.bookedBy, width * .32 - 6);
  const footerHeight = Math.max(13, 8 + Math.max(confirmed.length, booked.length) * 4);
  pdf.rect(margin, y, width, footerHeight); line(footerSplit, y, footerSplit, y + footerHeight);
  label('Confirmó:', margin + 3, y + 4.5); label('Reservó:', footerSplit + 3, y + 4.5);
  font(9); pdf.text(confirmed, margin + 3, y + 9.5); pdf.text(booked, footerSplit + 3, y + 9.5);
  font(7.5); pdf.text('Disfrute su día / Have nice day', margin + width - 3, y + 4.5, { align: 'right' });
  y += footerHeight + 8;
  // Preserve long instructions and legal copy with pagination, never ellipses or clipping.
  const ensureSpace = (height: number) => { if (y + height > pageHeight - margin) { pdf.addPage(); y = 12; } };
  const paragraph = (value: string) => {
    const lines = wrap(value, width, 7.5);
    for (const text of lines) { ensureSpace(3.6); font(7.5); pdf.text(text, margin, y); y += 3.6; }
  };
  for (const detail of data.details) {
    ensureSpace(12); label(detail.label, margin, y); y += 4; paragraph(detail.value); y += 3;
  }
  for (const condition of voucherConditions) {
    const blockHeight = 8 + (wrap(`. ${condition.es}`, width, 7.5).length + wrap(`. ${condition.en}`, width, 7.5).length) * 3.6;
    ensureSpace(blockHeight);
    label(condition.esTitle, margin, y); y += 3.6; label(condition.enTitle, margin, y); y += 5;
    paragraph(`. ${condition.es}`); paragraph(`. ${condition.en}`); y += 6;
  }
  return new Uint8Array(pdf.output('arraybuffer'));
}
