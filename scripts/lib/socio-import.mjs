/**
 * The pure half of `scripts/import-socios.mjs`: reading a group's socio list
 * (a CSV or the first sheet of an XLSX, as a table of cells) and deciding,
 * line by line, what the import does against the roster already there.
 *
 * Matching, strongest first — so a re-run changes nothing and never
 * duplicates:
 *   1. the socio number: the row with that number (bajas included — a number
 *      is never reused). Same name → that row; a different name → conflict.
 *   2. otherwise an active row with the same name (accents and case aside)
 *      whose number and contact data do not contradict the line, preferring
 *      one that shares its phone or email. Two such rows → conflict.
 *   3. otherwise a new typed socio.
 * Phone or email alone never match: a household often shares one, and two
 * socios of one house are two socios.
 *
 * A matched row is only filled in, never overwritten: a missing number, and
 * on a typed row a missing phone or email. Member rows' contact data is the
 * member's own answer and is left alone. New lines without a number get the
 * next ones after every number in the roster and the file.
 */

import { normalizeLeadPhone, SOCIO_NUMBER_MAX } from '@cultuvilla/shared/models';

const HEADERS = {
  socioNumber: ['n', 'no', 'num', 'numero', 'nsocio', 'nosocio', 'numsocio', 'numerosocio', 'ndesocio', 'nodesocio', 'numerodesocio'],
  name: ['nombre', 'nombreyapellidos', 'nombrecompleto', 'nombreapellidos', 'apellidosynombre', 'name', 'socio', 'socioa'],
  surname: ['apellidos', 'apellido', 'apellido1', 'apellido2', 'primerapellido', 'segundoapellido'],
  phone: ['telefono', 'tel', 'tfno', 'tlf', 'telf', 'movil', 'telefonomovil', 'celular', 'phone', 'whatsapp'],
  email: ['email', 'correo', 'correoelectronico', 'mail'],
  alta: ['alta', 'fechaalta', 'fechadealta', 'altaen', 'fechadeingreso', 'ingreso'],
};

/** Lowercase, no accents, letters and digits only: "Nº de socio" → "nodesocio". */
export function headerKey(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** How names compare: "José  PÉREZ" and "jose perez" are one person. */
export function nameKey(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Which column holds what, from the header row. Throws without a name column. */
export function mapColumns(headerRow) {
  const columns = { socioNumber: -1, name: -1, surname: [], phone: -1, email: -1, alta: -1 };
  headerRow.forEach((cell, i) => {
    const key = headerKey(cell);
    for (const [field, aliases] of Object.entries(HEADERS)) {
      if (!aliases.includes(key)) continue;
      if (field === 'surname') columns.surname.push(i);
      else if (columns[field] === -1) columns[field] = i;
    }
  });
  if (columns.name === -1) throw new Error(`No name column in the header (${headerRow.join(' | ')}). Expected one of: ${HEADERS.name.join(', ')}.`);
  return columns;
}

/** A cell as text: exceljs hands rich text, hyperlinks and formula results as objects. */
export function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return cellText(value.text);
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('');
    return '';
  }
  return String(value).trim();
}

/** The first number in a phone cell that `normalizeLeadPhone` accepts ("600 11 22 33 / 600 44 55 66" → the first). */
export function parsePhone(text) {
  for (const part of String(text ?? '').split(/[/,;|]|\sy\s|\so\s/)) {
    const phone = normalizeLeadPhone(part);
    if (phone) return phone;
  }
  return null;
}

