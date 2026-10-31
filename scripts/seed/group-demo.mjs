#!/usr/bin/env node
/**
 * Fills one group with demo toolkit data so the Grupos tab can be looked at:
 * the user becomes its admin (tesorero) and gets a second group to switch to;
 * the group gets typed socios, a cuota with payments, tasks, notices, actas,
 * year entries and events. Dev only (villa-events), idempotent.
 *
 *   GROUP_DEMO_EMAIL=you@example.com GROUP_DEMO_ORG=<orgId> [GROUP_DEMO_SECOND_ORG=<orgId>] \
 *     pnpm seed:dev:group-demo [--wipe]
 *
 * Every doc but the memberships has a `seed-gd-` id and `seedBatch: group-demo`;
 * `--wipe` deletes them by id. Memberships are left in place (leaving the group
 * is the user's call) — the roster trigger owns the user's socio row either way.
 * Reminders stay off, and typed socios carry no email, so nothing is sent.
 */
import {
  buildActaData,
  buildEventData,
  buildLocationData,
  buildCuotaAssignmentData,
  buildCuotaPaymentData,
  buildCuotaSettingsData,
  buildGroupTaskData,
  buildLedgerEntryData,
  buildSocioData,
  buildSocioPrivateData,
} from '@cultuvilla/shared/models';
import { GeoPoint, WIPE, db, uidForEmail } from './lib/context.mjs';
import { runAsMain } from './lib/run.mjs';

const BATCH = 'group-demo';
const tag = (data) => ({ ...data, seedBatch: BATCH });
const id = (kind, n) => `seed-gd-${kind}-${String(n).padStart(2, '0')}`;

const TYPED = [
  ['Laura Prieto Ruiz', '2009-04-02'],
  ['Carlos Moreno Vidal', '2011-06-15'],
  ['Elena Castro Navas', '2004-09-01'],
  ['Javier Ortega Peña', '2015-03-20'],
  ['Teresa Blanco Ríos', '2002-11-11'],
  ['Pablo Serrano Luna', '2018-07-30'],
  ['Inés Delgado Mora', '2012-01-08'],
  ['Ramón Vega Campos', '2003-05-05'],
  ['Pilar Cano Fuentes', '2006-08-14'],
  ['Hugo Molina Rey', '2021-12-01'],
  ['Sara Iglesias Paz', '2019-02-27'],
  ['Diego Romero Sáez', '2024-08-16'],
];
const PHONES = { 1: '600000101', 3: '600000103', 5: '600000105', 8: '600000108' };
const JUBILADOS = new Set([5, 8, 9]);
const EXEMPT = new Set([10]);
// Socios (1-based) who paid each year; the user owes 2026.
const PAID_2025 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11];
const PAID_2026 = [1, 2, 3, 5, 6, 8, 9, 12];
const METHODS = ['bizum', 'transferencia', 'efectivo'];

