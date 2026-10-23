import ExcelJS from 'exceljs';
import { buildRosterWorkbook, XLSX_MIME } from '../rosterWorkbook';
import type { RosterExportModel } from '@cultuvilla/shared/export/rosterExport';

// jest can't execute the production dynamic import, so the loader seam hands
// back the real library statically — the workbook under test is genuine.
jest.mock('../loadExcelJs', () => ({
  loadExcelJs: async () => require('exceljs'),
}));

const model: RosterExportModel = {
  fileName: 'asistentes-fiesta-de-san-juan',
  title: 'Fiesta de San Juan',
  subtitle: 'Evento: 24 de junio de 2026',
  sheetName: 'Fiesta de San Juan',
  columns: [
    { key: 'position', header: 'Nº', type: 'number', width: 6 },
    { key: 'name', header: 'Nombre', type: 'text', width: 32 },
    { key: 'status', header: 'Estado', type: 'text', width: 16 },
    { key: 'isMember', header: 'Del pueblo', type: 'boolean', width: 12 },
    { key: 'phone', header: 'Teléfono', type: 'text', width: 16 },
    { key: 'registeredAt', header: 'Fecha de alta', type: 'date', width: 20 },
  ],
  rows: [
    [1, 'Ana Pérez', 'Confirmado', true, '600111222', new Date('2026-07-02T10:30:00Z')],
    [2, 'Luis Gómez', 'Lista de espera', false, null, new Date('2026-07-03T08:00:00Z')],
  ],
  summary: 'Confirmados: 1   ·   Lista de espera: 1   ·   Total: 2',
};

/** Round-trip the bytes through ExcelJS: if Excel couldn't parse it, nor can this. */
async function readBack(bytes: ArrayBuffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  return workbook.worksheets[0]!;
}

describe('buildRosterWorkbook', () => {
  it('produces a workbook Excel can parse, with the roster on the first sheet', async () => {
    const sheet = await readBack(await buildRosterWorkbook(model));

    expect(sheet.name).toBe('Fiesta de San Juan');
    expect(sheet.getCell(1, 2).value).toBe('Fiesta de San Juan');
    expect(sheet.getRow(4).values).toEqual(
      expect.arrayContaining(['Nº', 'Nombre', 'Estado', 'Del pueblo', 'Teléfono', 'Fecha de alta']),
    );
    expect(sheet.getCell(5, 2).value).toBe('Ana Pérez');
    expect(sheet.getCell(6, 3).value).toBe('Lista de espera');
  });

  it('stamps the Cultuvilla logo into the sheet', async () => {
    const sheet = await readBack(await buildRosterWorkbook(model));

    expect(sheet.getImages()).toHaveLength(1);
  });

  it('writes dates as real date cells so Excel can sort and reformat them', async () => {
    const sheet = await readBack(await buildRosterWorkbook(model));
    const cell = sheet.getCell(5, 6);

    expect(cell.value).toBeInstanceOf(Date);
    expect(cell.numFmt).toBe('dd/mm/yyyy hh:mm');
  });

  it('renders booleans as Sí/No rather than TRUE/FALSE', async () => {
    const sheet = await readBack(await buildRosterWorkbook(model));

    expect(sheet.getCell(5, 4).value).toBe('Sí');
    expect(sheet.getCell(6, 4).value).toBe('No');
  });

  it('adds an autofilter over the header and data block', async () => {
    const sheet = await readBack(await buildRosterWorkbook(model));

    expect(sheet.autoFilter).toBe('A4:F6');
  });

  it('closes with the confirmed / waitlist / total tally', async () => {
    const sheet = await readBack(await buildRosterWorkbook(model));

    expect(String(sheet.getCell(8, 1).value)).toContain('Confirmados: 1');
    expect(String(sheet.getCell(8, 1).value)).toContain('Total: 2');
  });

  it('handles an empty roster without an autofilter over zero rows', async () => {
    const sheet = await readBack(await buildRosterWorkbook({ ...model, rows: [], summary: 'Confirmados: 0   ·   Lista de espera: 0   ·   Total: 0' }));

    expect(sheet.autoFilter).toBeUndefined();
    expect(String(sheet.getCell(6, 1).value)).toContain('Total: 0');
  });

  it('declares the spreadsheet mime type browsers map to Excel', () => {
    expect(XLSX_MIME).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
});
