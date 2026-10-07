import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  adminDoc,
  municipalityDoc,
  censoAnswersCollection,
  censoAnswersDoc,
  municipalityMemberDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  ensureValidFieldShape,
  validateTransition,
  type PrevField,
  type ProfileFormField,
  type UsedValuesByKey,
} from '../helpers/profileFormValidation';

const db = getFirestore();

interface UpdateCensoData {
  municipalityId?: string;
  fields?: ProfileFormField[];
}

interface UpdateCensoResult {
  ok: true;
  fieldCount: number;
}

interface MemberScan {
  used: UsedValuesByKey;
  memberIdsByKey: Record<string, string[]>;
}

async function scanMembers(municipalityId: string): Promise<MemberScan> {
  const used: UsedValuesByKey = {};
  const memberIdsByKey: Record<string, string[]> = {};
  const answersSnap = await censoAnswersCollection(db)
    .where('municipalityId', '==', municipalityId)
    .get();
  for (const m of answersSnap.docs) {
    const { userId, profileAnswers: answers } = m.data();
    for (const [k, v] of Object.entries(answers)) {
      const existing = used[k] as Set<string | number | boolean> | undefined;
      const bucket = existing ?? new Set<string | number | boolean>();
      if (!existing) used[k] = bucket;
      const hasValue = Array.isArray(v) ? v.length > 0 : v !== '';
      if (Array.isArray(v)) {
        for (const item of v) if (typeof item === 'string') bucket.add(item);
      } else if (v !== '') {
        bucket.add(v);
      }
      if (hasValue) {
        (memberIdsByKey[k] ??= []).push(userId);
      }
    }
  }
  return { used, memberIdsByKey };
}

export const updateCenso = onCall<UpdateCensoData, Promise<UpdateCensoResult>>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const { municipalityId, fields } = request.data;
    if (!municipalityId || !Array.isArray(fields)) {
      throw new HttpsError('invalid-argument', 'Faltan parámetros.');
    }

    fields.forEach(ensureValidFieldShape);

    // Verify the caller is a village admin (or app admin).
    const memberRef = municipalityMemberDoc(db, municipalityId, auth.uid);
    const memberSnap = await memberRef.get();
    const isVillageAdmin = memberSnap.exists && memberSnap.data()?.role === 'admin';
    // admins/ collection has no typed ref yet — existence-check only.
    const adminDocRef = adminDoc(db, auth.uid);
    const isAppAdmin = (await adminDocRef.get()).exists;
    if (!isVillageAdmin && !isAppAdmin) {
      throw new HttpsError('permission-denied', 'Solo el coordinador puede modificar el censo.');
    }

    const municipalityRef = municipalityDoc(db, municipalityId);
    const municipalitySnap = await municipalityRef.get();
    if (!municipalitySnap.exists) {
      throw new HttpsError('not-found', 'El pueblo no existe.');
    }

    // Converter-wrapped: typed MunicipalityData. profileForm and its fields
    // are already normalized to the schema shape (Date for updatedAt).
    const community = municipalitySnap.data()?.community;
    const prevFields: PrevField[] = community?.profileForm?.fields ?? [];

    const { used, memberIdsByKey } = await scanMembers(municipalityId);
    validateTransition(prevFields, fields, used);

    const nextKeys = new Set(fields.map((f) => f.key));
    const removedAnsweredKeys = prevFields
      .map((f) => f.key)
      .filter((k) => !nextKeys.has(k) && k in memberIdsByKey);

    const batch = db.batch();
    // .update(ref, fieldPath, value) form: serverTimestamp on the nested
    // updatedAt is fine because batch.update bypasses the converter.
    batch.update(municipalityRef, 'community.profileForm', {
      fields,
      updatedAt: FieldValue.serverTimestamp(),
    });
    for (const key of removedAnsweredKeys) {
      for (const uid of memberIdsByKey[key] ?? []) {
        batch.update(censoAnswersDoc(db, municipalityId, uid), `profileAnswers.${key}`, FieldValue.delete());
      }
    }
    // Single batch: 1 schema write + one delete per (removed-answered-key × member).
    // Village member counts stay well under Firestore's 500-op batch limit (see spec).
    await batch.commit();

    return { ok: true, fieldCount: fields.length };
  },
);
