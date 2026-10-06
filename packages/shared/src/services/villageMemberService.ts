import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  where,
  query,
  writeBatch,
  type QueryDocumentSnapshot,
} from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import {
  municipalityMembersCollection,
  municipalityMemberDoc,
} from '../firebase/refs/client';
import { villageMemberConverterClient } from '../firebase/converters/villageMemberConverter.client';
import { buildVillageMemberData } from '../models/municipality/VillageMemberDataModel';
import { buildResidenceLinks } from '../models/person/PersonDataModel';
import { setActiveMunicipality } from './userService';
import { getPersonByUserId } from './personService';
import { getMunicipality, startVillage } from './municipalityService';
import type {
  VillageMemberData,
  VillageMemberRole,
} from '../models/municipality/VillageMemberDataModel';
import { watchQueryWith, type Unwatch, type WatchError } from './watch';

export async function getVillageMember(
  municipalityId: string,
  userId: string,
): Promise<(VillageMemberData & { id: string }) | null> {
  const snap = await getDoc(municipalityMemberDoc(getDb(), municipalityId, userId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getVillageMembers(
  municipalityId: string,
): Promise<(VillageMemberData & { id: string })[]> {
  const snap = await getDocs(municipalityMembersCollection(getDb(), municipalityId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Join a village as the calling user and make it their active village.
 *
 * Residence is single-source-of-truth on the caller's person doc, so the member
 * doc and the residence link are written in one atomic `writeBatch` — no
 * eventual-consistency window (barrio residency shows up the instant the join
 * lands). `barrioId` is the chosen residence within the village (`null` = whole
 * village). Both docs are owner-writable, so the batch passes Firestore rules.
 *
 * The residence link is written via `buildResidenceLinks`, the single constructor
 * of the exact `{ municipalityId, barrioId }` shape that `getPersonsByBarrio`
 * matches on. If the caller has no person doc yet, only the membership is created
 * (residence gets set when their person exists) — but the self-service join
 * surfaces always run post-onboarding, so a person is present in practice.
 *
 * Also patches users/{userId}.activeMunicipalityId so the Pueblo tab immediately
 * surfaces the joined village.
 */
export async function joinVillage(
  municipalityId: string,
  userId: string,
  barrioId: string | null = null,
): Promise<void> {
  const db = getDb();
  const person = await getPersonByUserId(userId, userId);

  const batch = writeBatch(db);
  batch.set(
    municipalityMemberDoc(db, municipalityId, userId),
    buildVillageMemberData({ userId, role: 'user' }),
  );
  if (person) {
    const others = person.municipalityLinks.filter((l) => l.municipalityId !== municipalityId);
    // Raw doc ref: batch.update takes field paths, bypassing the converter.
    batch.update(doc(db, 'persons', person.id), {
      municipalityLinks: [...others, ...buildResidenceLinks(municipalityId, barrioId)],
    });
  }
  await batch.commit();

  await setActiveMunicipality(userId, municipalityId);
}

/**
 * Land the caller in a village, activating it first if it is still dormant.
 *
 * The single entry point registration and the logged-out "sign in to join" flow
 * use to become a villager. It closes the gap that let a picked village never
 * turn into a membership: whichever branch runs, a `members/{uid}` doc ends up
 * existing — the doc the profile's village list reads.
 *
 * - Community already active → a plain self-service {@link joinVillage} (allowed
 *   by rules because `isCommunityActive`).
 * - Dormant municipality → {@link startVillage}, which is self-service (any
 *   authenticated user; organizer stays null) and *itself* seats the caller as
 *   the first member (role `user`) server-side. Activation doesn't touch
 *   `activeMunicipalityId`, so we set it here to mirror `joinVillage`.
 *
 * A missing municipality is treated as dormant so we attempt activation rather
 * than fire a self-join that the rules would deny.
 */
export async function ensureVillageMembership(
  municipalityId: string,
  userId: string,
  barrioId: string | null = null,
): Promise<void> {
  const municipality = await getMunicipality(municipalityId);
  if (municipality?.communityActive) {
    await joinVillage(municipalityId, userId, barrioId);
    return;
  }
  await startVillage({ municipalityId });
  await setActiveMunicipality(userId, municipalityId);
}

/**
 * Self-leave a village. Membership and residence are two docs, both
 * owner-writable, so the member delete and the residence-link removal go in one
 * atomic `writeBatch` — no eventual-consistency window. The delete-trigger
 * `syncMemberBarrioToResidence` still fires on the member delete but finds the
 * link already gone (idempotent no-op). Caller reassigns `activeMunicipalityId`.
 */
export async function leaveVillage(municipalityId: string, userId: string): Promise<void> {
  const db = getDb();
  const person = await getPersonByUserId(userId, userId);

  const batch = writeBatch(db);
  batch.delete(municipalityMemberDoc(db, municipalityId, userId));
  if (person) {
    const remaining = person.municipalityLinks.filter((l) => l.municipalityId !== municipalityId);
    // Raw doc ref: batch.update takes field paths, bypassing the converter.
    batch.update(doc(db, 'persons', person.id), { municipalityLinks: remaining });
  }
  await batch.commit();
}

/**
 * Membership and authority in one read. `null` = not a member. Prefer this
 * over calling isVillageMember + isVillageAdmin, which read the same doc twice
 * to answer two halves of the same question (useEntityCapabilities needs both
 * on every entity screen).
 */
export async function getVillageMemberRole(
  municipalityId: string,
  userId: string,
): Promise<VillageMemberRole | null> {
  const snap = await getDoc(municipalityMemberDoc(getDb(), municipalityId, userId));
  if (!snap.exists()) return null;
  return snap.data().role;
}

export async function isVillageMember(
  municipalityId: string,
  userId: string,
): Promise<boolean> {
  return (await getVillageMemberRole(municipalityId, userId)) !== null;
}

export async function isVillageAdmin(
  municipalityId: string,
  userId: string,
): Promise<boolean> {
  return (await getVillageMemberRole(municipalityId, userId)) === 'admin';
}

/**
 * Promote/demote a village member's role. The ONLY way to create (or remove) a
 * village admin — a thin wrapper over the `changeVillageMemberRole` callable,
 * which checks caller authority, updates the role, and writes a
 * `membershipEvents` audit record in one transaction. Clients can no longer
 * write `role` directly (firestore.rules makes it function-owned), so there is
 * no non-audited path.
 */
export async function setVillageMemberRole(
  municipalityId: string,
  userId: string,
  role: VillageMemberRole,
): Promise<void> {
  const fn = httpsCallable<
    { municipalityId: string; targetUserId: string; role: VillageMemberRole },
    { ok: true }
  >(getFirebaseFunctions(), 'changeVillageMemberRole');
  await fn({ municipalityId, targetUserId: userId, role });
}

/**
 * Hand the pueblo's single Embajador title to another member — a thin wrapper
 * over the audited `transferVillageAmbassador` callable. Only the current
 * Embajador (or an app admin) may call it; the target becomes admin if needed.
 */
export async function transferVillageAmbassador(
  municipalityId: string,
  targetUserId: string,
): Promise<void> {
  const fn = httpsCallable<
    { municipalityId: string; targetUserId: string },
    { ok: true }
  >(getFirebaseFunctions(), 'transferVillageAmbassador');
  await fn({ municipalityId, targetUserId });
}

export interface UserMembership {
  municipalityId: string;
  role: VillageMemberRole;
  joinedAt: Date;
  profileCompletedAt: Date | null;
}

function userMembershipsQuery(userId: string) {
  // collectionGroup doesn't carry the per-collection converter; attach it explicitly.
  const cg = collectionGroup(getDb(), 'members').withConverter(villageMemberConverterClient);
  return query(cg, where('userId', '==', userId));
}

// The group also returns organizations/{id}/members; those are dropped by path
// BEFORE `data()`, since the village converter would reject an org member row.
function userMembershipRows(docs: QueryDocumentSnapshot<VillageMemberData>[]): UserMembership[] {
  return docs
    .filter((d) => d.ref.parent.parent?.parent.id === 'municipalities')
    .map((d) => {
      const data = d.data();
      const municipalityId = d.ref.parent.parent?.id;
      if (!municipalityId) throw new Error('member doc missing municipality parent');
      return {
        municipalityId,
        role: data.role,
        joinedAt: data.joinedAt,
        profileCompletedAt: data.profileCompletedAt,
      };
    });
}

export async function getUserMemberships(userId: string): Promise<UserMembership[]> {
  const snap = await getDocs(userMembershipsQuery(userId));
  return userMembershipRows(snap.docs);
}

export function watchUserMemberships(
  userId: string,
  onNext: (memberships: UserMembership[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQueryWith(userMembershipsQuery(userId), userMembershipRows, onNext, onError);
}
