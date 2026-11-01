// packages/shared/src/services/socioService.ts
import {
  doc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import {
  organizationSociosCollection,
  organizationSocioDoc,
  organizationSocioPersonaLockDoc,
  organizationSocioPrivateCollection,
  organizationSocioPrivateDoc,
} from '../firebase/refs/client';
import {
  buildSocioData,
  buildSocioPrivateData,
  type OrgAdminTitle,
  type SocioData,
  type SocioPrivateData,
} from '../models/organization/SocioDataModel';
import { watchDoc, watchMerged, watchQuery, type Unwatch, type WatchError } from './watch';

export type Socio = SocioData & { id: string };
export type SocioPrivate = SocioPrivateData & { id: string };

export interface SocioContactInput {
  phone: string | null;
  email: string | null;
}

// =============================================================================
// READS
// =============================================================================

/**
 * The whole roster, bajas included, by name. Rules let only the org's admins
 * read it — and its members too while the org's `sociosListVisible` is on.
 */
export function watchOrgSocios(
  orgId: string,
  onNext: (socios: Socio[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(query(organizationSociosCollection(getDb(), orgId), orderBy('displayName')), onNext, onError);
}

/**
 * The rows any member may read whatever the org's settings: their own member
 * row and the personas a cargo they answer for.
 */
export function watchMySocios(
  orgId: string,
  uid: string,
  onNext: (socios: Socio[]) => void,
  onError: WatchError,
): Unwatch {
  const coll = organizationSociosCollection(getDb(), orgId);
  return watchMerged<Socio>(
    [
      (next, error) => watchQuery(query(coll, where('uid', '==', uid)), next, error),
      (next, error) => watchQuery(query(coll, where('responsibleUid', '==', uid)), next, error),
    ],
    (rows) => rows,
    onNext,
    onError,
  );
}

/** Contact data of one socio — readable by the org's admins and the socio. */
export function watchSocioPrivate(
  orgId: string,
  socioId: string,
  onNext: (data: SocioPrivate | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(organizationSocioPrivateDoc(getDb(), orgId, socioId), onNext, onError);
}

/** Every socio's contact data, keyed by socio id — the org's admins only. */
export function watchOrgSocioPrivates(
  orgId: string,
  onNext: (rows: SocioPrivate[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(organizationSocioPrivateCollection(getDb(), orgId), onNext, onError);
}

// =============================================================================
// WRITES
// =============================================================================

export interface TypedSocioInput extends SocioContactInput {
  displayName: string;
  /** The group's number for them; null leaves it to `assignSocioNumber` on add. */
  socioNumber: number | null;
}

/** Admin: add a socio who has no account. Returns the new socio id. */
export async function addTypedSocio(
  orgId: string,
  input: TypedSocioInput,
  adminUid: string,
): Promise<string> {
  const db = getDb();
  const ref = doc(organizationSociosCollection(db, orgId));
  const batch = writeBatch(db);
  batch.set(
    ref,
    buildSocioData({ kind: 'typed', displayName: input.displayName, socioNumber: input.socioNumber, createdBy: adminUid }),
  );
  batch.set(organizationSocioPrivateDoc(db, orgId, ref.id), buildSocioPrivateData(input));
  await batch.commit();
  return ref.id;
}

/** Admin: correct a typed-in socio's name, number or contact data. */
export async function updateTypedSocio(
  orgId: string,
  socioId: string,
  input: TypedSocioInput,
): Promise<void> {
  const db = getDb();
  const batch = writeBatch(db);
  // Raw ref: the typed UpdateData chokes on a nullable field.
  batch.update(doc(db, 'organizations', orgId, 'socios', socioId), {
    displayName: input.displayName.trim(),
    socioNumber: input.socioNumber,
  });
  batch.set(organizationSocioPrivateDoc(db, orgId, socioId), buildSocioPrivateData(input));
  await batch.commit();
}

/**
 * Member: make one of their personas a cargo a socio. Returns the new socio id.
 * Writes the persona's lock in the same batch, so the rules refuse a second
 * active row for the same persona — added twice from two devices, one fails.
 */
export async function addPersonaSocio(
  orgId: string,
  persona: { id: string; displayName: string },
  responsibleUid: string,
): Promise<string> {
  const db = getDb();
  const ref = doc(organizationSociosCollection(db, orgId));
  const batch = writeBatch(db);
  batch.set(
    ref,
    buildSocioData({
      kind: 'persona',
      displayName: persona.displayName,
      personId: persona.id,
      responsibleUid,
      createdBy: responsibleUid,
    }),
  );
  batch.set(organizationSocioPersonaLockDoc(db, orgId, persona.id), { socioId: ref.id });
  await batch.commit();
  return ref.id;
}

/**
 * Give a socio the baja. The row stays — it is the libro de socios. A persona's
 * lock goes with it, so the persona can be added again later. A member's own
 * row takes its baja from leaving the org (the `syncOrgSocioRoster` trigger),
 * never from here; rules allow this on persona and typed rows only.
 */
export async function setSocioBaja(
  orgId: string,
  socio: Pick<Socio, 'id' | 'kind' | 'personId'>,
): Promise<void> {
  const db = getDb();
  const batch = writeBatch(db);
  batch.update(organizationSocioDoc(db, orgId, socio.id), { bajaAt: serverTimestamp() });
  if (socio.kind === 'persona' && socio.personId) {
    batch.delete(organizationSocioPersonaLockDoc(db, orgId, socio.personId));
  }
  await batch.commit();
}

/** Admin: number, renumber or un-number any row of the libro, bajas included. */
export async function setSocioNumber(orgId: string, socioId: string, socioNumber: number | null): Promise<void> {
  // Same-line raw ref: the typed UpdateData chokes on a nullable field (see add-firestore-collection).
  await updateDoc(doc(getDb(), 'organizations', orgId, 'socios', socioId), { socioNumber });
}

/** Admin: set or clear an org admin's display title (presidente, tesorero…). */
export async function setSocioAdminTitle(
  orgId: string,
  socioId: string,
  adminTitle: OrgAdminTitle | null,
): Promise<void> {
  // Same-line raw ref: the typed UpdateData chokes on a nullable enum (see add-firestore-collection).
  await updateDoc(doc(getDb(), 'organizations', orgId, 'socios', socioId), { adminTitle });
}

/**
 * Member: answer, for their own row, which contact data the junta may see. A
 * null field is not shared. Overwrites any earlier answer.
 */
export async function saveSocioContactSharing(
  orgId: string,
  socioId: string,
  contact: SocioContactInput,
): Promise<void> {
  await setDoc(
    organizationSocioPrivateDoc(getDb(), orgId, socioId),
    buildSocioPrivateData({ ...contact, consentAnsweredAt: new Date() }),
  );
}

/**
 * Admin: a typed-in socio turned out to be a member who joined with the app.
 * The `linkSocioToMember` callable merges the two rows into one member row that
 * keeps the earlier alta.
 */
export async function linkSocioToMember(orgId: string, socioId: string, memberUid: string): Promise<void> {
  const fn = httpsCallable<{ orgId: string; socioId: string; memberUid: string }, { ok: true }>(
    getFirebaseFunctions(),
    'linkSocioToMember',
  );
  await fn({ orgId, socioId, memberUid });
}
