// Firestore Rules e2e test for /contentReports/{reportId} and
// /users/{uid}/blockedUsers/{blockedUid} — the UGC-safety pair.
//
// The two collections have deliberately opposite postures: anyone signed in may
// FILE a report (a report that can fail is worse than no report) but only
// moderators may READ them, while a block list is owner-only in both
// directions, because a readable one would disclose who blocked whom.
import { describe, it } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, asAnon, asAdmin, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const MUNI = 'muni-1';
const OTHER_MUNI = 'muni-2';
const VILLAGE_ADMIN = 'vadmin';
const REPORTER = 'reporter';
const AUTHOR = 'author';
const OUTSIDER = 'bob';
const APP_ADMIN = 'sadmin';

const REPORT = 'rep-1';

function report(overrides: Record<string, unknown> = {}) {
  return {
    municipalityId: MUNI,
    targetKind: 'comment',
    targetId: 'c1',
    targetAuthorUserId: AUTHOR,
    reporterUserId: REPORTER,
    reason: 'harassment',
    note: null,
    status: 'open',
    createdAt: new Date(),
    ...overrides,
  };
}

async function seedFixtures() {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, `municipalities/${MUNI}/members/${VILLAGE_ADMIN}`), { role: 'admin' });
    await setDoc(doc(db, `municipalities/${MUNI}/members/${REPORTER}`), { role: 'user' });
    await setDoc(doc(db, `contentReports/${REPORT}`), report());
  });
}

describe('firestore.rules — /contentReports/{reportId}', () => {
  describe('create', () => {
    it('any signed-in person can file a report about their own uid as reporter', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), REPORTER);
      await assertSucceeds(setDoc(doc(db, 'contentReports/new-1'), report()));
    });

    it('a non-member of the village can still file — abuse is reportable by anyone', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), OUTSIDER);
      await assertSucceeds(
        setDoc(doc(db, 'contentReports/new-2'), report({ reporterUserId: OUTSIDER })),
      );
    });

    it('an anonymous visitor cannot file — a report needs an accountable reporter', async () => {
      await seedFixtures();
      const db = asAnon(getEnv());
      await assertFails(setDoc(doc(db, 'contentReports/new-3'), report()));
    });

    it('cannot file a report attributed to somebody else', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), OUTSIDER);
      await assertFails(
        setDoc(doc(db, 'contentReports/new-4'), report({ reporterUserId: REPORTER })),
      );
    });

    it('cannot file a report that is already resolved', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), REPORTER);
      await assertFails(
        setDoc(doc(db, 'contentReports/new-5'), report({ status: 'dismissed' })),
      );
    });

    it('rejects an unknown reason', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), REPORTER);
      await assertFails(setDoc(doc(db, 'contentReports/new-6'), report({ reason: 'porque-si' })));
    });

    it('rejects an unknown target kind', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), REPORTER);
      await assertFails(setDoc(doc(db, 'contentReports/new-7'), report({ targetKind: 'invoice' })));
    });

    it('rejects an unknown extra field', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), REPORTER);
      await assertFails(
        setDoc(doc(db, 'contentReports/new-8'), report({ escalate: true })),
      );
    });

    it('rejects a missing required field', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), REPORTER);
      const { reason: _dropped, ...withoutReason } = report();
      await assertFails(setDoc(doc(db, 'contentReports/new-9'), withoutReason));
    });
  });

  describe('read', () => {
    it("the village's admin can read reports in their municipality", async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertSucceeds(getDoc(doc(db, `contentReports/${REPORT}`)));
    });

    it("the village's admin can list their municipality's open reports, as the inbox does", async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertSucceeds(
        getDocs(
          query(
            collection(db, 'contentReports'),
            where('municipalityId', '==', MUNI),
            where('status', '==', 'open'),
            orderBy('createdAt', 'desc'),
          ),
        ),
      );
    });

    it("an admin of another village cannot list this municipality's reports", async () => {
      await seed(getEnv(), async (ctx) => {
        const db = ctx.firestore() as unknown as Firestore;
        await setDoc(doc(db, `municipalities/${OTHER_MUNI}/members/${OUTSIDER}`), { role: 'admin' });
      });
      await seedFixtures();
      const db = asUser(getEnv(), OUTSIDER);
      await assertFails(
        getDocs(query(collection(db, 'contentReports'), where('municipalityId', '==', MUNI))),
      );
    });

    it('an app admin can read any report', async () => {
      await seedFixtures();
      const db = await asAdmin(getEnv(), APP_ADMIN);
      await assertSucceeds(getDoc(doc(db, `contentReports/${REPORT}`)));
    });

    it('the reporter cannot read back their own report', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), REPORTER);
      await assertFails(getDoc(doc(db, `contentReports/${REPORT}`)));
    });

    it('the reported author cannot read the report about them', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), AUTHOR);
      await assertFails(getDoc(doc(db, `contentReports/${REPORT}`)));
    });
  });

  describe('update / delete', () => {
    it('a village admin can resolve a report', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertSucceeds(updateDoc(doc(db, `contentReports/${REPORT}`), { status: 'reviewed' }));
    });

    it('a village admin cannot rewrite what was reported', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertFails(updateDoc(doc(db, `contentReports/${REPORT}`), { reason: 'spam' }));
    });

    it('an admin of another village cannot resolve it', async () => {
      await seed(getEnv(), async (ctx) => {
        const db = ctx.firestore() as unknown as Firestore;
        await setDoc(doc(db, `municipalities/${OTHER_MUNI}/members/${OUTSIDER}`), { role: 'admin' });
      });
      await seedFixtures();
      const db = asUser(getEnv(), OUTSIDER);
      await assertFails(updateDoc(doc(db, `contentReports/${REPORT}`), { status: 'dismissed' }));
    });

    it('nobody deletes a report — the queue is the audit trail', async () => {
      await seedFixtures();
      const db = await asAdmin(getEnv(), APP_ADMIN);
      await assertFails(deleteDoc(doc(db, `contentReports/${REPORT}`)));
    });
  });
});

