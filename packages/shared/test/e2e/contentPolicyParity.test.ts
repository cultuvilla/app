// The client's content policy (src/policy/contentPolicy.ts) against the real
// firestore.rules. For every kind × doc variant × actor, the rules' answer to a
// minimal update and to the delete the app performs must equal `can(...)`. A
// button the server refuses — or a missing button the server would allow —
// fails here instead of reaching a user.
//
// The rules are the documented behaviour: when this test fails, fix the
// policy, not the rules (unless the rule change is the point of the PR).
import { describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAnon, asUser, seed } from '../helpers/roles';
import {
  can,
  CONTENT_POLICY,
  KNOWN_DIVERGENCES,
  type Actor,
  type PolicyKind,
} from '../../src/policy';
import { buildHistoryEntryData } from '../../src/models/history/HistoryEntryDataModel';

const getEnv = useRulesTestEnv();

const M = 'm1';
const ORG = 'org1';

const ACTORS = {
  anon: { uid: null, isAppAdmin: false, isVillageAdmin: false },
  stranger: { uid: 'stranger', isAppAdmin: false, isVillageAdmin: false },
  member: { uid: 'member', isAppAdmin: false, isVillageAdmin: false },
  author: { uid: 'author', isAppAdmin: false, isVillageAdmin: false },
  organizer: { uid: 'organizer', isAppAdmin: false, isVillageAdmin: false },
  orgAdmin: { uid: 'orgboss', isAppAdmin: false, isVillageAdmin: false, isOrgAdmin: true },
  villageAdmin: { uid: 'boss', isAppAdmin: false, isVillageAdmin: true },
  appAdmin: { uid: 'root', isAppAdmin: true, isVillageAdmin: false },
} satisfies Record<string, Actor>;
type ActorName = keyof typeof ACTORS;

async function seedRoles() {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const member = (role: 'user' | 'admin') => ({
      role,
      joinedAt: new Date(),
      profileAnswers: {},
      profileCompletedAt: null,
    });
    for (const uid of ['member', 'author', 'organizer', 'orgboss']) {
      await setDoc(doc(db, `municipalities/${M}/members/${uid}`), member('user'));
    }
    await setDoc(doc(db, `municipalities/${M}/members/boss`), member('admin'));
    await setDoc(doc(db, 'admins/root'), { createdAt: new Date() });
    await setDoc(doc(db, `organizations/${ORG}/members/orgboss`), { joinedAt: new Date(), role: 'admin' });
  });
}

function eventDoc() {
  return {
    title: 'Fiesta',
    description: 'desc',
    startDate: new Date('2026-07-01'),
    endDate: null,
    location: { coordinates: { lat: 40.0, lng: -3.0 }, displayName: 'Plaza Mayor' },
    imageURL: null,
    maxAttendees: null,
    telephoneRequired: false,
    requiresPayment: false,
    signupFields: [],
    attendeesVisibility: 'members',
    signupGroupSize: 1,
    minBirthYear: null,
    maxBirthYear: null,
    visibility: 'public',
    visibilityOrgId: null,
    signupEnabled: true,
    signupInfo: null,
    status: 'published',
    organizerUserIds: ['author', 'organizer'],
    organizerOrgIds: [],
    createdBy: 'author',
    createdAt: new Date(),
    updatedAt: new Date(),
    municipalityId: M,
    villageName: 'Villa',
    villageSlug: 'villa',
    villageCoverImage: null,
    villageCoordinates: null,
    commentCount: 0,
    readCount: 0,
    endBoundary: new Date('2026-07-01'),
  };
}

const hidden = (status: string) =>
  status === 'hidden'
    ? { status, hiddenBy: 'boss', hiddenAt: new Date(), hiddenReason: 'spam' }
    : { status, hiddenBy: null, hiddenAt: null, hiddenReason: null };

interface Case {
  kind: PolicyKind;
  label: string;
  path: string;
  data: Record<string, unknown>;
  /** A minimal edit the app could make. */
  patch: Record<string, unknown>;
}

const STATUSES = ['active', 'hidden'] as const;

