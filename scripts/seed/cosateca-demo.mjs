#!/usr/bin/env node
/**
 * Fills one group's cosateca with other people, so it can be tried as a real
 * group would use it: six demo integrantes, each lending, offering or giving
 * something; the group's own shared cosas and a bookable pádel court; and
 * requests in every state, the user's included — someone asking for the user's
 * cosa, one the user borrowed and is late returning, one the user asked for,
 * one the group's admins must answer, plus their chats. Dev only
 * (villa-events), idempotent.
 *
 *   COSATECA_DEMO_EMAIL=you@example.com COSATECA_DEMO_ORG=<orgId> \
 *     pnpm seed:dev:cosateca-demo [--wipe]
 *
 * The group must already run a cosateca. Demo people are Auth users at
 * `cosateca-demo-N@example.com` (no password: nobody signs in as them). Every
 * doc has a `seed-cd-` id and `seedBatch: cosateca-demo`; `--wipe` deletes the
 * cosas, requests, chats and slots, and takes the demo people out of the group
 * and the pueblo, leaving their accounts.
 *
 * Pending requests notify the user like real ones would, which is the point.
 */
import {
  buildCosaData,
  buildCosaRequestData,
  buildUserData,
  buildVillageMemberData,
  DEFAULT_RESERVA_CONFIG,
  reservaSlotKey,
} from '@cultuvilla/shared/models';
import { WIPE, auth, db, uidForEmail } from './lib/context.mjs';
import { runAsMain } from './lib/run.mjs';

const BATCH = 'cosateca-demo';
const tag = (data) => ({ ...data, seedBatch: BATCH });
const id = (kind, n) => `seed-cd-${kind}-${String(n).padStart(2, '0')}`;

const PEOPLE = ['Lucía Martín', 'Paco Herrero', 'Marisa Gómez', 'Toni Sanz', 'Rocío Llorente', 'Andrés Pastor'];
const [LUCIA, PACO, MARISA, TONI, ROCIO, ANDRES] = PEOPLE.map((_, i) => i);
const emailOf = (i) => `cosateca-demo-${i + 1}@example.com`;

const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);

function dayKey(offsetDays) {
  return new Date(Date.now() + offsetDays * DAY).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

/** A Madrid wall-clock time on a Madrid day, as an instant. */
function madridAt(day, time) {
  const guess = new Date(`${day}T${time}:00Z`);
  const wall = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (wall.getTime() - utc.getTime()));
}

async function ensurePerson(i) {
  const email = emailOf(i);
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    user = await auth.createUser({ email, displayName: PEOPLE[i], emailVerified: true });
  }
  await db.doc(`users/${user.uid}`).set(tag(buildUserData({ displayName: PEOPLE[i], email })), { merge: true });
  return user.uid;
}

/** Adds a membership, or completes one an earlier run wrote short; never changes a role. */
async function joinIfMissing(path, data) {
  const ref = db.doc(path);
  const snap = await ref.get();
  if (!snap.exists) await ref.set(data);
  else if (Object.keys(data).some((k) => !(k in snap.data()))) await ref.set({ ...data, ...snap.data() });
}