describe('firestore.rules — /users/{uid}/blockedUsers/{blockedUid}', () => {
  it('you can block somebody', async () => {
    const db = asUser(getEnv(), REPORTER);
    await assertSucceeds(
      setDoc(doc(db, `users/${REPORTER}/blockedUsers/${AUTHOR}`), {
        blockedUserId: AUTHOR,
        createdAt: new Date(),
      }),
    );
  });

  it('the doc id must match the stored uid, so the list cannot be poisoned', async () => {
    const db = asUser(getEnv(), REPORTER);
    await assertFails(
      setDoc(doc(db, `users/${REPORTER}/blockedUsers/${AUTHOR}`), {
        blockedUserId: OUTSIDER,
        createdAt: new Date(),
      }),
    );
  });

  it('you cannot block yourself', async () => {
    const db = asUser(getEnv(), REPORTER);
    await assertFails(
      setDoc(doc(db, `users/${REPORTER}/blockedUsers/${REPORTER}`), {
        blockedUserId: REPORTER,
        createdAt: new Date(),
      }),
    );
  });

  it('you cannot write into somebody else’s block list', async () => {
    const db = asUser(getEnv(), OUTSIDER);
    await assertFails(
      setDoc(doc(db, `users/${REPORTER}/blockedUsers/${AUTHOR}`), {
        blockedUserId: AUTHOR,
        createdAt: new Date(),
      }),
    );
  });

  it('nobody else can read your block list — not even an app admin', async () => {
    await seed(getEnv(), async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(db, `users/${REPORTER}/blockedUsers/${AUTHOR}`), {
        blockedUserId: AUTHOR,
        createdAt: new Date(),
      });
    });
    await assertFails(getDocs(collection(asUser(getEnv(), AUTHOR), `users/${REPORTER}/blockedUsers`)));
    await assertFails(
      getDocs(collection(await asAdmin(getEnv(), APP_ADMIN), `users/${REPORTER}/blockedUsers`)),
    );
  });

  it('you can read and unblock from your own list', async () => {
    await seed(getEnv(), async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(db, `users/${REPORTER}/blockedUsers/${AUTHOR}`), {
        blockedUserId: AUTHOR,
        createdAt: new Date(),
      });
    });
    const db = asUser(getEnv(), REPORTER);
    await assertSucceeds(getDocs(collection(db, `users/${REPORTER}/blockedUsers`)));
    await assertSucceeds(deleteDoc(doc(db, `users/${REPORTER}/blockedUsers/${AUTHOR}`)));
  });
});
