import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  organizationCuotaAssignmentsCollection,
  organizationCuotaPaymentsCollection,
  organizationCuotaSettingsDoc,
  organizationDoc,
  organizationMemberDoc,
  organizationMessagesCollection,
  organizationMessageVotesCollection,
  organizationSociosCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildYearSummary,
  computeCuotaStatuses,
  GetGroupTransparencyInputSchema,
  hasSocioRoster,
  madridDayKey,
  NEUTRAL_PERSONAL_VALUES,
  periodKeyFor,
  publicCuotaStatus,
  renderGroupMessageText,
  tallyGroupPoll,
  TRANSPARENT_AVISOS_LIMIT,
  yearDayRange,
  type CuotaAssignmentData,
  type GetGroupTransparencyInput,
  type GetGroupTransparencyResult,
  type TransparentAvisosResult,
  type TransparentCuentasResult,
  type TransparentCuotaResult,
} from '@cultuvilla/shared/models';
import { defineCallable } from '../shared/define/defineCallable';

const db = getFirestore();
const handler = 'getGroupTransparency';

async function cuotaView(firestore: Firestore, orgId: string, now: Date): Promise<TransparentCuotaResult> {
  const settings = (await organizationCuotaSettingsDoc(firestore, orgId).get()).data();
  if (!settings) return { view: 'cuota', periodKey: null, socios: [] };
  const today = madridDayKey(now);
  const periodKey = periodKeyFor(settings.periodicity, today);
  const [sociosSnap, assignmentsSnap, paymentsSnap] = await Promise.all([
    organizationSociosCollection(firestore, orgId).get(),
    organizationCuotaAssignmentsCollection(firestore, orgId).get(),
    organizationCuotaPaymentsCollection(firestore, orgId).where('periodKey', '==', periodKey).get(),
  ]);
  const socios = sociosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const assignments: Record<string, CuotaAssignmentData> = Object.fromEntries(assignmentsSnap.docs.map((d) => [d.id, d.data()]));
  const payments = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const nameOf = new Map(socios.map((s) => [s.id, s.displayName]));
  const active = new Set(socios.filter((s) => s.bajaAt === null).map((s) => s.id));
  // Name and al día / pendiente only: never what anyone owes, paid, when or how.
  const rows = computeCuotaStatuses({ settings, periodKey, today, socios, assignments, payments })
    .filter((s) => active.has(s.socioId))
    .map((s) => ({ socioId: s.socioId, displayName: nameOf.get(s.socioId) ?? '', status: publicCuotaStatus(s.status) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
  return { view: 'cuota', periodKey, socios: rows };
}

async function avisosView(firestore: Firestore, orgId: string, forJunta: boolean): Promise<TransparentAvisosResult> {
  const snap = await organizationMessagesCollection(firestore, orgId).orderBy('sentAt', 'desc').limit(TRANSPARENT_AVISOS_LIMIT).get();
  // An aviso the junta sent only to itself is its own working note, not something it made public.
  const docs = forJunta ? snap.docs : snap.docs.filter((d) => d.data().audience.kind !== 'junta');
  const avisos = await Promise.all(
    docs.map(async (d) => {
      const m = d.data();
      // The results only: who voted what stays the junta's.
      const tally = m.poll
        ? tallyGroupPoll(m.poll, (await organizationMessageVotesCollection(firestore, orgId, d.id).get()).docs.map((v) => v.data()))
        : null;
      return {
        id: d.id,
        // Placeholders are each recipient's own (their name, their cuota): shown neutral.
        title: renderGroupMessageText(m.title, NEUTRAL_PERSONAL_VALUES, 'title'),
        body: renderGroupMessageText(m.body, NEUTRAL_PERSONAL_VALUES, 'body'),
        audienceKind: m.audience.kind,
        eventTitle: m.audience.eventTitle,
        signerName: m.signerName,
        signerTitle: m.signerTitle,
        sentAt: m.sentAt.toISOString(),
        poll: m.poll,
        tally,
      };
    }),
  );
  return { view: 'avisos', avisos };
}

async function cuentasView(firestore: Firestore, orgId: string, year: string): Promise<TransparentCuentasResult> {
  const coll = organizationCuotaPaymentsCollection(firestore, orgId);
  const { from, to } = yearDayRange(year);
  const [inYear, reversals] = await Promise.all([
    coll.where('paidOn', '>=', from).where('paidOn', '<=', to).get(),
    coll.where('kind', '==', 'reversal').get(),
  ]);
  const payments = [...new Map([...inYear.docs, ...reversals.docs].map((d) => [d.id, { id: d.id, ...d.data() }])).values()];
  // Totals per period, so no socio's payment can be read off them.
  const summary = buildYearSummary({ year, cuotaPayments: payments, ledgerEntries: [] });
  return {
    view: 'cuentas',
    year,
    cuotaByPeriod: summary.cuotaByPeriod.map((p) => ({ periodKey: p.periodKey, cents: p.cents })),
    cuotaCents: summary.cuotaCents,
  };
}

/** Exported for the handler tests; the callable below is the only production caller. */
export async function runGetGroupTransparency(
  firestore: Firestore,
  callerUid: string,
  input: GetGroupTransparencyInput,
  now: Date,
): Promise<GetGroupTransparencyResult> {
  const { orgId, view } = input;
  const [org, caller] = await Promise.all([
    organizationDoc(firestore, orgId).get().then((s) => s.data()),
    organizationMemberDoc(firestore, orgId, callerUid).get().then((s) => s.data()),
  ]);
  if (!org) throw new HttpsError('not-found', 'El grupo no existe.');
  if (!caller) throw new HttpsError('permission-denied', 'No autorizado.');
  if (!hasSocioRoster(org.type)) throw new HttpsError('failed-precondition', 'Este grupo no tiene socios.');
  // The junta sees all of it anyway; everyone else only what it has opened.
  if (caller.role !== 'admin' && !org.transparency[view]) {
    throw new HttpsError('permission-denied', 'La junta no lo ha hecho público.');
  }
  switch (input.view) {
    case 'cuota':
      return cuotaView(firestore, orgId, now);
    case 'avisos':
      return avisosView(firestore, orgId, caller.role === 'admin');
    case 'cuentas':
      return cuentasView(firestore, orgId, input.year);
  }
}

/**
 * What a group's junta has made public to its integrantes ("Cuota pública",
 * "Avisos públicos", "Cuentas públicas" in its Ajustes), with only the fields
 * socios may see — the rules cannot hide a field, so these reads go through
 * the Admin SDK. Members of the org only, and only while that switch is on.
 */
export const getGroupTransparency = defineCallable<unknown, Promise<GetGroupTransparencyResult>>(
  'getGroupTransparency',
  { cors: true },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const parsed = GetGroupTransparencyInputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    const result = await runGetGroupTransparency(db, callerUid, parsed.data, new Date());
    logger.info('Group transparency read', { handler, orgId: parsed.data.orgId, view: parsed.data.view });
    return result;
  },
);