const CASES: Case[] = [
  { kind: 'event', label: 'published', path: 'events/e1', data: eventDoc(), patch: { title: 'Fiesta mayor' } },
  ...STATUSES.map((s) => ({
    kind: 'news' as const,
    label: s,
    path: 'news/n1',
    data: {
      municipalityId: M,
      villageSlug: 'villa',
      title: 'Bando',
      createdBy: 'author',
      organizerUserIds: ['author', 'organizer'],
      organizerOrgIds: [],
      createdAt: new Date(),
      publishedAt: new Date(),
      readCount: 0,
      commentCount: 0,
      ...hidden(s),
    },
    patch: { title: 'Bando nuevo' },
  })),
  ...STATUSES.map((s) => ({
    kind: 'place' as const,
    label: s,
    path: `municipalities/${M}/places/p1`,
    data: { name: 'Ermita', proposedBy: 'author', commentCount: 0, readCount: 0, burialCount: 0, ...hidden(s) },
    patch: { name: 'Ermita de San Roque' },
  })),
  ...STATUSES.map((s) => ({
    kind: 'barrio' as const,
    label: s,
    path: `municipalities/${M}/barrios/b1`,
    data: { name: 'El Arrabal', proposedBy: 'author', kind: 'barrio', source: 'user', isSeat: false, ...hidden(s) },
    patch: { name: 'Arrabal' },
  })),
  ...STATUSES.map((s) => ({
    kind: 'festivalPoster' as const,
    label: s,
    path: 'festivalPosters/f1',
    data: { municipalityId: M, villageSlug: 'villa', year: 2026, proposedBy: 'author', ...hidden(s) },
    patch: { year: 2025 },
  })),
  ...STATUSES.map((s) => ({
    kind: 'historyEntry' as const,
    label: s,
    path: 'historyEntries/h1',
    data: {
      ...buildHistoryEntryData({
        municipalityId: M,
        villageSlug: 'villa',
        createdBy: 'author',
        title: 'Carta puebla',
        body: { text: 'El rey concede fueros.', mentions: [], links: [], marks: [] },
        start: { year: 1212, month: null, day: null },
        createdAt: new Date(),
      }),
      ...hidden(s),
    },
    patch: { title: 'Carta puebla (corregida)' },
  })),
  {
    kind: 'organization',
    label: 'approved',
    path: `organizations/${ORG}`,
    data: {
      name: 'Peña El Trago',
      description: null,
      type: 'peña',
      status: 'approved',
      municipalityId: M,
      villageSlug: 'villa',
      requestedBy: 'author',
      reviewedBy: 'boss',
      createdAt: new Date(),
      reviewedAt: new Date(),
    },
    patch: { description: 'La peña de siempre' },
  },
  ...(
    [
      ['active', 0],
      ['active', 1],
      ['hidden', 0],
    ] as const
  ).map(([s, definitionCount]) => ({
    kind: 'vocabularyTerm' as const,
    label: `${s}, ${String(definitionCount)} definitions`,
    path: `vocabularyTerms/${M}__esbardo`,
    data: {
      municipalityId: M,
      term: 'Esbardo',
      normalized: 'esbardo',
      kind: 'palabra',
      createdBy: 'author',
      contributorUserIds: ['author'],
      contributorOrgIds: [],
      createdAt: new Date(),
      definitionCount,
      commentCount: 0,
      readCount: 0,
      ...hidden(s),
    },
    patch: { kind: 'expresión' },
  })),
  ...STATUSES.map((s) => ({
    kind: 'vocabularyDefinition' as const,
    label: s,
    path: 'vocabularyDefinitions/d1',
    data: {
      municipalityId: M,
      termId: `${M}__esbardo`,
      definition: 'Cría de oso.',
      example: null,
      castellano: 'osezno',
      createdBy: 'author',
      contributorUserIds: ['author'],
      contributorOrgIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...hidden(s),
    },
    patch: { definition: 'Cría del oso pardo.' },
  })),
];

function client(name: ActorName): Firestore {
  const { uid } = ACTORS[name];
  return uid == null ? asAnon(getEnv()) : asUser(getEnv(), uid);
}

async function seedCase(c: Case) {
  await seedRoles();
  await seed(getEnv(), async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, c.path), c.data);
  });
}

function expectRules(allowed: boolean, op: Promise<unknown>) {
  return allowed ? assertSucceeds(op) : assertFails(op);
}

const ACTOR_NAMES = Object.keys(ACTORS) as ActorName[];

describe('content policy ↔ firestore.rules parity', () => {
  it('every policy kind has at least one case', () => {
    const covered = new Set(CASES.map((c) => c.kind));
    expect([...covered].sort()).toEqual(Object.keys(CONTENT_POLICY).sort());
  });

  for (const c of CASES) {
    describe(`${c.kind} (${c.label})`, () => {
      const surface = CONTENT_POLICY[c.kind].deleteSurface;

      it.each(ACTOR_NAMES)('edit as %s', async (name) => {
        await seedCase(c);
        const allowed = can('edit', c.kind, ACTORS[name], c.data);
        await expectRules(allowed, updateDoc(doc(client(name), c.path), c.patch));
      });

      it.each(ACTOR_NAMES)(`delete (${surface}) as %s`, async (name) => {
        await seedCase(c);
        const allowed = can('delete', c.kind, ACTORS[name], c.data);
        const ref = doc(client(name), c.path);
        switch (surface) {
          case 'rules':
            await expectRules(allowed, deleteDoc(ref));
            break;
          case 'update:cancel':
            // The app cancels; the rule also allows a direct delete to the same
            // identities, which the edit predicate answers.
            await expectRules(allowed, updateDoc(ref, { status: 'cancelled', updatedAt: new Date() }));
            await seedCase(c);
            await expectRules(can('edit', c.kind, ACTORS[name], c.data), deleteDoc(ref));
            break;
          case 'callable:deleteNewsPost':
            // The client never deletes directly; the callable is the only path.
            await assertFails(deleteDoc(ref));
            break;
        }
      });
    });
  }

  it('a kind whose delete is a callable is listed as a known divergence', () => {
    const viaCallable = (Object.keys(CONTENT_POLICY) as PolicyKind[]).filter((k) =>
      CONTENT_POLICY[k].deleteSurface.startsWith('callable:'),
    );
    for (const kind of viaCallable) {
      expect(KNOWN_DIVERGENCES.some((d) => d.kind === kind && d.action === 'delete')).toBe(true);
    }
  });
});
