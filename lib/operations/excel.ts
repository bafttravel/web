import ExcelJS from 'exceljs';
import { resolve } from 'node:path';
import type { ReportSection } from './reports';
import { adminReportDate } from '../admin/dates.ts';

export type FinanceExcelTemplate = 'proveedores' | 'hoteles' | 'cobros-hoteles' | 'balance' | 'liquidaciones';
export type FinanceExcelRow = Array<string | number | null>;

const financeTemplates: Record<FinanceExcelTemplate, { file: string; firstDataRow: number; moneyColumns: number[] }> = {
  proveedores: { file: 'PagosProveedores-06112026194436.xlsx', firstDataRow: 5, moneyColumns: [5] },
  hoteles: { file: 'PagosHoteles-06112026194256.xlsx', firstDataRow: 5, moneyColumns: [6, 7, 8] },
  'cobros-hoteles': { file: 'PagosDeHotelesABaftravel-06112026194138.xlsx', firstDataRow: 5, moneyColumns: [6, 7, 8, 9] },
  balance: { file: 'BalancesHotelesBaftravel-07112026145954.xlsx', firstDataRow: 8, moneyColumns: [7, 8, 9] },
  liquidaciones: { file: 'LiquidacionesBaftravel-07112026150010.xlsx', firstDataRow: 5, moneyColumns: [7, 9] },
};

/** Populate the supplied finance workbook without replacing its titles, columns, or layout. */
export async function financeTemplateWorkbook(
  template: FinanceExcelTemplate,
  rows: FinanceExcelRow[],
  options: { period: string; currency: string; balanceTotals?: { payable: number; receivable: number; balance: number } },
) {
  const config = financeTemplates[template];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolve(process.cwd(), 'ejemplos', config.file));
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`La plantilla ${config.file} no contiene una hoja`);

  sheet.getCell('A2').value = options.period;
  if (template === 'balance' && options.balanceTotals) {
    const totals = options.balanceTotals;
    sheet.getCell(5, 4).value = totals.payable / 100;
    sheet.getCell(5, 5).value = totals.receivable / 100;
    sheet.getCell(5, 6).value = totals.balance / 100;
  }

  const columnCount = sheet.columnCount;
  const originalRowCount = sheet.rowCount;
  const prototype = sheet.getRow(config.firstDataRow);
  const styles = Array.from({ length: columnCount }, (_, index) => structuredClone(prototype.getCell(index + 1).style));
  const rowHeight = prototype.height;
  for (let rowNumber = config.firstDataRow; rowNumber <= originalRowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    for (let column = 1; column <= columnCount; column++) row.getCell(column).value = null;
  }

  const currencySymbols: Record<string, string> = { ARS: '$', USD: 'US$', BRL: 'R$', EUR: '€' };
  const symbol = currencySymbols[options.currency] ?? options.currency;
  const moneyFormat = `"${symbol}"#,##0.00;[Red]-"${symbol}"#,##0.00`;
  const rowsToWrite: FinanceExcelRow[] = rows.length ? rows : [['Sin resultados para los filtros aplicados']];
  for (const [index, values] of rowsToWrite.entries()) {
    const row = sheet.getRow(config.firstDataRow + index);
    if (rowHeight) row.height = rowHeight;
    for (let column = 1; column <= columnCount; column++) {
      const cell = row.getCell(column);
      cell.style = structuredClone(styles[column - 1] ?? {});
      cell.value = values[column - 1] ?? null;
      if (config.moneyColumns.includes(column) && typeof values[column - 1] === 'number') cell.numFmt = moneyFormat;
    }
  }
  const firstUnusedRow = config.firstDataRow + rowsToWrite.length;
  const trailingRows = Math.max(0, sheet.rowCount - firstUnusedRow + 1);
  if (trailingRows) sheet.spliceRows(firstUnusedRow, trailingRows);
  if (template === 'balance') {
    [4, 5, 6].forEach((column) => { sheet.getCell(5, column).numFmt = moneyFormat; });
  }

  return workbook.xlsx.writeBuffer();
}

/** Strings remain strings (never formulas); money is numeric with Excel formatting. */
export async function excelWorkbook(sections: ReportSection[], metadata: Record<string, unknown>) {
  const book = new ExcelJS.Workbook();
  book.creator = 'BAFT'; book.created = new Date();
  const meta = book.addWorksheet('Filtros y criterios');
  meta.columns = [{ header: 'Criterio', key: 'key', width: 34 }, { header: 'Valor', key: 'value', width: 80 }];
  Object.entries(metadata).forEach(([key, value]) => meta.addRow({ key, value: String(adminReportDate(key, value) ?? '') }));
  for (const [index, section] of sections.entries()) {
    const sheet = book.addWorksheet(`${index + 1} ${section.title}`.replace(/[\\/*?:\[\]]/g, '').slice(0, 31));
    const keys = [...new Set(section.rows.flatMap(Object.keys))];
    if (!keys.length) { sheet.addRow(['Sin resultados para los filtros aplicados']); continue; }
    sheet.columns = keys.map((key) => ({ header: key, key, width: key === 'Nombre' || key === 'Excursión' ? 42 : 24 }));
    for (const row of section.rows) {
      const excelRow = sheet.addRow(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, adminReportDate(key, value)])));
      keys.forEach((key, i) => {
        if (typeof row[key] === 'number' && /Importe|Margen$|Cobrado|A cobrar|Pagado|Venta|Costo|Comisión|Ventas|Saldo|Monto|Total|Debe|debe|Gastos/.test(key)) {
          excelRow.getCell(i + 1).value = Number(row[key]) / 100;
          excelRow.getCell(i + 1).numFmt = '#,##0.00;[Red]-#,##0.00';
        }
      });
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: keys.length } };
  }
  return book.xlsx.writeBuffer();
}
