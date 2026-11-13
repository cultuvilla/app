import { toCsv, type RosterExportModel } from '@cultuvilla/shared/export/rosterExport';
import { downloadFile } from './downloadFile';
import { buildRosterWorkbook, XLSX_MIME } from './rosterWorkbook';

export type ExportFormat = 'xlsx' | 'csv';

/** Writes an export model as Excel or CSV and hands it to the share sheet. */
export async function runExport(model: RosterExportModel, format: ExportFormat): Promise<void> {
  if (format === 'csv') {
    await downloadFile(toCsv(model), `${model.fileName}.csv`, 'text/csv;charset=utf-8');
    return;
  }
  // buildRosterWorkbook defers ExcelJS behind a dynamic import, so the heavy
  // dependency stays out of the initial bundle.
  await downloadFile(await buildRosterWorkbook(model), `${model.fileName}.xlsx`, XLSX_MIME);
}