/** The cosas, by key. `owner` is a PEOPLE index, 'me', or null for the group. */
function cosaSpecs() {
  return [
    { n: 1, owner: LUCIA, kind: 'prestamo', category: 'herramientas', title: 'Taladro percutor', description: 'Bosch, con maletín y juego de brocas para pared y madera.', conditions: 'Devolverlo con las brocas en su sitio.' },
    { n: 2, owner: PACO, kind: 'prestamo', category: 'cocina', title: 'Paellera de 80 cm', description: 'Para unas 25 raciones. Con su quemador y el pie.', conditions: 'Limpia y seca, que si no se oxida.' },
    { n: 3, owner: MARISA, kind: 'prestamo', category: 'fiestas', title: 'Carpa plegable 3×3', description: 'Blanca, se monta entre dos en cinco minutos.' },
    { n: 4, owner: TONI, kind: 'prestamo', category: 'ninos', title: 'Bici de niño de 20"', description: 'Para 6 a 9 años. Ahora está en el taller.', status: 'paused' },
    { n: 5, owner: ROCIO, kind: 'prestamo', category: 'jardin', title: 'Desbrozadora de gasolina', description: 'Va con mezcla al 2 %. El bidón lo pongo yo.', conditions: 'Devolverla con el depósito lleno.' },
    { n: 6, owner: ANDRES, kind: 'prestamo', category: 'libros', title: 'Colección de Astérix', description: 'Los 38 álbumes, en castellano.' },
    { n: 7, owner: TONI, kind: 'servicio', category: 'deporte', title: 'Te arreglo el pinchazo de la bici', description: 'Tráemela al garaje por la tarde, en diez minutos está.' },
    { n: 8, owner: LUCIA, kind: 'servicio', category: 'otros', title: 'Clases de guitarra para empezar', description: 'Los sábados por la mañana en el local, para críos y mayores.' },
    { n: 9, owner: MARISA, kind: 'regalo', category: 'ninos', title: 'Ropa de bebé de 0 a 6 meses', description: 'Una bolsa grande, todo lavado.' },
    { n: 10, owner: ANDRES, kind: 'regalo', category: 'jardin', title: 'Plantones de tomate', description: 'Me han sobrado unos veinte, de pera y de colgar.' },
    { n: 11, owner: PACO, kind: 'regalo', category: 'otros', title: 'Sofá de dos plazas', description: 'Gris, en buen estado.', status: 'given' },
    { n: 12, owner: null, kind: 'prestamo', category: 'cocina', title: 'Barbacoa de la peña', description: 'La grande, de carbón. Va pasando de mano en mano.', locationNote: 'Almacén del local, al fondo a la izquierda' },
    { n: 13, owner: null, kind: 'prestamo', category: 'fiestas', title: 'Mesas y sillas plegables', description: '10 mesas y 60 sillas.', locationNote: 'Almacén del local', conditions: 'Contadlas al devolverlas.' },
    { n: 14, owner: null, kind: 'prestamo', category: 'fiestas', title: 'Equipo de sonido', description: 'Dos altavoces, mesa de mezclas y un micro inalámbrico.', createdBy: TONI, locationNote: 'Armario cerrado del local, pedid la llave' },
    { n: 15, owner: null, kind: 'reserva', category: 'deporte', title: 'Pista de pádel', description: 'La pista de detrás del frontón. Reserva una hora.' },
  ];
}

