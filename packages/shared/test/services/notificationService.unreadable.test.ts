/* eslint-disable @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/require-await */
// vi.mock factories legitimately fake the firebase/firestore SDK shape —
// matching notificationService.push.test.ts, the sibling suite.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureError = vi.fn();

vi.mock('../../src/firebase', () => ({ getDb: vi.fn() }));
vi.mock('../../src/services/observability/observabilityService', () => ({
  observability: { captureError: (...a: unknown[]) => captureError(...a) },
}));
vi.mock('firebase/firestore', async () => {
  const makeRef = () => {
    const ref: { withConverter: ReturnType<typeof vi.fn> } = { withConverter: vi.fn() };
    ref.withConverter.mockReturnValue(ref);
    return ref;
  };
  return {
    collection: vi.fn(() => makeRef()),
    doc: vi.fn(() => makeRef()),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    deleteDoc: vi.fn(),
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    writeBatch: vi.fn(),
    getCountFromServer: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
});

import { getDocs } from 'firebase/firestore';
import { getNotifications } from '../../src/services/notificationService';
import { buildNotificationData } from '../../src/models/notification';
import { fakeQuerySnapshot } from '../helpers/sdkFakes';

/**
 * A doc whose `data()` throws is exactly what an older store binary sees: the
 * strict Zod converter rejects a `type` its enum predates, and `.data()` throws
 * a ZodError rather than returning a row.
 */
const unreadableDoc = (id: string) => ({
  id,
  data: () => {
    throw new Error('[\n  {\n    "code": "invalid_enum_value",\n    "path": ["type"]\n  }\n]');
  },
});

const readableDoc = (id: string) => ({
  id,
  data: () => buildNotificationData({ type: 'event_updated', title: 't', body: 'b' }),
});

describe('getNotifications survives a doc the converter cannot read (Buzón trap)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureError.mockClear();
  });

  it('drops the unreadable row instead of throwing the whole feed away', async () => {
    vi.mocked(getDocs).mockResolvedValue(fakeQuerySnapshot([readableDoc('ok-1'), unreadableDoc('bad'), readableDoc('ok-2')]));

    const rows = await getNotifications('u1');

    expect(rows.map((r) => r.id)).toEqual(['ok-1', 'ok-2']);
  });

  it('reports the dropped row so a schema drift is loud to us, not silent', async () => {
    vi.mocked(getDocs).mockResolvedValue(fakeQuerySnapshot([unreadableDoc('bad')]));

    await getNotifications('u1');

    expect(captureError).toHaveBeenCalledTimes(1);
    const [, context] = captureError.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(context).toMatchObject({ operation: 'notifications:getNotifications', notificationId: 'bad' });
  });

  it('still returns every row when nothing is unreadable', async () => {
    vi.mocked(getDocs).mockResolvedValue(fakeQuerySnapshot([readableDoc('a'), readableDoc('b')]));

    expect(await getNotifications('u1')).toHaveLength(2);
    expect(captureError).not.toHaveBeenCalled();
  });
});
