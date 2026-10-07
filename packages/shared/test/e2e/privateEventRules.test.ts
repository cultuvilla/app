// firestore.rules — events restricted to a single organization.
//
// The load-bearing claim is that a private event is invisible to everyone
// outside its org, INCLUDING the village's own admins: the pueblo's leadership
// moderates the public square, and a peña's internal cena is not it.
import { describe, it, expect, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAdmin, asAnon, asUser, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const M = 'm1';
const ORG = 'org1';
const OTHER_ORG = 'org2';

function eventPayload(createdBy: string, over: Record<string, unknown> = {}) {
  return {
    title: 'Cena de socios',
    description: 'Solo para la peña',
    startDate: new Date('2026-07-01'),
    endDate: null,
    endBoundary: new Date('2026-07-01'),
    location: { coordinates: { lat: 40.0, lng: -3.0 }, displayName: 'Local' },
    imageURL: null,
    maxAttendees: null,
    telephoneRequired: false,
    requiresPayment: false,
    signupFields: [],
    signupEnabled: true,
    signupInfo: null,
    attendeesVisibility: 'members',
    signupGroupSize: 1,
    minBirthYear: null,
    maxBirthYear: null,
    visibility: 'public',
    visibilityOrgId: null,
    status: 'published',
    organizerUserIds: [createdBy],
    organizerOrgIds: [ORG],
    createdBy,
    createdAt: new Date(),
    updatedAt: new Date(),
    municipalityId: M,
    villageName: 'Villa',
    villageSlug: 'villa',
    villageCoverImage: null,
    villageCoordinates: null,
    commentCount: 0,
    readCount: 0,
    ...over,
  };
}

const PRIVATE = { visibility: 'organization', visibilityOrgId: ORG };

beforeEach(async () => {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    for (const uid of ['socio', 'outsider', 'organizer', 'villageboss']) {
      await setDoc(doc(db, `municipalities/${M}/members/${uid}`), {
        role: uid === 'villageboss' ? 'admin' : 'member',
        joinedAt: new Date(),
      });
    }
    // Private events belong to orgs whose members are admitted by approval.
    await setDoc(doc(db, `organizations/${ORG}`), {
      name: 'La Peña',
      municipalityId: M,
      joinPolicy: 'approval',
    });
    await setDoc(doc(db, `organizations/${OTHER_ORG}`), {
      name: 'Otra',
      municipalityId: M,
      joinPolicy: 'open',
    });
    await setDoc(doc(db, `organizations/${ORG}/members/socio`), {
      userId: 'socio',
      role: 'member',
      joinedAt: new Date(),
    });
    await setDoc(doc(db, `organizations/${OTHER_ORG}/members/outsider`), {
      userId: 'outsider',
      role: 'member',
      joinedAt: new Date(),
    });
    // `organizer` runs the event without belonging to the org.
    await setDoc(doc(db, 'events/priv'), eventPayload('organizer', PRIVATE));
    await setDoc(doc(db, 'events/pub'), eventPayload('organizer'));
    // An event written before the fields existed: it must read as public.
    const legacy = eventPayload('organizer') as Record<string, unknown>;
    delete legacy['visibility'];
    delete legacy['visibilityOrgId'];
    await setDoc(doc(db, 'events/legacy'), legacy);
  });
});

describe('firestore.rules — private event reads', () => {
  it('a member of the org can read it', async () => {
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'socio'), 'events/priv')));
  });

  it('an organizer outside the org can read it', async () => {
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'organizer'), 'events/priv')));
  });

  it('an app admin can read it', async () => {
    const root = await asAdmin(getEnv(), 'root');
    await assertSucceeds(getDoc(doc(root, 'events/priv')));
  });

  it('a member of a different org cannot read it', async () => {
    await assertFails(getDoc(doc(asUser(getEnv(), 'outsider'), 'events/priv')));
  });

  it('a signed-out visitor cannot read it', async () => {
    await assertFails(getDoc(doc(asAnon(getEnv()), 'events/priv')));
  });

  it('the pueblo’s own admin cannot read it', async () => {
    await assertFails(getDoc(doc(asUser(getEnv(), 'villageboss'), 'events/priv')));
  });

  it('public and legacy events stay readable by anyone', async () => {
    const anon = asAnon(getEnv());
    await assertSucceeds(getDoc(doc(anon, 'events/pub')));
    await assertSucceeds(getDoc(doc(anon, 'events/legacy')));
  });

  it('a missing event reads as absent rather than denied', async () => {
    await assertSucceeds(getDoc(doc(asAnon(getEnv()), 'events/nope')));
  });
});