async function seed(orgId, myUid) {
  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (!orgSnap.exists) throw new Error(`organization ${orgId} not found`);
  const org = orgSnap.data();
  if (!org.cosateca?.enabled) throw new Error(`${org.name} has no cosateca switched on — turn it on in the group's settings first`);
  const audience = org.cosateca.audience === 'pueblo' ? 'pueblo' : 'integrantes';
  const myName = (await db.doc(`publicProfiles/${myUid}`).get()).data()?.displayName
    ?? (await db.doc(`users/${myUid}`).get()).data()?.displayName ?? 'Tú';

  const uids = [];
  for (let i = 0; i < PEOPLE.length; i++) {
    const uid = await ensurePerson(i);
    uids.push(uid);
    await joinIfMissing(`municipalities/${org.municipalityId}/members/${uid}`, buildVillageMemberData({ userId: uid, joinedAt: daysAgo(60 + i) }));
    await joinIfMissing(`organizations/${orgId}/members/${uid}`, { userId: uid, role: 'member', joinedAt: daysAgo(40 + i) });
  }
  const who = (owner) => (owner === 'me' ? { uid: myUid, name: myName } : owner === null ? null : { uid: uids[owner], name: PEOPLE[owner] });

  const batch = db.batch();
  const cosas = {};
  for (const s of cosaSpecs()) {
    const owner = who(s.owner);
    const creator = s.createdBy !== undefined ? who(s.createdBy) : owner ?? { uid: myUid, name: myName };
    const data = buildCosaData({
      municipalityId: org.municipalityId,
      orgId,
      audience,
      ownerUid: owner?.uid ?? null,
      ownerName: owner?.name ?? org.name,
      kind: s.kind,
      title: s.title,
      description: s.description,
      category: s.category,
      conditions: s.conditions,
      locationNote: s.locationNote,
      reserva: s.kind === 'reserva' ? { ...DEFAULT_RESERVA_CONFIG, hours: { ...DEFAULT_RESERVA_CONFIG.hours, '1': null } } : null,
      createdBy: creator.uid,
      createdByName: creator.name,
      createdAt: daysAgo(30 - s.n),
    });
    if (s.status) data.status = s.status;
    cosas[s.n] = { id: id('cosa', s.n), data };
  }

  const myGuitar = (await db.collection('cosas').where('orgId', '==', orgId).where('ownerUid', '==', myUid).where('kind', '==', 'prestamo').limit(1).get()).docs[0];

  const requests = [];
  const request = (n, cosa, cosaId, requester, extra) => {
    const data = buildCosaRequestData({
      municipalityId: org.municipalityId,
      orgId,
      cosaId,
      cosaTitle: cosa.title,
      cosaKind: cosa.kind,
      ownerUid: cosa.ownerUid,
      holderUid: extra.holderUid ?? null,
      requesterUid: requester.uid,
      requesterName: requester.name,
      message: extra.message,
      fromOn: extra.fromOn,
      untilOn: extra.untilOn,
      startAt: extra.startAt,
      endAt: extra.endAt,
      createdAt: extra.createdAt,
    });
    Object.assign(data, extra.set ?? {});
    requests.push({ id: id('req', n), data });
    return id('req', n);
  };
  const lend = (cosaN, reqId, holder, untilOn, since) => {
    cosas[cosaN].data.heldBy = { requestId: reqId, uid: holder.uid, name: holder.name, untilOn, since };
  };
  const c = (n) => cosas[n].data;

  // Someone asks for the user's own cosa.
  if (myGuitar) {
    request(1, myGuitar.data(), myGuitar.id, who(LUCIA), {
      message: '¿Me la dejas el finde? Tenemos cena en el local y quiero tocar un rato.',
      fromOn: dayKey(2), untilOn: dayKey(4), createdAt: daysAgo(0.2),
    });
  }
  // The user borrowed Rocío's desbrozadora and is two days late.
  const lateId = request(2, c(5), cosas[5].id, who('me'), {
    message: 'Para limpiar el huerto de la era.', fromOn: dayKey(-9), untilOn: dayKey(-2), createdAt: daysAgo(11),
    set: { status: 'lent', respondedAt: daysAgo(10), overdueNotifiedOn: dayKey(-1) },
  });
  lend(5, lateId, who('me'), dayKey(-2), daysAgo(9));
  // The user asked Lucía for her taladro and waits.
  request(3, c(1), cosas[1].id, who('me'), { message: 'Para colgar unas baldas, me basta una tarde.', fromOn: dayKey(1), untilOn: dayKey(1), createdAt: daysAgo(0.5) });
  // Marisa has Paco's paellera for the fiesta.
  const paellaId = request(4, c(2), cosas[2].id, who(MARISA), {
    fromOn: dayKey(-1), untilOn: dayKey(3), createdAt: daysAgo(4), set: { status: 'lent', respondedAt: daysAgo(3) },
  });
  lend(2, paellaId, who(MARISA), dayKey(3), daysAgo(1));
  // The group's barbacoa is with Paco, and Andrés wants it next.
  const bbqId = request(5, c(12), cosas[12].id, who(PACO), { createdAt: daysAgo(6), set: { status: 'lent', respondedAt: daysAgo(6) } });
  lend(12, bbqId, who(PACO), null, daysAgo(6));
  request(6, c(12), cosas[12].id, who(ANDRES), { holderUid: uids[PACO], message: 'Para el cumple de mi hija el sábado.', fromOn: dayKey(5), untilOn: dayKey(6), createdAt: daysAgo(1) });
  // The group's admins must answer: Rocío wants the mesas.
  request(7, c(13), cosas[13].id, who(ROCIO), { message: 'Comida de quintos, somos unos 40.', fromOn: dayKey(8), untilOn: dayKey(9), createdAt: daysAgo(0.1) });
  // Marisa asks Andrés for plantones; Toni got Paco's sofá; Toni's old request for the equipo was turned down.
  request(8, c(10), cosas[10].id, who(MARISA), { message: '¿Me guardas cinco?', createdAt: daysAgo(2) });
  request(9, c(11), cosas[11].id, who(TONI), { createdAt: daysAgo(20), set: { status: 'given', respondedAt: daysAgo(19), closedAt: daysAgo(18) } });
  request(10, c(14), cosas[14].id, who(TONI), { fromOn: dayKey(-15), untilOn: dayKey(-14), createdAt: daysAgo(18), set: { status: 'declined', respondedAt: daysAgo(17), closedAt: daysAgo(17) } });
  // Two pádel bookings, so the grid shows taken slots.
  const slots = [];
  for (const [n, person, day, time] of [[11, LUCIA, 1, '19:00'], [12, TONI, 2, '18:00']]) {
    const startAt = madridAt(dayKey(day), time);
    const endAt = new Date(startAt.getTime() + DEFAULT_RESERVA_CONFIG.slotMinutes * 60_000);
    const reqId = request(n, c(15), cosas[15].id, who(person), {
      fromOn: dayKey(day), untilOn: dayKey(day), startAt, endAt, createdAt: daysAgo(1),
      set: { status: 'accepted', respondedAt: daysAgo(1) },
    });
    slots.push({ key: reservaSlotKey(startAt), data: { requestId: reqId, startAt, endAt, status: 'accepted' } });
  }

  for (const k of Object.keys(cosas)) batch.set(db.doc(`cosas/${cosas[k].id}`), tag(cosas[k].data));
  for (const s of slots) batch.set(db.doc(`cosas/${cosas[15].id}/slots/${s.key}`), tag(s.data));
  for (const r of requests) batch.set(db.doc(`cosaRequests/${r.id}`), tag(r.data));
  await batch.commit();

  // Chats after their requests exist, so the push trigger finds its parties.
  const chats = [
    [2, [[ROCIO, 'Oye, ¿qué tal la desbrozadora? La necesito para el sábado.', 1.2], ['me', 'Perdona, mañana te la acerco con el depósito lleno.', 1.1], [ROCIO, 'Vale, sin prisa pero sin pausa 😄', 0.05]]],
    [4, [[MARISA, 'Me la llevo esta tarde, ¿te va bien a las seis?', 3.5], [PACO, 'Perfecto, estoy en el local.', 3.4]]],
  ];
  if (myGuitar) chats.unshift([1, [[LUCIA, 'Te la devuelvo el lunes sin falta.', 0.15]]]);
  const chatBatch = db.batch();
  for (const [reqN, msgs] of chats) {
    msgs.forEach(([author, body, ago], i) => {
      const a = who(author);
      chatBatch.set(db.doc(`cosaRequests/${id('req', reqN)}/chat/${id('chat', reqN * 10 + i)}`), tag({ authorUid: a.uid, authorName: a.name, body, createdAt: daysAgo(ago) }));
    });
  }
  await chatBatch.commit();

  console.log(`[cosateca-demo] ${org.name}: ${PEOPLE.length} people, ${Object.keys(cosas).length} cosas, ${requests.length} requests, ${slots.length} pádel bookings${myGuitar ? '' : ' (you have no cosa of your own to be asked for — offer one and re-run)'}`);
}