export function parseEmail(text) {
  const email = String(text ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** "dd/mm/yyyy", "yyyy-mm-dd" (an XLSX date arrives as the latter) → a noon-UTC Date, else null. */
export function parseAlta(text) {
  const t = String(text ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  let [y, mo, d] = m ? [m[1], m[2], m[3]] : [];
  if (!m) {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
    if (m) [d, mo, y] = [m[1], m[2], m[3]];
  }
  if (!m) return null;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12));
  return date.getUTCDate() === Number(d) && date.getUTCMonth() === Number(mo) - 1 ? date : null;
}

/**
 * A table (header row first) → one record per non-blank line, with what was
 * dropped noted. `line` is the 1-based line of the file, as a spreadsheet
 * shows it.
 */
export function recordsFromTable(table) {
  const [header = [], ...body] = table;
  const columns = mapColumns(header.map(cellText));
  const records = [];
  body.forEach((raw, i) => {
    const cells = raw.map(cellText);
    if (cells.every((c) => c === '')) return;
    const at = (index) => (index >= 0 ? (cells[index] ?? '') : '');
    const name = [at(columns.name), ...columns.surname.map(at)].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const notes = [];
    const numberText = at(columns.socioNumber).replace(/\.0+$/, '');
    let socioNumber = null;
    if (numberText !== '') {
      const n = Number(numberText);
      if (Number.isInteger(n) && n >= 1 && n <= SOCIO_NUMBER_MAX) socioNumber = n;
      else notes.push(`nº "${numberText}" no válido`);
    }
    const phoneText = at(columns.phone);
    const phone = parsePhone(phoneText);
    if (phoneText && !phone) notes.push(`teléfono "${phoneText}" no válido, no se guarda`);
    const emailText = at(columns.email);
    const email = parseEmail(emailText);
    if (emailText && !email) notes.push(`email "${emailText}" no válido, no se guarda`);
    const altaText = at(columns.alta);
    const altaAt = parseAlta(altaText);
    if (altaText && !altaAt) notes.push(`fecha de alta "${altaText}" no válida, se usa hoy`);
    records.push({ line: i + 2, name, socioNumber, numberInvalid: numberText !== '' && socioNumber === null, phone, email, altaAt, notes });
  });
  return records;
}

/** Semicolon or comma, whichever the header line uses more. */
export function detectDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  return (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ',';
}

const compatible = (have, want) => have === null || want === null || have === want;

/**
 * What the import does with each record.
 *
 * @param records from `recordsFromTable`
 * @param roster every socio row of the group: `{ id, kind, displayName,
 *   socioNumber, bajaAt, phone, email }` (contact from socioPrivate, null if none)
 * @param lastNumber the org's socio-number counter (0 if none)
 * @returns `{ creates, updates, unchanged, conflicts }`, each entry naming its `line`
 */
export function planImport(records, rosterIn = [], lastNumber = 0) {
  // Stored contact data was typed in the app as the admin wrote it.
  const roster = rosterIn.map((r) => ({
    ...r,
    phone: r.phone ? (parsePhone(r.phone) ?? r.phone) : null,
    email: r.email ? r.email.trim().toLowerCase() : null,
  }));
  const creates = [];
  const updates = [];
  const unchanged = [];
  const conflicts = [];
  const claimed = new Set();
  const byNumber = new Map(roster.filter((r) => r.socioNumber !== null).map((r) => [r.socioNumber, r]));
  const fileNumbers = new Map();

  for (const rec of records) {
    if (!rec.name) {
      conflicts.push({ line: rec.line, reason: 'sin nombre' });
      continue;
    }
    if (rec.numberInvalid) {
      conflicts.push({ line: rec.line, name: rec.name, reason: rec.notes[0] });
      continue;
    }
    if (rec.socioNumber !== null) {
      const first = fileNumbers.get(rec.socioNumber);
      if (first !== undefined) {
        conflicts.push({ line: rec.line, name: rec.name, reason: `el nº ${rec.socioNumber} ya está en la línea ${first}` });
        continue;
      }
      fileNumbers.set(rec.socioNumber, rec.line);
    }

    let match = null;
    if (rec.socioNumber !== null && byNumber.has(rec.socioNumber)) {
      const row = byNumber.get(rec.socioNumber);
      if (nameKey(row.displayName) !== nameKey(rec.name)) {
        conflicts.push({ line: rec.line, name: rec.name, reason: `el nº ${rec.socioNumber} ya es de ${row.displayName}` });
        continue;
      }
      match = row;
    } else {
      const candidates = roster.filter(
        (r) =>
          r.bajaAt === null &&
          !claimed.has(r.id) &&
          nameKey(r.displayName) === nameKey(rec.name) &&
          compatible(r.socioNumber, rec.socioNumber) &&
          compatible(r.phone, rec.phone) &&
          compatible(r.email, rec.email),
      );
      const sharing = candidates.filter((r) => (rec.phone && r.phone === rec.phone) || (rec.email && r.email === rec.email));
      const pick = sharing.length === 1 ? sharing : candidates;
      if (pick.length > 1) {
        conflicts.push({ line: rec.line, name: rec.name, reason: `hay ${pick.length} socios llamados ${rec.name}; pon su nº en el fichero` });
        continue;
      }
      match = pick[0] ?? null;
      const numbered = match
        ? undefined
        : roster.find(
            (r) => r.bajaAt === null && !claimed.has(r.id) && nameKey(r.displayName) === nameKey(rec.name) && r.socioNumber !== null && rec.socioNumber !== null,
          );
      if (numbered) {
        conflicts.push({ line: rec.line, name: rec.name, reason: `${numbered.displayName} ya tiene el nº ${numbered.socioNumber}` });
        continue;
      }
    }

    if (!match) {
      creates.push({ line: rec.line, record: rec, socioNumber: rec.socioNumber, notes: rec.notes });
      continue;
    }
    if (claimed.has(match.id)) {
      conflicts.push({ line: rec.line, name: rec.name, reason: `${match.displayName} ya está en otra línea` });
      continue;
    }
    claimed.add(match.id);
    const socio = {};
    const contact = {};
    if (match.socioNumber === null && rec.socioNumber !== null) socio.socioNumber = rec.socioNumber;
    if (match.kind === 'typed' && match.bajaAt === null) {
      if (match.phone === null && rec.phone) contact.phone = rec.phone;
      if (match.email === null && rec.email) contact.email = rec.email;
    }
    const notes = [...rec.notes];
    if (match.bajaAt !== null) notes.push('está de baja; no se cambia');
    if (match.phone && rec.phone && match.phone !== rec.phone) notes.push(`el teléfono guardado (${match.phone}) es otro; no se cambia`);
    if (match.email && rec.email && match.email !== rec.email) notes.push(`el email guardado (${match.email}) es otro; no se cambia`);
    if (Object.keys(socio).length === 0 && Object.keys(contact).length === 0) {
      unchanged.push({ line: rec.line, socioId: match.id, name: match.displayName, notes });
    } else {
      updates.push({ line: rec.line, socioId: match.id, kind: match.kind, name: match.displayName, socio, contact, notes });
    }
  }

  // Lines without a number take the next ones, past every number already used.
  let next = Math.max(lastNumber, ...roster.map((r) => r.socioNumber ?? 0), ...fileNumbers.keys());
  for (const c of creates) if (c.socioNumber === null) c.socioNumber = ++next;

  return { creates, updates, unchanged, conflicts };
}