describe('firestore.rules — private events in list queries', () => {
  it('a visibility-filtered list stays readable by a stranger', async () => {
    const q = query(
      collection(asAnon(getEnv()), 'events'),
      where('municipalityId', '==', M),
      where('visibility', '==', 'public'),
    );
    await assertSucceeds(getDocs(q));
  });

  // Rules are not a filter, and a list rule that depends on a field the query
  // does not constrain is evaluated against what the query *could* return
  // rather than against each row — so an unconstrained list is not reliably
  // denied. That is exactly why every client query over `events` pins
  // `visibility` or `visibilityOrgId` itself; this asserts the filter does the
  // hiding, rather than trusting the rule to.
  it('the public filter is what actually excludes the private row', async () => {
    const snap = await getDocs(
      query(
        collection(asAnon(getEnv()), 'events'),
        where('municipalityId', '==', M),
        where('visibility', '==', 'public'),
      ),
    );
    expect(snap.docs.map((d) => d.id).sort()).toEqual(['pub']);
  });

  it('a member may list their own org’s private events', async () => {
    const q = query(
      collection(asUser(getEnv(), 'socio'), 'events'),
      where('visibilityOrgId', '==', ORG),
    );
    await assertSucceeds(getDocs(q));
  });

  it('a non-member may not list that org’s private events', async () => {
    const q = query(
      collection(asUser(getEnv(), 'outsider'), 'events'),
      where('visibilityOrgId', '==', ORG),
    );
    await assertFails(getDocs(q));
  });
});

// Anyone can self-join an open org, so membership there proves nothing.
describe('firestore.rules — private events need an approval org', () => {
  it('a member of an open org may not create a private event in it', async () => {
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), 'outsider'), 'events/n-open'),
        eventPayload('outsider', { visibility: 'organization', visibilityOrgId: OTHER_ORG }),
      ),
    );
  });

  it('an organizer cannot move an event into an open org', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), `organizations/${OTHER_ORG}/members/organizer`), {
        userId: 'organizer',
        role: 'member',
        joinedAt: new Date(),
      });
    });
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'organizer'), 'events/pub'), {
        visibility: 'organization',
        visibilityOrgId: OTHER_ORG,
      }),
    );
  });

  it('fails closed for members if the org is switched back to open', async () => {
    await seed(getEnv(), async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `organizations/${ORG}`), { joinPolicy: 'open' });
    });
    await assertFails(getDoc(doc(asUser(getEnv(), 'socio'), 'events/priv')));
    // The event's own organizers and app admins keep access.
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'organizer'), 'events/priv')));
  });
});

describe('firestore.rules — creating a private event', () => {
  it('a member of the org may create one', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(getEnv(), 'socio'), 'events/n1'), eventPayload('socio', PRIVATE)),
    );
  });

  it('a non-member may not park an event inside that org', async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), 'outsider'), 'events/n2'), eventPayload('outsider', PRIVATE)),
    );
  });

  it('rejects an event marked private with no org named', async () => {
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), 'socio'), 'events/n3'),
        eventPayload('socio', { visibility: 'organization', visibilityOrgId: null }),
      ),
    );
  });

  it('rejects a public event carrying an orphan org pointer', async () => {
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), 'socio'), 'events/n4'),
        eventPayload('socio', { visibility: 'public', visibilityOrgId: ORG }),
      ),
    );
  });
});

describe('firestore.rules — changing an event’s visibility', () => {
  it('an organizer can open their private event up', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(getEnv(), 'organizer'), 'events/priv'), {
        visibility: 'public',
        visibilityOrgId: null,
      }),
    );
  });

  it('an organizer who belongs to the org can close a public event', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'events/mine'), eventPayload('socio'));
    });
    await assertSucceeds(
      updateDoc(doc(asUser(getEnv(), 'socio'), 'events/mine'), PRIVATE),
    );
  });

  it('an organizer cannot hide an event inside an org they do not belong to', async () => {
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'organizer'), 'events/pub'), {
        visibility: 'organization',
        visibilityOrgId: OTHER_ORG,
      }),
    );
  });

  it('a village admin cannot unhide a private event', async () => {
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'villageboss'), 'events/priv'), {
        visibility: 'public',
        visibilityOrgId: null,
      }),
    );
  });

  it('a village admin keeps ordinary edit authority over a private event', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(getEnv(), 'villageboss'), 'events/priv'), { status: 'cancelled' }),
    );
  });

  it('rejects an update that leaves the enum and the org pointer disagreeing', async () => {
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'organizer'), 'events/priv'), { visibility: 'public' }),
    );
  });
});

describe('firestore.rules — the roster of a private event', () => {
  beforeEach(async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'events/priv/registrations/r1'), {
        userId: 'socio',
        personId: 'p1',
        name: 'Socio',
        status: 'confirmed',
        position: 1,
        isMember: true,
        registeredAt: new Date(),
      });
    });
  });

  it('is readable by the org', async () => {
    await assertSucceeds(
      getDocs(collection(asUser(getEnv(), 'socio'), 'events/priv/registrations')),
    );
  });

  it('is not readable by the rest of the pueblo', async () => {
    await assertFails(
      getDocs(collection(asUser(getEnv(), 'outsider'), 'events/priv/registrations')),
    );
  });
});
