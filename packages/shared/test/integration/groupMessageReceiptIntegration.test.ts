// A group notice's read receipt against the real rules and SDK: write-once,
// and a second mark neither fails nor makes the listener lose the receipt.
// Found in ios-e2e (2026-11-20): the aviso screen re-sent a refused receipt
// 10+ times a second. The JS SDK keeps the receipt through a refused rewrite
// (this test), so the listener half of that loop is iOS-side; the service
// guard stops the rewrites whatever the listener shows.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, seed } from '../helpers/roles';
import { markGroupMessageRead, watchMyGroupMessageReads } from '../../src/services/groupMessageService';
import * as firebaseModule from '../../src/firebase';

const getEnv = useRulesTestEnv();

afterEach(() => {
  vi.restoreAllMocks();
});

async function seedNotice(orgId: string): Promise<void> {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, `organizations/${orgId}`), { name: 'Peña', type: 'asociación', status: 'approved', municipalityId: 'mun1' });
    await setDoc(doc(db, `organizations/${orgId}/members/u1`), { userId: 'u1', joinedAt: new Date(), role: 'member' });
    await setDoc(doc(db, `organizations/${orgId}/messages/m1`), { recipientUids: ['u1'], sentBy: 'admin1', sentAt: new Date() });
  });
}

describe('markGroupMessageRead', () => {
  it('writes the receipt once; a later mark resolves and the listener keeps it', async () => {
    const orgId = `org-${String(Date.now())}`;
    await seedNotice(orgId);
    vi.spyOn(firebaseModule, 'getDb').mockReturnValue(asUser(getEnv(), 'u1'));

    const emissions: string[][] = [];
    const unwatch = watchMyGroupMessageReads(
      orgId,
      'u1',
      ['m1'],
      (rows) => emissions.push(rows.map((r) => r.id)),
      (error) => {
        throw error;
      },
    );
    try {
      await vi.waitFor(() => {
        if (emissions.length === 0) throw new Error('waiting for the first answer');
      });
      expect(emissions[0]).toEqual([]);
      await markGroupMessageRead(orgId, 'm1', 'u1');
      await expect(markGroupMessageRead(orgId, 'm1', 'u1')).resolves.toBeUndefined();
      await vi.waitFor(() => {
        expect(emissions.at(-1)).toEqual(['m1']);
      });
      const afterCreate = emissions.findIndex((ids) => ids.includes('m1'));
      expect(emissions.slice(afterCreate).every((ids) => ids.includes('m1'))).toBe(true);
    } finally {
      unwatch();
    }
  });

  it('a receipt that already exists is refused by the rules, and the mark still resolves', async () => {
    const orgId = `org-old-${String(Date.now())}`;
    await seedNotice(orgId);
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, `organizations/${orgId}/messages/m1/reads/u1`), { readAt: new Date() });
    });
    vi.spyOn(firebaseModule, 'getDb').mockReturnValue(asUser(getEnv(), 'u1'));
    await expect(markGroupMessageRead(orgId, 'm1', 'u1')).resolves.toBeUndefined();
  });
});
