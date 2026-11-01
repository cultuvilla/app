#!/usr/bin/env node
/**
 * Loads a group's socio list — a CSV or an XLSX (first sheet) — into its
 * roster as typed socios: `organizations/{orgId}/socios` (name, socio number,
 * alta) and `socioPrivate` (phone, email). For a group whose socios mostly do
 * not have the app yet, like La Anduela with its paper libro.
 *
 * Columns are found by their header, in any order and case: a name
 * ("Nombre", optionally with "Apellidos"), and optionally "Nº socio",
 * "Teléfono"/"Móvil", "Email"/"Correo" and "Fecha de alta" (dd/mm/yyyy).
 * Phones are normalized like the app's (`normalizeLeadPhone`, +34 by default).
 *
 * Idempotent: a re-run matches every line to the row it made (see
 * lib/socio-import.mjs for how) and only fills in what is missing. Lines it
 * cannot place safely are reported as conflicts and skipped.
 *
 * Dry run by default — prints the plan and writes nothing. Beta and prod also
 * need --confirm. Not a registered backfill: it loads one group's own data at
 * the junta's request, it does not migrate a schema.
 *
 *   node scripts/import-socios.mjs --file=socios.xlsx --org=<orgId> [--env=dev] [--apply] [--confirm]
 *     [--created-by=<uid>]   who the rows say typed them in (default: the org's founder)
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import admin from 'firebase-admin';
import { buildSocioData, buildSocioPrivateData, hasSocioRoster } from '@cultuvilla/shared/models';
import { initAdminForEnv, resolveEnv } from './lib/env-credentials.mjs';
import { isMain, requireConfirmForSharedEnv } from './lib/backfill-harness.mjs';
import { BatchWriter } from './lib/backfill.mjs';
import { detectDelimiter, planImport, recordsFromTable } from './lib/socio-import.mjs';

function arg(name) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const flag = (name) => process.argv.includes(`--${name}`);

export async function readTable(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error(`${file} has no sheet`);
    const table = [];
    sheet.eachRow({ includeEmpty: true }, (row, n) => {
      // exceljs rows are 1-based with a hole at 0.
      table[n - 1] = Array.from({ length: row.cellCount }, (_, i) => row.getCell(i + 1).value);
    });
    return Array.from(table, (r) => r ?? []);
  }
  if (ext === '.csv' || ext === '.txt') {
    const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    return parseCsv(text, { delimiter: detectDelimiter(text), relax_column_count: true, skip_empty_lines: false, trim: true });
  }
  throw new Error(`Unsupported file type "${ext}" — use .csv or .xlsx`);
}

async function main() {
  const file = arg('file');
  const orgId = arg('org');
  const env = resolveEnv(arg('env') ?? 'dev');
  const apply = flag('apply');
  if (!file || !orgId) {
    console.error('Usage: node scripts/import-socios.mjs --file=<csv|xlsx> --org=<orgId> [--env=dev|beta|prod] [--apply] [--confirm] [--created-by=<uid>]');
    process.exit(2);
  }
  if (apply) requireConfirmForSharedEnv(env, flag('confirm'));

  const records = recordsFromTable(await readTable(file));
  const { projectId } = initAdminForEnv(env);
  const db = admin.firestore();
  const orgRef = db.doc(`organizations/${orgId}`);
  const org = (await orgRef.get()).data();
  if (!org) throw new Error(`organizations/${orgId} does not exist on ${projectId}`);
  if (!hasSocioRoster(org.type)) throw new Error(`${org.name} is a ${org.type}: it keeps no socio roster`);
  const createdBy = arg('created-by') ?? org.requestedBy;

  const [sociosSnap, privatesSnap, counterSnap] = await Promise.all([
    orgRef.collection('socios').get(),
    orgRef.collection('socioPrivate').get(),
    orgRef.collection('socioNumbering').doc('current').get(),
  ]);
  const privates = new Map(privatesSnap.docs.map((d) => [d.id, d.data()]));
  const roster = sociosSnap.docs.map((d) => {
    const s = d.data();
    const p = privates.get(d.id);
    return {
      id: d.id,
      kind: s.kind,
      displayName: s.displayName ?? '',
      socioNumber: s.socioNumber ?? null,
      bajaAt: s.bajaAt ?? null,
      phone: p?.phone ?? null,
      email: p?.email ?? null,
    };
  });
  const plan = planImport(records, roster, counterSnap.get('lastNumber') ?? 0);

  console.log(`${apply ? 'IMPORT' : 'DRY RUN'} — ${org.name} (${orgId}) on ${projectId}: ${records.length} lines, ${roster.length} rows already in the roster`);
  for (const c of plan.creates) {
    console.log(`  + línea ${c.line}: nº ${c.socioNumber} ${c.record.name}${[c.record.phone, c.record.email].filter(Boolean).map((x) => ` · ${x}`).join('')}${c.notes.length ? `  (${c.notes.join('; ')})` : ''}`);
  }
  for (const u of plan.updates) {
    const what = [...Object.entries(u.socio), ...Object.entries(u.contact)].map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`  ~ línea ${u.line}: ${u.name} — ${what}${u.notes.length ? `  (${u.notes.join('; ')})` : ''}`);
  }
  for (const u of plan.unchanged) if (u.notes.length) console.log(`  = línea ${u.line}: ${u.name}  (${u.notes.join('; ')})`);
  for (const c of plan.conflicts) console.log(`  ! línea ${c.line}: ${c.name ?? ''} — ${c.reason}`);
  console.log(`  ${plan.creates.length} new, ${plan.updates.length} filled in, ${plan.unchanged.length} already there, ${plan.conflicts.length} skipped`);

  if (!apply) {
    console.log('  Nothing written. Re-run with --apply to import.');
    return plan;
  }

  const writer = new BatchWriter(db, { apply });
  for (const c of plan.creates) {
    const ref = orgRef.collection('socios').doc();
    await writer.set(
      ref,
      buildSocioData({
        kind: 'typed',
        socioNumber: c.socioNumber,
        displayName: c.record.name,
        altaAt: c.record.altaAt ?? new Date(),
        createdBy,
      }),
    );
    await writer.set(orgRef.collection('socioPrivate').doc(ref.id), buildSocioPrivateData({ phone: c.record.phone, email: c.record.email }));
  }
  for (const u of plan.updates) {
    if (Object.keys(u.socio).length) await writer.update(orgRef.collection('socios').doc(u.socioId), u.socio);
    if (Object.keys(u.contact).length) {
      const current = privates.get(u.socioId);
      await writer.set(
        orgRef.collection('socioPrivate').doc(u.socioId),
        buildSocioPrivateData({ phone: current?.phone ?? null, email: current?.email ?? null, ...u.contact }),
      );
    }
  }
  await writer.flush();
  console.log(`  Written: ${plan.creates.length} new socios, ${plan.updates.length} filled in.`);
  return plan;
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