function dayKey(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

async function waitForMemberRow(orgId, uid) {
  for (let i = 0; i < 30; i++) {
    const snap = await db.collection(`organizations/${orgId}/socios`).where('uid', '==', uid).where('bajaAt', '==', null).get();
    if (!snap.empty) return snap.docs[0];
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function join(orgId, uid, role) {
  const ref = db.doc(`organizations/${orgId}/members/${uid}`);
  const snap = await ref.get();
  if (snap.exists) {
    if (snap.data().role !== role) await ref.update({ role });
    return;
  }
  await ref.set({ userId: uid, role, joinedAt: new Date() });
}

function refsFor(orgId) {
  const o = `organizations/${orgId}`;
  const refs = [db.doc(`${o}/cuotaSettings/current`)];
  TYPED.forEach((_, i) => {
    refs.push(db.doc(`${o}/socios/${id('socio', i + 1)}`), db.doc(`${o}/socioPrivate/${id('socio', i + 1)}`));
    refs.push(db.doc(`${o}/cuotaAssignments/${id('socio', i + 1)}`));
    refs.push(db.doc(`${o}/cuotaPayments/${id('pay25', i + 1)}`), db.doc(`${o}/cuotaPayments/${id('pay26', i + 1)}`));
  });
  refs.push(db.doc(`${o}/cuotaPayments/${id('pay25', 0)}`));
  for (let n = 1; n <= 6; n++) refs.push(db.doc(`${o}/tasks/${id('task', n)}`));
  for (let n = 1; n <= 3; n++) refs.push(db.doc(`${o}/messages/${id('msg', n)}`));
  for (let n = 1; n <= 2; n++) refs.push(db.doc(`${o}/actas/${id('acta', n)}`));
  for (let n = 1; n <= 4; n++) refs.push(db.doc(`${o}/ledgerEntries/${id('entry', n)}`));
  for (let n = 1; n <= 3; n++) refs.push(db.doc(`events/${id(`event-${orgId}`, n)}`));
  return refs;
}

async function wipe(orgId, uid) {
  const batch = db.batch();
  for (const ref of refsFor(orgId)) batch.delete(ref);
  for (let n = 1; n <= 3; n++) batch.delete(db.doc(`organizations/${orgId}/messages/${id('msg', n)}/reads/${uid}`));
  await batch.commit();
  console.log(`[group-demo] wiped demo docs from ${orgId}`);
}

async function seed(orgId, uid, secondOrgId) {
  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (!orgSnap.exists) throw new Error(`organization ${orgId} not found`);
  const org = orgSnap.data();
  const mun = (await db.doc(`municipalities/${org.municipalityId}`).get()).data() ?? {};
  const other = (await db.collection(`organizations/${orgId}/members`).where('role', '==', 'admin').get()).docs.find((d) => d.id !== uid);
  const sender = other?.id ?? uid;
  const o = `organizations/${orgId}`;

  await join(orgId, uid, 'admin');
  if (secondOrgId) await join(secondOrgId, uid, 'member');
  const mine = await waitForMemberRow(orgId, uid);
  if (!mine) throw new Error('the roster trigger gave the user no socio row in 30 s — is syncOrgSocioRoster deployed on dev?');
  await mine.ref.update({ adminTitle: 'tesorero' });
  const me = { id: mine.id, name: mine.data().displayName };

  const batch = db.batch();
  const socios = TYPED.map(([name, alta], i) => ({ id: id('socio', i + 1), name, n: i + 1, alta }));
  for (const s of socios) {
    batch.set(db.doc(`${o}/socios/${s.id}`), tag(buildSocioData({ kind: 'typed', displayName: s.name, altaAt: new Date(`${s.alta}T10:00:00Z`), createdBy: uid })));
    if (PHONES[s.n]) batch.set(db.doc(`${o}/socioPrivate/${s.id}`), tag(buildSocioPrivateData({ phone: PHONES[s.n] })));
    if (JUBILADOS.has(s.n) || EXEMPT.has(s.n)) {
      batch.set(
        db.doc(`${o}/cuotaAssignments/${s.id}`),
        tag(buildCuotaAssignmentData({ tierId: JUBILADOS.has(s.n) ? 'jubilados' : null, exempt: EXEMPT.has(s.n), updatedBy: uid })),
      );
    }
  }

  batch.set(
    db.doc(`${o}/cuotaSettings/current`),
    tag(
      buildCuotaSettingsData({
        amountCents: 1200,
        periodicity: 'yearly',
        dueMonth: 3,
        dueDay: 15,
        graceDays: 30,
        startPeriod: '2025',
        tiers: [{ id: 'jubilados', name: 'Jubilados', amountCents: 600, coversPersonas: false }],
        bizum: '600 000 000',
        iban: 'ES00 0000 0000 0000 0000 0000',
        payInstructions: 'Pon tu nombre en el concepto. Si pagas en mano, dáselo a cualquiera de la junta.',
        remindersEnabled: false,
        configuredBy: uid,
      }),
    ),
  );
  const amount = (n) => (JUBILADOS.has(n) ? 600 : 1200);
  socios.forEach((s, i) => {
    const method = METHODS[i % METHODS.length];
    if (PAID_2025.includes(s.n)) {
      batch.set(db.doc(`${o}/cuotaPayments/${id('pay25', s.n)}`), tag(buildCuotaPaymentData({ socioId: s.id, periodKey: '2025', amountCents: amount(s.n), method, paidOn: `2025-0${3 + (i % 6)}-1${i % 9}`, recordedBy: uid })));
    }
    if (PAID_2026.includes(s.n)) {
      batch.set(db.doc(`${o}/cuotaPayments/${id('pay26', s.n)}`), tag(buildCuotaPaymentData({ socioId: s.id, periodKey: '2026', amountCents: amount(s.n), method, paidOn: `2026-0${3 + (i % 5)}-2${i % 8}`, recordedBy: uid })));
    }
  });
  batch.set(db.doc(`${o}/cuotaPayments/${id('pay25', 0)}`), tag(buildCuotaPaymentData({ socioId: me.id, periodKey: '2025', amountCents: 1200, method: 'bizum', paidOn: '2025-04-03', recordedBy: uid })));

  const tasks = [
    { title: 'Comprar leña para la matanza', assigneeUids: [uid], dueOn: dayKey(5), notes: 'Dos remolques. Preguntar el precio de este año.' },
    { title: 'Reservar el local para la cena', assigneeUids: [uid], dueOn: dayKey(12) },
    { title: 'Montar la barra', dueOn: dayKey(36), time: '18:00', slots: 6, notes: 'Hace falta gente para montar y para servir.' },
    { title: 'Renovar el seguro de responsabilidad civil', assigneeUids: [uid], dueOn: '2027-01-15', recurrence: { kind: 'calendar', unit: 'year', interval: 1, anchorOn: '2027-01-15' } },
    {
      title: 'Asamblea anual',
      dueOn: '2027-03-15',
      notes: '1. Lectura del acta anterior\n2. Cuentas del año\n3. Presupuesto y cuota\n4. Junta\n5. Ruegos y preguntas',
      recurrence: { kind: 'calendar', unit: 'year', interval: 1, anchorOn: '2027-03-15' },
    },
    { title: 'Pedir presupuesto de la orquesta', assigneeUids: [sender], dueOn: dayKey(-20), done: true },
  ];
  tasks.forEach((task, i) => {
    const { done, ...input } = task;
    const data = buildGroupTaskData({ ...input, createdBy: uid });
    if (done) Object.assign(data, { doneAt: new Date(Date.now() - 18 * 86_400_000), doneBy: sender });
    batch.set(db.doc(`${o}/tasks/${id('task', i + 1)}`), tag(data));
  });

  const message = (n, data) =>
    batch.set(
      db.doc(`${o}/messages/${id('msg', n)}`),
      tag({
        audience: { kind: 'all', eventId: null, eventTitle: null },
        channels: { push: true, email: false, whatsapp: 'none' },
        pinned: false,
        poll: null,
        recipientUids: [...new Set([uid, sender])],
        recipientCount: socios.length + 1,
        pushCount: 1,
        emailCount: 0,
        whatsappCount: 0,
        sentBy: sender,
        signerName: 'La junta de ' + org.name,
        signerTitle: null,
        nudgeCount: 0,
        lastNudgedAt: null,
        ...data,
      }),
    );
  message(1, { title: 'Cena de la peña: apuntaos antes del 20 de noviembre', body: 'Este año la cena es el sábado 22 en el local. 15 € socios, 20 € no socios. Decídselo a cualquiera de la junta.', pinned: true, sentAt: new Date(Date.now() - 2 * 86_400_000) });
  message(2, { title: 'Excursión de primavera', body: 'Estamos pensando en una excursión en mayo. ¿Adónde os gustaría ir?', poll: { question: '¿Adónde vamos?', kind: 'choice', options: ['Ribera del Duero', 'Sierra de Gredos', 'Segovia'] }, sentAt: new Date(Date.now() - 5 * 86_400_000) });
  message(3, { title: 'Gracias por las fiestas', body: 'Gracias a todos los que ayudasteis a montar y recoger. Las cuentas, en la próxima asamblea.', sentAt: new Date(Date.now() - 60 * 86_400_000) });
  batch.set(db.doc(`${o}/messages/${id('msg', 3)}/reads/${uid}`), { readAt: new Date(Date.now() - 59 * 86_400_000) });

  const attendees = [me, ...socios.slice(0, 7)].map((s) => ({ socioId: s.id, name: s.name }));
  batch.set(
    db.doc(`${o}/actas/${id('acta', 1)}`),
    tag(
      buildActaData({
        body: 'asamblea_general',
        heldOn: '2026-03-21',
        place: 'Local de la peña',
        attendees,
        otherAttendees: 3,
        agenda: ['Lectura del acta anterior', 'Cuentas de 2025', 'Cuota de 2026', 'Fiestas de agosto'],
        agreements: ['Se aprueban las cuentas de 2025.', 'La cuota se mantiene en 12 €, 6 € para jubilados.', 'La comida de fiestas será el 15 de agosto.'],
        visibleToSocios: true,
        createdBy: uid,
      }),
    ),
  );
  batch.set(
    db.doc(`${o}/actas/${id('acta', 2)}`),
    tag(
      buildActaData({
        body: 'junta_directiva',
        heldOn: '2026-09-12',
        place: 'Local de la peña',
        attendees: attendees.slice(0, 4),
        agenda: ['Balance de las fiestas', 'Cena de noviembre'],
        agreements: ['Se reserva el local para el 22 de noviembre.'],
        visibleToSocios: false,
        createdBy: uid,
      }),
    ),
  );

  [
    { kind: 'income', amountCents: 45000, on: '2026-01-10', concept: 'Lotería de Navidad', category: 'Lotería' },
    { kind: 'expense', amountCents: 18000, on: '2026-01-20', concept: 'Seguro de responsabilidad civil', category: 'Seguros' },
    { kind: 'expense', amountCents: 62000, on: '2026-08-15', concept: 'Comida de fiestas', category: 'Fiestas' },
    { kind: 'income', amountCents: 21000, on: '2026-08-15', concept: 'Rifa de fiestas', category: 'Fiestas' },
  ].forEach((e, i) => batch.set(db.doc(`${o}/ledgerEntries/${id('entry', i + 1)}`), tag(buildLedgerEntryData({ ...e, recordedBy: uid }))));

  const coords = mun.coordinates ? { lat: mun.coordinates.lat, lng: mun.coordinates.lng } : null;
  const at = (days, hour) => {
    const d = new Date(Date.now() + days * 86_400_000);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };
  [
    { title: `Cena de ${org.name}`, description: 'La cena de todos los años en el local. Apuntaos con la junta.', startDate: at(22, 20) },
    { title: `Matanza de ${org.name}`, description: 'Matanza tradicional: almuerzo, comida y sobremesa.', startDate: at(36, 9) },
    { title: `Comida de fiestas de ${org.name}`, description: 'La comida del 15 de agosto.', startDate: new Date('2026-08-15T12:00:00Z') },
  ].forEach((ev, i) =>
    batch.set(
      db.doc(`events/${id(`event-${orgId}`, i + 1)}`),
      tag(
        buildEventData({
          ...ev,
          location: buildLocationData({
            coordinates: coords ? new GeoPoint(coords.lat, coords.lng) : null,
            displayName: `Local de ${org.name}`,
          }),
          organizerUserIds: [uid],
          organizerOrgIds: [orgId],
          createdBy: uid,
          municipalityId: org.municipalityId,
          villageName: mun.name ?? '',
          villageSlug: org.villageSlug,
          villageCoordinates: coords,
        }),
      ),
    ),
  );

  await batch.commit();
  console.log(`[group-demo] ${org.name}: ${socios.length} typed socios, cuota + payments, ${tasks.length} tasks, 3 notices, 2 actas, 4 entries, 3 events`);
}

runAsMain(import.meta.url, async () => {
  const email = process.env.GROUP_DEMO_EMAIL;
  const orgId = process.env.GROUP_DEMO_ORG;
  if (!email || !orgId) throw new Error('set GROUP_DEMO_EMAIL and GROUP_DEMO_ORG');
  const uid = await uidForEmail(email);
  if (WIPE) await wipe(orgId, uid);
  else await seed(orgId, uid, process.env.GROUP_DEMO_SECOND_ORG ?? null);
});
