import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { readTable } from '../import-socios.mjs';
import {
  cellText,
  detectDelimiter,
  mapColumns,
  nameKey,
  parseAlta,
  parsePhone,
  planImport,
  recordsFromTable,
} from '../lib/socio-import.mjs';

const row = (over) => ({ id: 'r', kind: 'typed', displayName: 'X', socioNumber: null, bajaAt: null, phone: null, email: null, ...over });
const rec = (over) => ({ line: 2, name: 'X', socioNumber: null, numberInvalid: false, phone: null, email: null, altaAt: null, notes: [], ...over });

test('finds the columns by header, whatever their spelling', () => {
  const cols = mapColumns(['Nº de socio', 'NOMBRE', 'Apellidos', 'Teléfono móvil', 'Correo electrónico', 'Fecha de alta']);
  assert.deepEqual(cols, { socioNumber: 0, name: 1, surname: [2], phone: 3, email: 4, alta: 5 });
  assert.equal(mapColumns(['Nombre', 'Móvil']).phone, 1);
  assert.throws(() => mapColumns(['Teléfono']), /No name column/);
});

test('reads lines: joins surnames, normalizes phones and emails, notes what it drops', () => {
  const records = recordsFromTable([
    ['Nº', 'Nombre', 'Apellidos', 'Teléfono', 'Email', 'Alta'],
    ['12', 'Ana', 'Pérez García', '600 11 22 33', 'Ana@Correo.ES', '01/03/1998'],
    ['', '', '', '', '', ''],
    ['13.0', 'Luis', '', 'fijo', 'no-es-un-email', '31/02/2001'],
    ['x', 'Pepe', '', '0034 699 000 111 / 600 000 000', '', ''],
  ]);
  assert.equal(records.length, 3);
  assert.deepEqual(records[0], {
    line: 2, name: 'Ana Pérez García', socioNumber: 12, numberInvalid: false, phone: '+34600112233',
    email: 'ana@correo.es', altaAt: new Date(Date.UTC(1998, 2, 1, 12)), notes: [],
  });
  assert.equal(records[1].line, 4);
  assert.equal(records[1].socioNumber, 13);
  assert.equal(records[1].phone, null);
  assert.equal(records[1].email, null);
  assert.equal(records[1].altaAt, null);
  assert.equal(records[1].notes.length, 3);
  assert.equal(records[2].numberInvalid, true);
  assert.equal(records[2].phone, '+34699000111');
});

test('cells from exceljs: numbers, dates, rich text, formulas', () => {
  assert.equal(cellText(600112233), '600112233');
  assert.equal(cellText(new Date(Date.UTC(2020, 0, 5))), '2020-01-05');
  assert.equal(cellText({ richText: [{ text: 'An' }, { text: 'a' }] }), 'Ana');
  assert.equal(cellText({ formula: 'A1', result: 7 }), '7');
  assert.equal(cellText({ text: 'a@b.es', hyperlink: 'mailto:a@b.es' }), 'a@b.es');
  assert.equal(cellText(null), '');
});

test('small parsers', () => {
  assert.equal(detectDelimiter('Nombre;Teléfono;Email\nAna;600,1;x'), ';');
  assert.equal(detectDelimiter('Nombre,Teléfono\nAna,600'), ',');
  assert.equal(nameKey('  José  PÉREZ-Gil '), 'jose perez gil');
  assert.equal(parsePhone('+44 7700 900123'), '+447700900123');
  assert.deepEqual(parseAlta('2001-07-09'), new Date(Date.UTC(2001, 6, 9, 12)));
  assert.equal(parseAlta('ayer'), null);
});

test('an empty roster: every line is new, numberless lines numbered after the highest', () => {
  const plan = planImport([rec({ line: 2, name: 'Ana', socioNumber: 7 }), rec({ line: 3, name: 'Luis' }), rec({ line: 4, name: 'Eva' })], [], 3);
  assert.deepEqual(plan.creates.map((c) => [c.record.name, c.socioNumber]), [['Ana', 7], ['Luis', 8], ['Eva', 9]]);
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.conflicts, []);
});

test('re-running the same file changes nothing', () => {
  const records = [rec({ line: 2, name: 'Ana Pérez', socioNumber: 7, phone: '+34600112233' }), rec({ line: 3, name: 'Luis', phone: '+34600999888' })];
  const roster = [
    row({ id: 'a', displayName: 'Ana Pérez', socioNumber: 7, phone: '+34600112233' }),
    row({ id: 'l', displayName: 'Luis', socioNumber: 8, phone: '+34600999888' }),
  ];
  const plan = planImport(records, roster, 8);
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.unchanged.map((u) => u.socioId), ['a', 'l']);
});

test('matches by number and fills in only what is missing', () => {
  const plan = planImport(
    [rec({ name: 'ana perez', socioNumber: 7, phone: '+34600112233', email: 'a@x.es' })],
    [row({ id: 'a', displayName: 'Ana Pérez', socioNumber: 7, email: 'otra@x.es' })],
  );
  assert.equal(plan.updates.length, 1);
  assert.deepEqual(plan.updates[0].socio, {});
  assert.deepEqual(plan.updates[0].contact, { phone: '+34600112233' });
  assert.match(plan.updates[0].notes.join(), /email guardado/);
});