async function wipe(orgId) {
  const batch = db.batch();
  for (const kind of ['cosas', 'cosaRequests']) {
    const snap = await db.collection(kind).where('orgId', '==', orgId).where('seedBatch', '==', BATCH).get();
    for (const d of snap.docs) {
      for (const sub of kind === 'cosas' ? ['slots'] : ['chat']) {
        for (const child of (await d.ref.collection(sub).get()).docs) batch.delete(child.ref);
      }
      batch.delete(d.ref);
    }
  }
  const org = (await db.doc(`organizations/${orgId}`).get()).data();
  for (let i = 0; i < PEOPLE.length; i++) {
    try {
      const { uid } = await auth.getUserByEmail(emailOf(i));
      batch.delete(db.doc(`organizations/${orgId}/members/${uid}`));
      if (org) batch.delete(db.doc(`municipalities/${org.municipalityId}/members/${uid}`));
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }
  }
  await batch.commit();
  console.log(`[cosateca-demo] wiped the demo cosateca from ${orgId}`);
}

runAsMain(import.meta.url, async () => {
  const email = process.env.COSATECA_DEMO_EMAIL;
  const orgId = process.env.COSATECA_DEMO_ORG;
  if (!email || !orgId) throw new Error('set COSATECA_DEMO_EMAIL and COSATECA_DEMO_ORG');
  if (WIPE) await wipe(orgId);
  else await seed(orgId, await uidForEmail(email));
});
