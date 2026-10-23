import { palette } from '@cultuvilla/shared/design-system';
import type { RosterExportModel } from '@cultuvilla/shared/export/rosterExport';
import { CULTUVILLA_LOGO_PNG_BASE64 } from './cultuvillaLogo';
import { loadExcelJs } from './loadExcelJs';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** ExcelJS wants `FFRRGGBB`, the design tokens are `#rrggbb`. */
const argb = (hex: string): string => `FF${hex.replace('#', '').toUpperCase()}`;

const HEADER_FILL = argb(palette.olive);
const TITLE_COLOR = argb(palette.terracotta);
const BAND_FILL = argb(palette.cream);
const BORDER_COLOR = argb(palette.sage);

const DATE_FORMAT = 'dd/mm/yyyy hh:mm';
// A birth date has no meaningful time of day, and stamping the datetime format
// on one would print every attendee as born at 0:00.
const DATE_ONLY_FORMAT = 'dd/mm/yyyy';

const EUROS_FORMAT = '#,##0.00 "€"';

const TITLE_ROW = 1;
const SUBTITLE_ROW = 2;
const HEADER_ROW = 4;

/**
 * Build the branded .xlsx for an export model (an event's attendee roster, a cuota period). ExcelJS loads on
 * demand (see loadExcelJs), so pressing "Exportar" is what pays for it. The
 * function returns the raw bytes; handing them to the user is `downloadFile`'s
 * job.
 */
export async function buildRosterWorkbook(model: RosterExportModel): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJs();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cultuvilla';
  workbook.title = model.title;

  const sheet = workbook.addWorksheet(model.sheetName, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.columns = model.columns.map((c) => ({ key: c.key, width: c.width }));

  const logoId = workbook.addImage({ base64: CULTUVILLA_LOGO_PNG_BASE64, extension: 'png' });
  // Floated over the top-left corner rather than placed in a cell, so it never
  // shifts the table when a column is added.
  sheet.addImage(logoId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 46, height: 46 } });
  sheet.getRow(TITLE_ROW).height = 30;
  sheet.getRow(SUBTITLE_ROW).height = 18;

  const lastColumn = model.columns.length;
  sheet.mergeCells(TITLE_ROW, 2, TITLE_ROW, Math.max(2, lastColumn));
  sheet.mergeCells(SUBTITLE_ROW, 2, SUBTITLE_ROW, Math.max(2, lastColumn));

  const titleCell = sheet.getCell(TITLE_ROW, 2);
  titleCell.value = model.title;
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: TITLE_COLOR } };
  titleCell.alignment = { vertical: 'middle' };

  const subtitleCell = sheet.getCell(SUBTITLE_ROW, 2);
  subtitleCell.value = model.subtitle;
  subtitleCell.font = { size: 10, italic: true, color: { argb: argb(palette.olive) } };
  subtitleCell.alignment = { vertical: 'middle' };

  const headerRow = sheet.getRow(HEADER_ROW);
  headerRow.values = model.columns.map((c) => c.header);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  model.rows.forEach((cells, index) => {
    const row = sheet.getRow(HEADER_ROW + 1 + index);
    row.values = cells.map((cell, i) =>
      model.columns[i]!.type === 'boolean' ? (cell ? 'Sí' : 'No') : (cell ?? null),
    );
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const column = model.columns[columnNumber - 1];
      if (!column) return;
      // Guarded on the value, not just the column: a date answer that failed to
      // parse falls back to text, and stamping a date format on a string cell
      // makes Excel render it as garbage.
      if (column.type === 'date' && cell.value instanceof Date) cell.numFmt = DATE_FORMAT;
      // A partial birth date ('Marzo 1980') arrives as text and keeps it.
      if (column.type === 'dateOnly' && cell.value instanceof Date) cell.numFmt = DATE_ONLY_FORMAT;
      if (column.type === 'euros' && typeof cell.value === 'number') cell.numFmt = EUROS_FORMAT;
      // Phone numbers are text: Excel would otherwise eat the leading zero of
      // a landline and render long numbers in scientific notation.
      if (column.key === 'phone') cell.alignment = { horizontal: 'left' };
      if (index % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } };
      }
      cell.border = { bottom: { style: 'hair', color: { argb: BORDER_COLOR } } };
    });
  });

  // Autofilter over the header + data block so the organizer can slice by
  // status or "del pueblo" without touching the file.
  const lastDataRow = HEADER_ROW + model.rows.length;
  if (model.rows.length > 0) {
    sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: lastDataRow, column: lastColumn } };
  }

  const totalsCell = sheet.getCell(lastDataRow + 2, 1);
  totalsCell.value = model.summary;
  totalsCell.font = { bold: true, color: { argb: argb(palette.olive) } };
  sheet.mergeCells(lastDataRow + 2, 1, lastDataRow + 2, Math.max(2, lastColumn));

  return workbook.xlsx.writeBuffer();
}
