import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  cuotaSettingsGroup,
  organizationCuotaAssignmentsCollection,
  organizationCuotaPaymentsCollection,
  organizationCuotaReminderDoc,
  organizationDoc,
  organizationMembersCollection,
  organizationSocioPrivateDoc,
  organizationSociosCollection,
  userDoc,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildNotificationData,
  computeCuotaStatuses,
  cuotaConcept,
  cuotaReminderId,
  cuotaReminderStage,
  cuotaSigner,
  EVENT_TZ,
  hasSocioRoster,
  madridDayKey,
  periodKeyFor,
  periodLabel,
  type CuotaAssignmentData,
  type CuotaReminderStage,
  type CuotaSettingsData,
  type CuotaSigner,
  type SocioCuotaStatus,
  type SocioData,
} from '@cultuvilla/shared/models';
import {
  cuotaReminderEmailSubject,
  cuotaReminderFromName,
  renderCuotaReminderEmailHtml,
  renderCuotaReminderEmailText,
  type CuotaReminderEmailContent,
} from '@cultuvilla/shared/email';
import { formatDayKey, formatPrice, groupPath, webOriginForProject } from '@cultuvilla/shared/utils';
import { RESEND_API_KEY } from '../auth/secret';
import { sendEmail } from '../shared/email';

const db = getFirestore();
const handler = 'sendCuotaReminders';

type Socio = SocioData & { id: string };

interface DueReminder {
  socio: Socio;
  status: SocioCuotaStatus;
  stage: CuotaReminderStage;
}

/** One message per recipient and stage: a member hears once about themself and their personas. */
interface ReminderGroup {
  recipientUid: string | null;
  stage: CuotaReminderStage;
  items: DueReminder[];
}

export interface CuotaReminderRunResult {
  orgCount: number;
  reminderCount: number;
  pushCount: number;
  emailCount: number;
}

/**
 * Who hears about a socio's cuota: the member themself, a persona's responsible
 * member, and for a typed-in socio nobody with an account (email only).
 */
function recipientUidOf(socio: Socio): string | null {
  if (socio.kind === 'member') return socio.uid;
  if (socio.kind === 'persona') return socio.responsibleUid;
  return null;
}