test('a phone stored as the admin typed it still matches the normalized one', () => {
  const plan = planImport([rec({ name: 'Laura', socioNumber: 101, phone: '+34600000101' })], [row({ id: 'l', displayName: 'Laura', phone: '600 000 101', email: 'L@X.es' })]);
  assert.deepEqual(plan.updates.map((u) => [u.socioId, u.socio, u.contact]), [['l', { socioNumber: 101 }, {}]]);
});

test('a number held by someone else is a conflict, not an overwrite', () => {
  const plan = planImport([rec({ name: 'Luis', socioNumber: 7 })], [row({ id: 'a', displayName: 'Ana', socioNumber: 7 })]);
  assert.equal(plan.conflicts.length, 1);
  assert.match(plan.conflicts[0].reason, /ya es de Ana/);
  assert.deepEqual(plan.creates, []);
});

test('a baja keeps its number: matched, left alone', () => {
  const plan = planImport([rec({ name: 'Ana', socioNumber: 7, phone: '+34600112233' })], [row({ id: 'a', displayName: 'Ana', socioNumber: 7, bajaAt: new Date() })]);
  assert.equal(plan.unchanged.length, 1);
  assert.match(plan.unchanged[0].notes.join(), /baja/);
});

test('numbers a member row that has none, never touching its contact data', () => {
  const plan = planImport(
    [rec({ name: 'Ana', socioNumber: 7, phone: '+34600112233' })],
    [row({ id: 'm', kind: 'member', displayName: 'Ana', phone: null })],
  );
  assert.deepEqual(plan.updates[0].socio, { socioNumber: 7 });
  assert.deepEqual(plan.updates[0].contact, {});
});

test('a shared household phone does not merge two socios', () => {
  const plan = planImport(
    [rec({ name: 'Juan', phone: '+34600112233' })],
    [row({ id: 'a', displayName: 'Ana', phone: '+34600112233', socioNumber: 1 })],
    1,
  );
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].socioNumber, 2);
});

test('homonyms: the one sharing the phone wins; otherwise ask for the number', () => {
  const roster = [
    row({ id: 'a1', displayName: 'Ana', phone: '+34600000001' }),
    row({ id: 'a2', displayName: 'Ana', phone: '+34600000002' }),
    row({ id: 'a3', displayName: 'Ana' }),
  ];
  assert.equal(planImport([rec({ name: 'Ana', phone: '+34600000002' })], roster).unchanged[0].socioId, 'a2');
  assert.match(planImport([rec({ name: 'Ana' })], roster).conflicts[0].reason, /3 socios llamados/);
});

test('a same-name row with another number is a conflict', () => {
  const plan = planImport([rec({ name: 'Ana', socioNumber: 9 })], [row({ id: 'a', displayName: 'Ana', socioNumber: 3 })]);
  assert.match(plan.conflicts[0].reason, /ya tiene el nº 3/);
});

test('a number twice in the file, a blank name or a bad number are skipped', () => {
  const plan = planImport([
    rec({ line: 2, name: 'Ana', socioNumber: 4 }),
    rec({ line: 3, name: 'Luis', socioNumber: 4 }),
    rec({ line: 4, name: '' }),
    rec({ line: 5, name: 'Eva', numberInvalid: true, notes: ['nº "x" no válido'] }),
  ]);
  assert.deepEqual(plan.creates.map((c) => c.line), [2]);
  assert.deepEqual(plan.conflicts.map((c) => c.line), [3, 4, 5]);
  assert.match(plan.conflicts[0].reason, /línea 2/);
});

test('two numberless lines of one name, one row: the row and a namesake', () => {
  const plan = planImport([rec({ line: 2, name: 'Ana' }), rec({ line: 3, name: 'Ana' })], [row({ id: 'a', displayName: 'Ana' })]);
  assert.equal(plan.unchanged.length, 1);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.creates.length, 1);
});

test('reads a CSV with semicolons and a BOM, and the first sheet of an XLSX', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-socios-'));
  const csv = path.join(dir, 'socios.csv');
  fs.writeFileSync(csv, '﻿Nº socio;Nombre;Teléfono\n1;Ana Pérez;600112233\n2;"Luis; el de la tienda";\n');
  assert.deepEqual(recordsFromTable(await readTable(csv)).map((r) => [r.socioNumber, r.name, r.phone]), [
    [1, 'Ana Pérez', '+34600112233'],
    [2, 'Luis; el de la tienda', null],
  ]);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Socios');
  sheet.addRow(['Número de socio', 'Nombre', 'Apellidos', 'Móvil', 'Fecha de alta']);
  sheet.addRow([3, 'Eva', 'Gil', 600112244, new Date(Date.UTC(2010, 4, 2))]);
  const xlsx = path.join(dir, 'socios.xlsx');
  await workbook.xlsx.writeFile(xlsx);
  const [eva] = recordsFromTable(await readTable(xlsx));
  assert.deepEqual([eva.socioNumber, eva.name, eva.phone, eva.altaAt], [3, 'Eva Gil', '+34600112244', new Date(Date.UTC(2010, 4, 2, 12))]);
  fs.rmSync(dir, { recursive: true, force: true });
});
