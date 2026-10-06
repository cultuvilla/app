import type { Firestore } from 'firebase-admin/firestore';
import { buildNotificationData, type NotificationDataInput } from '@cultuvilla/shared/models';
import { municipalityMembersCollection, userNotificationsCollection } from '@cultuvilla/shared/firebase/refs/admin';

/** gRPC ALREADY_EXISTS — `create()` on a doc that is there. */
const ALREADY_EXISTS = 6;

/**
 * Write one notification per uid under a deterministic id, skipping anyone who
 * already holds it. Returns how many were new.
 *
 * `create()` rather than `set()`: both callers can run more than once for the
 * same Wrapped — the scheduler every hour, a publish racing the timer — and a
 * notification already delivered must not be delivered, or pushed, again.
 */
async function notifyOnce(
  db: Firestore,
  uids: string[],
  notificationId: string,
  input: NotificationDataInput,
): Promise<number> {
  const results = await Promise.all(
    uids.map(async (uid) => {
      try {
        await userNotificationsCollection(db, uid).doc(notificationId).create(buildNotificationData(input));
        return 1;
      } catch (error) {
        if ((error as { code?: unknown }).code === ALREADY_EXISTS) return 0;
        throw error;
      }
    }),
  );
  return results.reduce<number>((a, b) => a + b, 0);
}

/** Ask every village admin to create the year's Wrapped. */
export async function remindVillageAdmins(
  db: Firestore,
  municipalityId: string,
  villageName: string,
  year: number,
  wrappedId: string,
): Promise<number> {
  const admins = await municipalityMembersCollection(db, municipalityId).where('role', '==', 'admin').get();
  return notifyOnce(db, admins.docs.map((m) => m.id), `wrapped_reminder_${wrappedId}`, {
    type: 'village_wrapped_reminder',
    title: `¿Creamos el resumen de Fiestas ${String(year)}?`,
    body: `Elige las fechas de las fiestas de ${villageName} y prepara el resumen para compartir.`,
    municipalityId,
    entityId: wrappedId,
  });
}

/**
 * Tell every member of the village its Wrapped is out. The Wrapped is the
 * pueblo's, not the admins', so the whole membership hears — and it is the
 * moment the thing is most worth forwarding.
 */
export async function announceWrappedPublished(
  db: Firestore,
  wrapped: { municipalityId: string; villageName: string; year: number },
  wrappedId: string,
): Promise<number> {
  const members = await municipalityMembersCollection(db, wrapped.municipalityId).get();
  return notifyOnce(db, members.docs.map((m) => m.id), `wrapped_published_${wrappedId}`, {
    type: 'village_wrapped_published',
    title: `Ya está el resumen de las fiestas de ${wrapped.villageName}`,
    body: `Fiestas ${String(wrapped.year)}: lo que se hizo, en números y en fotos. Míralo y compártelo.`,
    municipalityId: wrapped.municipalityId,
    entityId: wrappedId,
  });
}
