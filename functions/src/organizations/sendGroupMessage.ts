import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import {
  eventDoc,
  eventRegistrationsCollection,
  organizationCuotaAssignmentsCollection,
  organizationCuotaPaymentsCollection,
  organizationCuotaSettingsDoc,
  organizationDoc,
  organizationMemberDoc,
  organizationMembersCollection,
  organizationMessageDeliveriesCollection,
  organizationMessageDoc,
  organizationSocioPrivateCollection,
  organizationSociosCollection,
  userDoc,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildNotificationData,
  computeCuotaStatuses,
  groupMessagePlaceholdersIn,
  groupMessageRecipientValues,
  hasSocioRoster,
  madridDayKey,
  normalizeLeadPhone,
  periodKeyFor,
  personalizeGroupMessage,
  SendGroupMessageInputSchema,
  typedRecipientKey,
  type GroupMessageAudience,
  type GroupMessageData,
  type GroupMessageDeliveryData,
  type GroupMessageEmailState,
  type GroupMessagePersonalValues,
  type OrgAdminTitle,
  type SendGroupMessageInput,
  type SendGroupMessageResult,
  type SocioCuotaStatus,
  type SocioData,
  type SocioPrivateData,
} from '@cultuvilla/shared/models';
import {
  groupMessageEmailSubject,
  groupMessageFromName,
  renderGroupMessageEmailHtml,
  renderGroupMessageEmailText,
  type GroupMessageEmailContent,
} from '@cultuvilla/shared/email';
import { groupPath, webOriginForProject } from '@cultuvilla/shared/utils';
import { RESEND_API_KEY } from '../auth/secret';
import { sendEmailBatch } from '../shared/email';

const db = getFirestore();
const handler = 'sendGroupMessage';
/** Firestore's batch ceiling, with room to spare. */
const BATCH_SIZE = 400;
/** A notification body is a preview: the message itself is in the group. */
const PUSH_BODY_MAX = 180;

type Socio = SocioData & { id: string };

/**
 * One recipient: an account (a member, a persona's responsible member, a
 * registrant) or a typed-in socio without the app. A member hears once about
 * themself and the personas they answer for.
 */
export interface MessageRecipient {
  key: string;
  uid: string | null;
  socioIds: string[];
  names: string[];
  /** The socio row whose shared contact data (socioPrivate) is this recipient's. */
  contactSocioId: string | null;
}

function recipientUidOf(socio: Socio): string | null {
  if (socio.kind === 'member') return socio.uid;
  if (socio.kind === 'persona') return socio.responsibleUid;
  return null;
}

/** Groups socio rows per account, the way the cuota reminders do. */
export function groupSocios(rows: Socio[], allActive: Socio[]): MessageRecipient[] {
  const byKey = new Map<string, MessageRecipient>();
  for (const socio of rows) {
    const uid = recipientUidOf(socio);
    const key = uid ?? typedRecipientKey(socio.id);
    const ownRow = uid ? allActive.find((s) => s.kind === 'member' && s.uid === uid) : socio;
    const entry = byKey.get(key) ?? { key, uid, socioIds: [], names: [], contactSocioId: ownRow?.id ?? null };
    entry.socioIds.push(socio.id);
    entry.names.push(socio.displayName.trim() || '—');
    byKey.set(key, entry);
  }
  return [...byKey.values()];
}

