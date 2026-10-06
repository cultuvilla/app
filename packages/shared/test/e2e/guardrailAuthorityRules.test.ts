// Firestore Rules e2e tests for the "authority field" locks.
//
// These all guard one bug shape found by a guardrail audit: a rule derives
// authority from a document field, but never stops the client from rewriting
// that field. The UI never offers these writes, so no screen-level check
// catches them — only the rules can.
import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const VILLAGE = 'muni-1';
const OTHER_VILLAGE = 'muni-2';
const ADMIN = 'uid-admin';
const MEMBER = 'uid-member';
const ATTACKER = 'uid-attacker';
const VICTIM = 'uid-victim';

async function seedMember(municipalityId: string, uid: string, role: 'admin' | 'user') {
  await seed(getEnv(), async (ctx) => {
    await setDoc(doc(ctx.firestore(), `municipalities/${municipalityId}/members/${uid}`), {
      userId: uid,
      role,
      joinedAt: new Date(),
    });
  });
}

async function seedMunicipality(municipalityId: string, organizerId: string | null) {
  await seed(getEnv(), async (ctx) => {
    await setDoc(doc(ctx.firestore(), `municipalities/${municipalityId}`), {
      name: 'Villapueblo',
      nameLower: 'villapueblo',
      province: 'Soria',
      comunidadAutonoma: 'Castilla y León',
      codigoINE: '42001',
      coordinates: null,
      locationLabel: null,
      mapZoom: null,
      createdAt: new Date(),
      escudoUrl: null,
      escudoThumbUrl: null,
      escudoManualUrl: null,
      communityActive: true,
      community: {
        description: 'Nuestro pueblo',
        organizerId,
        organizerSex: null,
        profileForm: null,
        activatedAt: new Date(),
      },
    });
  });
}