function groupReminders(due: DueReminder[]): ReminderGroup[] {
  const groups = new Map<string, ReminderGroup>();
  for (const item of due) {
    const uid = recipientUidOf(item.socio);
    // A typed socio is their own group: they share no account with anyone.
    const key = `${uid ?? `typed:${item.socio.id}`}|${item.stage}`;
    const group = groups.get(key) ?? { recipientUid: uid, stage: item.stage, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

async function recipientEmail(firestore: Firestore, orgId: string, group: ReminderGroup, socios: Socio[]): Promise<string | null> {
  const typed = group.items.find((i) => i.socio.kind === 'typed');
  // The address the socio chose to share with the junta wins; a member who
  // shared none still gets their own account's address, which is theirs.
  const ownRow = typed?.socio ?? socios.find((s) => s.kind === 'member' && s.uid === group.recipientUid && s.bajaAt === null);
  const shared = ownRow ? (await organizationSocioPrivateDoc(firestore, orgId, ownRow.id).get()).data()?.email : null;
  if (shared) return shared;
  if (!group.recipientUid) return null;
  const account = (await userDoc(firestore, group.recipientUid).get()).data()?.email;
  return typeof account === 'string' && account.trim() ? account.trim() : null;
}

/**
 * Writes the record of every reminder in the group that has not been sent yet
 * and returns those — the ones to send now. Recorded before sending, in one
 * transaction, so an overlapping or retried run finds them and sends nothing
 * twice; a send that then fails is logged and not retried.
 */
async function claimReminders(
  firestore: Firestore,
  orgId: string,
  periodKey: string,
  group: ReminderGroup,
  channels: { push: boolean; email: boolean },
  signerName: string,
  now: Date,
): Promise<DueReminder[]> {
  return firestore.runTransaction(async (tx) => {
    const refs = group.items.map((i) => organizationCuotaReminderDoc(firestore, orgId, cuotaReminderId(periodKey, i.stage, i.socio.id)));
    const snaps = await tx.getAll(...refs);
    const fresh = group.items.filter((_, i) => !snaps[i]?.exists);
    fresh.forEach((item) => {
      tx.create(organizationCuotaReminderDoc(firestore, orgId, cuotaReminderId(periodKey, item.stage, item.socio.id)), {
        socioId: item.socio.id,
        periodKey,
        stage: item.stage,
        recipientUid: group.recipientUid,
        push: channels.push,
        email: channels.email,
        signerName,
        sentAt: now,
      });
    });
    return fresh;
  });
}

function signerLabel(signer: CuotaSigner | null, orgName: string): string {
  return signer?.name ?? `La junta de ${orgName}`;
}

function remaining(item: DueReminder): number {
  return Math.max(0, item.status.owedCents - item.status.paidCents);
}

function pushCopy(args: {
  stage: CuotaReminderStage;
  orgName: string;
  label: string;
  dueLabel: string;
  total: string;
  names: string[];
  forSelf: boolean;
  signer: string;
}): { title: string; body: string } {
  const whose = args.forSelf ? 'tu cuota' : `la cuota de ${args.names.join(', ')}`;
  const when = args.stage === 'before' ? `vence el ${args.dueLabel}` : `venció el ${args.dueLabel}. Si ya la has pagado, no hagas caso`;
  return {
    title: `Cuota ${args.label} · ${args.orgName}`,
    body: `${args.signer}: ${whose} (${args.total}) ${when}.`,
  };
}

async function remindOrg(
  firestore: Firestore,
  orgId: string,
  settings: CuotaSettingsData,
  now: Date,
  result: CuotaReminderRunResult,
): Promise<void> {
  const org = (await organizationDoc(firestore, orgId).get()).data();
  if (!org || org.status !== 'approved' || !hasSocioRoster(org.type)) return;

  const today = madridDayKey(now);
  const periodKey = periodKeyFor(settings.periodicity, today);
  const [sociosSnap, assignmentsSnap, paymentsSnap, adminsSnap] = await Promise.all([
    organizationSociosCollection(firestore, orgId).get(),
    organizationCuotaAssignmentsCollection(firestore, orgId).get(),
    organizationCuotaPaymentsCollection(firestore, orgId).where('periodKey', '==', periodKey).get(),
    organizationMembersCollection(firestore, orgId).where('role', '==', 'admin').get(),
  ]);
  const socios: Socio[] = sociosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const assignments: Record<string, CuotaAssignmentData> = Object.fromEntries(assignmentsSnap.docs.map((d) => [d.id, d.data()]));
  const payments = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const statuses = computeCuotaStatuses({ settings, periodKey, today, socios, assignments, payments });
  const socioById = new Map(socios.map((s) => [s.id, s]));
  const due: DueReminder[] = statuses.flatMap((status) => {
    const socio = socioById.get(status.socioId);
    const stage = cuotaReminderStage(status, today);
    // A baja is no longer reminded, even of a period they still owe.
    return socio && socio.bajaAt === null && stage ? [{ socio, status, stage }] : [];
  });
  result.orgCount += 1;
  if (due.length === 0) return;

  const signer = cuotaSigner(socios, adminsSnap.docs.map((d) => d.id), settings.configuredBy);
  const signerName = signerLabel(signer, org.name);
  const label = periodLabel(periodKey);
  const appUrl = `${webOriginForProject(process.env['GCLOUD_PROJECT'])}${groupPath(orgId)}`;

  for (const group of groupReminders(due)) {
    const email = await recipientEmail(firestore, orgId, group, socios);
    const channels = { push: group.recipientUid !== null, email: email !== null };
    if (!channels.push && !channels.email) {
      logger.info('Cuota reminder has no channel; skipped', { handler, orgId, periodKey, socioIds: group.items.map((i) => i.socio.id) });
      continue;
    }
    const sendable = await claimReminders(firestore, orgId, periodKey, group, channels, signerName, now);
    if (sendable.length === 0) continue;
    result.reminderCount += sendable.length;

    // The earliest due day of the group: what the reader must act on first.
    const [dueOn = today] = sendable.map((i) => i.status.dueOn).sort();
    const dueLabel = formatDayKey(dueOn, 'long');
    const totalCents = sendable.reduce((sum, i) => sum + remaining(i), 0);
    const total = formatPrice(totalCents / 100);
    const names = sendable.map((i) => i.socio.displayName.trim() || '—');

    if (group.recipientUid) {
      const [first] = sendable;
      const forSelf = sendable.length === 1 && first.socio.kind === 'member';
      const copy = pushCopy({ stage: group.stage, orgName: org.name, label, dueLabel, total, names, forSelf, signer: signerName });
      // The id names the first socio, so a persona who falls due later gets
      // its own buzz instead of overwriting this one (an overwrite never pushes).
      await userNotificationsCollection(firestore, group.recipientUid)
        .doc(`cuota_${orgId}_${periodKey}_${group.stage}_${first.socio.id}`)
        .set(
          buildNotificationData({
            type: 'cuota_reminder',
            title: copy.title,
            body: copy.body,
            municipalityId: org.municipalityId,
            entityKind: 'organization',
            entityId: orgId,
            createdAt: now,
          }),
        );
      result.pushCount += 1;
    }

    if (email) {
      const content: CuotaReminderEmailContent = {
        stage: group.stage,
        orgName: org.name,
        periodLabel: label,
        dueLabel,
        lines: sendable.map((i) => ({
          name: i.socio.displayName.trim() || '—',
          amountLabel: formatPrice(remaining(i) / 100),
          concept: cuotaConcept(periodKey, i.socio.displayName),
        })),
        totalLabel: total,
        bizum: settings.bizum,
        iban: settings.iban,
        payInstructions: settings.payInstructions,
        signer,
        appUrl,
      };
      const outcome = await sendEmail(
        {
          to: email,
          subject: cuotaReminderEmailSubject(content),
          html: renderCuotaReminderEmailHtml(content),
          text: renderCuotaReminderEmailText(content),
          fromName: cuotaReminderFromName(content),
        },
        { handler, label: 'Cuota reminder email', fields: { orgId, periodKey, stage: group.stage, socioCount: sendable.length } },
      );
      if (outcome === 'sent') result.emailCount += 1;
    }
  }
}

/**
 * Every org with reminders on, today. Exported for the handler tests; the
 * schedule below is the only production caller.
 */
export async function runCuotaReminders(firestore: Firestore, now: Date): Promise<CuotaReminderRunResult> {
  const result: CuotaReminderRunResult = { orgCount: 0, reminderCount: 0, pushCount: 0, emailCount: 0 };
  // Unfiltered on purpose: a collection-group filter needs its own index, and
  // there is one settings doc per group that keeps a cuota.
  const settingsSnap = await cuotaSettingsGroup(firestore).get();
  for (const snap of settingsSnap.docs) {
    const orgId = snap.ref.parent.parent?.id;
    if (!orgId) continue;
    let settings: CuotaSettingsData;
    try {
      settings = snap.data();
    } catch (err) {
      logger.warn('Cuota settings do not parse; org skipped', { handler, orgId, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (!settings.remindersEnabled) continue;
    try {
      await remindOrg(firestore, orgId, settings, now, result);
    } catch (err) {
      // One group's bad data must not cost every other group its reminders.
      logger.error('Cuota reminders failed for org', { handler, orgId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

/**
 * The cuota reminders, in the treasurer's name: in the week before a socio's
 * due day, and once when it is vencida. Push (through the notification
 * pipeline, which applies each user's preferences) and email (Resend).
 *
 * Runs once a day at 10:00 Madrid, so a reminder never lands in quiet hours.
 * What was sent is recorded per socio per period (`cuotaReminders`), so a
 * re-run never reminds anyone twice.
 */
export const sendCuotaReminders = onSchedule(
  { schedule: 'every day 10:00', timeZone: EVENT_TZ, secrets: [RESEND_API_KEY] },
  async () => {
    const result = await runCuotaReminders(db, new Date());
    logger.info('Cuota reminders run', { handler, ...result });
  },
);