/** This period's cuota status of every active socio; null when the group keeps no cuota. */
async function currentCuotaStatuses(firestore: Firestore, orgId: string, active: Socio[]): Promise<SocioCuotaStatus[] | null> {
  const settings = (await organizationCuotaSettingsDoc(firestore, orgId).get()).data();
  if (!settings) return null;
  const today = madridDayKey(new Date());
  const periodKey = periodKeyFor(settings.periodicity, today);
  const [assignmentsSnap, paymentsSnap] = await Promise.all([
    organizationCuotaAssignmentsCollection(firestore, orgId).get(),
    organizationCuotaPaymentsCollection(firestore, orgId).where('periodKey', '==', periodKey).get(),
  ]);
  return computeCuotaStatuses({
    settings,
    periodKey,
    today,
    socios: active,
    assignments: Object.fromEntries(assignmentsSnap.docs.map((d) => [d.id, d.data()])),
    payments: paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
}

async function resolveAudience(
  firestore: Firestore,
  orgId: string,
  audience: SendGroupMessageInput['audience'],
  active: Socio[],
): Promise<{ recipients: MessageRecipient[]; stored: GroupMessageAudience }> {
  const stored: GroupMessageAudience = { kind: audience.kind, eventId: null, eventTitle: null };
  switch (audience.kind) {
    case 'all':
      return { recipients: groupSocios(active, active), stored };
    case 'junta': {
      const admins = await organizationMembersCollection(firestore, orgId).where('role', '==', 'admin').get();
      const adminUids = new Set(admins.docs.map((d) => d.id));
      const rows = active.filter((s) => s.kind === 'member' && s.uid !== null && adminUids.has(s.uid));
      return { recipients: groupSocios(rows, active), stored };
    }
    case 'cuota': {
      const statuses = await currentCuotaStatuses(firestore, orgId, active);
      if (!statuses) throw new HttpsError('failed-precondition', 'El grupo todavía no tiene cuota.');
      const owing = new Set(statuses.filter((s) => s.status !== 'al_dia').map((s) => s.socioId));
      return { recipients: groupSocios(active.filter((s) => owing.has(s.id)), active), stored };
    }
    case 'event': {
      const eventId = audience.eventId ?? '';
      const event = (await eventDoc(firestore, eventId).get()).data();
      if (!event || !event.organizerOrgIds.includes(orgId)) {
        throw new HttpsError('failed-precondition', 'Ese evento no es del grupo.');
      }
      const regs = await eventRegistrationsCollection(firestore, eventId).get();
      const byUid = new Map<string, MessageRecipient>();
      for (const reg of regs.docs.map((d) => d.data())) {
        const ownRow = active.find((s) => s.kind === 'member' && s.uid === reg.userId);
        const entry = byUid.get(reg.userId) ?? { key: reg.userId, uid: reg.userId, socioIds: [], names: [], contactSocioId: ownRow?.id ?? null };
        if (ownRow && !entry.socioIds.includes(ownRow.id)) entry.socioIds.push(ownRow.id);
        entry.names.push(reg.name.trim() || '—');
        byUid.set(reg.userId, entry);
      }
      return { recipients: [...byUid.values()], stored: { kind: 'event', eventId, eventTitle: event.title } };
    }
  }
}

async function accountName(firestore: Firestore, uid: string): Promise<string | null> {
  return (await userDoc(firestore, uid).get()).data()?.displayName.trim() || null;
}

async function accountEmail(firestore: Firestore, uid: string): Promise<string | null> {
  const email = (await userDoc(firestore, uid).get()).data()?.email;
  return typeof email === 'string' && email.trim() ? email.trim() : null;
}

/** Commits writes in chunks: a group can outgrow one batch. */
async function commitInChunks<T>(firestore: Firestore, items: T[], write: (batch: WriteBatch, item: T) => void): Promise<void> {
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = firestore.batch();
    for (const item of items.slice(start, start + BATCH_SIZE)) write(batch, item);
    await batch.commit();
  }
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PUSH_BODY_MAX ? `${flat.slice(0, PUSH_BODY_MAX - 1)}…` : flat;
}

/**
 * Exported for the handler tests; the callable below is the only production
 * caller. `callerUid` must be an admin of the org.
 */
export async function runSendGroupMessage(
  firestore: Firestore,
  callerUid: string,
  input: SendGroupMessageInput,
  now: Date,
): Promise<SendGroupMessageResult> {
  const { orgId, messageId } = input;
  const [org, caller, sociosSnap] = await Promise.all([
    organizationDoc(firestore, orgId).get().then((s) => s.data()),
    organizationMemberDoc(firestore, orgId, callerUid).get().then((s) => s.data()),
    organizationSociosCollection(firestore, orgId).where('bajaAt', '==', null).get(),
  ]);
  if (caller?.role !== 'admin') throw new HttpsError('permission-denied', 'No autorizado.');
  if (!org || org.status !== 'approved' || !hasSocioRoster(org.type)) {
    throw new HttpsError('failed-precondition', 'Este grupo no puede enviar mensajes.');
  }

  const messageRef = organizationMessageDoc(firestore, orgId, messageId);
  const existing = (await messageRef.get()).data();
  if (existing) {
    // A retried call: the first one already sent it.
    return { messageId, recipientCount: existing.recipientCount, pushCount: existing.pushCount, emailCount: existing.emailCount, whatsappCount: existing.whatsappCount };
  }

  const active: Socio[] = sociosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const { recipients, stored } = await resolveAudience(firestore, orgId, input.audience, active);
  if (recipients.length === 0) throw new HttpsError('failed-precondition', 'No hay nadie a quien enviarlo.');

  const ownRow = active.find((s) => s.kind === 'member' && s.uid === callerUid);
  const signerName = ownRow?.displayName.trim() || ((await userDoc(firestore, callerUid).get()).data()?.displayName ?? '').trim() || `La junta de ${org.name}`;
  const signerTitle: OrgAdminTitle | null = ownRow?.adminTitle ?? null;

  const privates = new Map<string, SocioPrivateData>(
    (await organizationSocioPrivateCollection(firestore, orgId).get()).docs.map((d) => [d.id, d.data()]),
  );

  interface Plan {
    recipient: MessageRecipient;
    push: boolean;
    email: string | null;
    whatsappSocioId: string | null;
    /** Null when the message has no placeholders. */
    personal: GroupMessagePersonalValues | null;
  }
  const placeholders = new Set([...groupMessagePlaceholdersIn(input.title), ...groupMessagePlaceholdersIn(input.body)]);
  const statuses = placeholders.has('cuota') ? await currentCuotaStatuses(firestore, orgId, active) : null;
  const rowById = new Map(active.map((s) => [s.id, s]));
  const plans: Plan[] = [];
  for (const recipient of recipients) {
    const contact = recipient.contactSocioId ? privates.get(recipient.contactSocioId) : undefined;
    // The address the socio chose to share with the junta wins; an account
    // that shared none still gets its own address, which is theirs.
    const email = input.channels.email
      ? contact?.email ?? (recipient.uid ? await accountEmail(firestore, recipient.uid) : null)
      : null;
    // The sender has the message already; their own pocket need not buzz.
    const push = input.channels.push && recipient.uid !== null && recipient.uid !== callerUid;
    const phone = contact?.phone ? normalizeLeadPhone(contact.phone) : null;
    const wantsWhatsapp =
      input.channels.whatsapp === 'all' || (input.channels.whatsapp === 'fallback' && !push && email === null);
    const whatsappSocioId = wantsWhatsapp && phone && recipient.uid !== callerUid ? recipient.contactSocioId : null;
    // A household hears as its account holder: their own name and number.
    const holder = recipient.contactSocioId ? rowById.get(recipient.contactSocioId) : undefined;
    const personal =
      placeholders.size === 0
        ? null
        : groupMessageRecipientValues({
            holderName: holder?.displayName ?? (recipient.uid && placeholders.has('nombre') ? await accountName(firestore, recipient.uid) : null),
            holderNumber: holder?.socioNumber ?? null,
            socioIds: recipient.socioIds,
            statuses,
          });
    plans.push({ recipient, push, email, whatsappSocioId, personal });
  }

  const message: GroupMessageData = {
    title: input.title,
    body: input.body,
    audience: stored,
    channels: input.channels,
    pinned: input.pinned,
    poll: input.poll,
    recipientUids: [...new Set(recipients.flatMap((r) => (r.uid ? [r.uid] : [])))],
    recipientCount: recipients.length,
    pushCount: plans.filter((p) => p.push).length,
    emailCount: 0,
    whatsappCount: plans.filter((p) => p.whatsappSocioId !== null).length,
    sentBy: callerUid,
    signerName,
    signerTitle,
    sentAt: now,
    nudgeCount: 0,
    lastNudgedAt: null,
  };
  try {
    // `create` is the claim: two overlapping calls with one id send once.
    await messageRef.create(message);
  } catch {
    const winner = (await messageRef.get()).data();
    if (!winner) throw new HttpsError('aborted', 'Inténtalo de nuevo.');
    return { messageId, recipientCount: winner.recipientCount, pushCount: winner.pushCount, emailCount: winner.emailCount, whatsappCount: winner.whatsappCount };
  }

  const deliveries = organizationMessageDeliveriesCollection(firestore, orgId, messageId);
  const deliveryOf = (p: Plan, email: GroupMessageEmailState | null): GroupMessageDeliveryData => ({
    uid: p.recipient.uid,
    socioIds: p.recipient.socioIds,
    names: p.recipient.names,
    push: p.push,
    email,
    whatsappSocioId: p.whatsappSocioId,
    whatsappSentAt: null,
    whatsappSentBy: null,
    personal: p.personal,
  });
  // The stored message keeps the admin's placeholders; each channel gets this recipient's text.
  const personalized = (p: Plan) =>
    p.personal ? personalizeGroupMessage({ title: input.title, body: input.body }, p.personal) : { title: input.title, body: input.body };
  await commitInChunks(firestore, plans, (batch, p) => {
    batch.set(deliveries.doc(p.recipient.key), deliveryOf(p, p.email ? 'pending' : null));
    if (p.push && p.recipient.uid) {
      const text = personalized(p);
      batch.set(
        userNotificationsCollection(firestore, p.recipient.uid).doc(`group_message_${messageId}`),
        buildNotificationData({
          type: 'group_message',
          title: text.title ? `${org.name} · ${text.title}` : org.name,
          body: preview(text.body),
          municipalityId: org.municipalityId,
          entityKind: 'organization',
          entityId: orgId,
          createdAt: now,
        }),
      );
    }
  });

  const emailed = plans.filter((p): p is Plan & { email: string } => p.email !== null);
  const senderEmail = await accountEmail(firestore, callerUid);
  const shared: Omit<GroupMessageEmailContent, 'title' | 'body'> = {
    poll: input.poll,
    orgName: org.name,
    signerName,
    signerTitle,
    appUrl: `${webOriginForProject(process.env['GCLOUD_PROJECT'])}${groupPath(orgId)}`,
  };
  const outcomes = await sendEmailBatch(
    emailed.map((p) => {
      const content: GroupMessageEmailContent = { ...shared, ...personalized(p) };
      return {
        to: p.email,
        subject: groupMessageEmailSubject(content),
        html: renderGroupMessageEmailHtml(content),
        text: renderGroupMessageEmailText(content),
        fromName: groupMessageFromName(content),
        // A reply reaches the admin who wrote it; with no address of theirs, Cultuvilla's inbox.
        ...(senderEmail ? { replyTo: senderEmail } : {}),
      };
    }),
    { handler, label: 'Group message email', fields: { orgId, messageId } },
  );
  const emailCount = outcomes.filter((o) => o === 'sent').length;
  await commitInChunks(firestore, emailed.map((p, i) => ({ p, outcome: outcomes[i] ?? 'failed' })), (batch, { p, outcome }) => {
    batch.update(deliveries.doc(p.recipient.key), { email: outcome });
  });
  await messageRef.update({ emailCount });

  logger.info('Group message sent', {
    handler,
    orgId,
    messageId,
    audience: stored.kind,
    recipientCount: message.recipientCount,
    pushCount: message.pushCount,
    emailCount,
    emailFailed: outcomes.filter((o) => o === 'failed').length,
    whatsappCount: message.whatsappCount,
  });
  return { messageId, recipientCount: message.recipientCount, pushCount: message.pushCount, emailCount, whatsappCount: message.whatsappCount };
}

/**
 * An admin's message to the group: push through the notification pipeline
 * (each account's preferences and the group's mute apply), email in the
 * admin's name, and the WhatsApp links the admin then sends by hand. The
 * message and every recipient's delivery are the group's history.
 *
 * Callable because it fans out to other users' notifications and reads the
 * socios' contact data, which no client may do for the whole roster at once.
 */
export const sendGroupMessage = onCall<unknown, Promise<SendGroupMessageResult>>(
  { region: 'us-central1', cors: true, secrets: [RESEND_API_KEY], timeoutSeconds: 300 },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const parsed = SendGroupMessageInputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Mensaje no válido.');
    return runSendGroupMessage(db, callerUid, parsed.data, new Date());
  },
);
