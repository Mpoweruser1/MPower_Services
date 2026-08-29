// shared/exportExcel.js — NEW
// Requires the 'exceljs' package: npm install exceljs
// (Deliberately NOT using 'xlsx'/SheetJS — its npm-published version
// has two high-severity, currently unpatched advisories: prototype
// pollution and a ReDoS. exceljs has no equivalent open advisories and
// is actively maintained.)
//
// One shared helper so every report screen builds a real .xlsx file
// the same way, instead of five separate copies of the same logic.
import ExcelJS from 'exceljs';

/**
 * @param {string} filename - without extension, e.g. 'fee_analytics_2026-08-29'
 * @param {Array<{name: string, headers: string[], rows: any[][]}>} sheets
 *   One or more sheets. `rows` is an array of row-arrays, same shape as
 *   what these screens already build for CSV — headers is the first row.
 */
export async function exportToExcel(filename, sheets) {
  const wb = new ExcelJS.Workbook();

  sheets.forEach((sheet) => {
    // Sheet names are capped at 31 chars by the xlsx format itself.
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    ws.addRow(sheet.headers);
    ws.getRow(1).font = { bold: true };
    sheet.rows.forEach((row) => ws.addRow(row));

    // Reasonable column widths from content length, so the sheet
    // isn't unusably cramped the moment someone opens it.
    ws.columns.forEach((col, i) => {
      let maxLen = String(sheet.headers[i] ?? '').length;
      sheet.rows.forEach((row) => {
        const cell = row[i];
        const len = cell === null || cell === undefined ? 0 : String(cell).length;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 40);
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