describe('firestore.rules — authority-field locks', () => {
  describe('persons/{personId}.userId', () => {
    // syncPersonDenormalization projects this doc's name onto
    // users/{userId}.displayName with the admin SDK, so an unconstrained
    // userId is a write primitive against someone else's profile.
    const person = (userId: string | null, createdBy: string) => ({
      givenName: 'Ana',
      middleNames: [],
      firstSurname: 'García',
      secondSurname: null,
      nickname: null,
      sex: null,
      birthday: null,
      deathDate: null,
      birthPlace: null,
      burialPlace: null,
      municipalityLinks: [],
      occupations: [],
      biography: null,
      photoURL: null,
      userId,
      isPublic: true,
      createdBy,
      createdAt: serverTimestamp(),
    });

    it('rejects a person pointed at another user', async () => {
      const db = asUser(getEnv(), ATTACKER);
      await assertFails(setDoc(doc(db, 'persons/p-hijack'), person(VICTIM, ATTACKER)));
    });

    it('allows a persona claiming nobody', async () => {
      const db = asUser(getEnv(), ATTACKER);
      await assertSucceeds(setDoc(doc(db, 'persons/p-dependent'), person(null, ATTACKER)));
    });

    it('allows a person claiming its own owner', async () => {
      const db = asUser(getEnv(), ATTACKER);
      await assertSucceeds(setDoc(doc(db, 'persons/p-self'), person(ATTACKER, ATTACKER)));
    });

    it('rejects repointing an existing person at another user', async () => {
      await seed(getEnv(), async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'persons/p-owned'), {
          ...person(null, ATTACKER),
          createdAt: new Date(),
        });
      });
      const db = asUser(getEnv(), ATTACKER);
      await assertFails(updateDoc(doc(db, 'persons/p-owned'), { userId: VICTIM }));
    });
  });

  describe('municipalities/{id}', () => {
    beforeEach(async () => {
      await seedMunicipality(VILLAGE, null);
      await seedMember(VILLAGE, ADMIN, 'admin');
    });

    it('rejects a village admin self-appointing as founding organizer', async () => {
      const db = asUser(getEnv(), ADMIN);
      await assertFails(
        updateDoc(doc(db, `municipalities/${VILLAGE}`), {
          'community.organizerId': ADMIN,
        }),
      );
    });

    it('rejects a village admin rewriting the Embajador title gender', async () => {
      const db = asUser(getEnv(), ADMIN);
      await assertFails(
        updateDoc(doc(db, `municipalities/${VILLAGE}`), {
          'community.organizerSex': 'female',
        }),
      );
    });

    it('rejects a village admin rewriting INE identity', async () => {
      const db = asUser(getEnv(), ADMIN);
      await assertFails(
        updateDoc(doc(db, `municipalities/${VILLAGE}`), { codigoINE: '99999' }),
      );
    });

    it('rejects a village admin deactivating the community', async () => {
      const db = asUser(getEnv(), ADMIN);
      await assertFails(
        updateDoc(doc(db, `municipalities/${VILLAGE}`), { communityActive: false }),
      );
    });

    it('still allows a village admin to edit the community description', async () => {
      const db = asUser(getEnv(), ADMIN);
      await assertSucceeds(
        updateDoc(doc(db, `municipalities/${VILLAGE}`), {
          'community.description': 'Un pueblo con encanto',
        }),
      );
    });
  });

  describe('organizations/{orgId}', () => {
    beforeEach(async () => {
      await seed(getEnv(), async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'organizations/org-1'), {
          name: 'Peña El Trueno',
          type: 'peña',
          status: 'approved',
          municipalityId: VILLAGE,
          requestedBy: MEMBER,
          createdAt: new Date(),
          commentCount: 0,
          readCount: 0,
          memberCount: 1,
        });
        await setDoc(doc(ctx.firestore(), `organizations/org-1/members/${MEMBER}`), {
          userId: MEMBER,
          role: 'admin',
          joinedAt: new Date(),
        });
      });
    });

    it('rejects an org admin promoting their peña to ayuntamiento', async () => {
      const db = asUser(getEnv(), MEMBER);
      await assertFails(updateDoc(doc(db, 'organizations/org-1'), { type: 'ayuntamiento' }));
    });

    it('rejects an org admin moving the org to another village', async () => {
      const db = asUser(getEnv(), MEMBER);
      await assertFails(
        updateDoc(doc(db, 'organizations/org-1'), { municipalityId: OTHER_VILLAGE }),
      );
    });

    it('still allows an org admin to edit ordinary content', async () => {
      const db = asUser(getEnv(), MEMBER);
      await assertSucceeds(
        updateDoc(doc(db, 'organizations/org-1'), { name: 'Peña El Trueno Rojo' }),
      );
    });
  });

  describe('comments/{commentId}.municipalityId', () => {
    // Comment delete authority is isVillageAdmin(resource.data.municipalityId),
    // so a comment carrying a foreign municipalityId is beyond the reach of the
    // admins who actually moderate the entity it hangs off.
    beforeEach(async () => {
      await seed(getEnv(), async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'news/news-1'), {
          title: 'Fiestas',
          municipalityId: VILLAGE,
          createdBy: MEMBER,
          organizerUserIds: [MEMBER],
          status: 'active',
          createdAt: new Date(),
        });
      });
    });

    const comment = (municipalityId: string) => ({
      entityKind: 'news',
      entityId: 'news-1',
      municipalityId,
      authorUserId: ATTACKER,
      body: 'Hola',
      createdAt: serverTimestamp(),
      parentCommentId: null,
      replyCount: 0,
    });

    it('rejects a comment claiming a village its target does not belong to', async () => {
      const db = asUser(getEnv(), ATTACKER);
      await assertFails(setDoc(doc(db, 'comments/c-evasive'), comment(OTHER_VILLAGE)));
    });

    it('rejects a comment on an entity that does not exist', async () => {
      const db = asUser(getEnv(), ATTACKER);
      await assertFails(
        setDoc(doc(db, 'comments/c-ghost'), { ...comment(VILLAGE), entityId: 'nope' }),
      );
    });

    it('allows a comment carrying its target village', async () => {
      const db = asUser(getEnv(), ATTACKER);
      await assertSucceeds(setDoc(doc(db, 'comments/c-ok'), comment(VILLAGE)));
    });
  });

  describe('events/{eventId}/registrations/{regId}', () => {
    beforeEach(async () => {
      await seed(getEnv(), async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'events/ev-1'), {
          title: 'Verbena',
          municipalityId: VILLAGE,
          createdBy: MEMBER,
          organizerUserIds: [MEMBER],
          createdAt: new Date(),
        });
        await setDoc(doc(ctx.firestore(), 'events/ev-1/registrations/reg-1'), {
          userId: ATTACKER,
          personId: 'p-1',
          name: 'Ana',
          status: 'waitlisted',
          position: 3,
          isMember: false,
          paidAt: null,
        });
      });
    });

    it('rejects a waitlisted registrant promoting themselves', async () => {
      const db = asUser(getEnv(), ATTACKER);
      await assertFails(
        updateDoc(doc(db, 'events/ev-1/registrations/reg-1'), { status: 'confirmed' }),
      );
    });

    it('rejects a registrant jumping the waitlist queue', async () => {
      const db = asUser(getEnv(), ATTACKER);
      await assertFails(
        updateDoc(doc(db, 'events/ev-1/registrations/reg-1'), { position: 0 }),
      );
    });

    it('still allows the event organizer to set status', async () => {
      const db = asUser(getEnv(), MEMBER);
      await assertSucceeds(
        updateDoc(doc(db, 'events/ev-1/registrations/reg-1'), { status: 'confirmed' }),
      );
    });
  });

  describe('places/{placeId}.proposedBy', () => {
    beforeEach(async () => {
      await seedMember(VILLAGE, MEMBER, 'user');
      await seed(getEnv(), async (ctx) => {
        await setDoc(doc(ctx.firestore(), `municipalities/${VILLAGE}/places/pl-1`), {
          name: 'La Fuente',
          proposedBy: MEMBER,
          status: 'active',
          commentCount: 0,
          readCount: 0,
          burialCount: 0,
          createdAt: new Date(),
        });
      });
    });

    it('rejects handing a place to someone else', async () => {
      const db = asUser(getEnv(), MEMBER);
      await assertFails(
        updateDoc(doc(db, `municipalities/${VILLAGE}/places/pl-1`), { proposedBy: ATTACKER }),
      );
    });

    it('still allows the creator to edit the place', async () => {
      const db = asUser(getEnv(), MEMBER);
      await assertSucceeds(
        updateDoc(doc(db, `municipalities/${VILLAGE}/places/pl-1`), { name: 'La Fuente Vieja' }),
      );
    });
  });
});
