import { describe, it, expect } from 'vitest';

import { buildActivityFeed } from '../../src/services/inboxService';
import type { NotificationData } from '../../src/models/notification/NotificationDataModel';

function makeNotification(
  id: string,
  createdAt: Date,
  overrides: Partial<NotificationData> = {},
): NotificationData & { id: string } {
  return {
    id,
    type: 'organizer_request_created',
    title: `title-${id}`,
    body: `body-${id}`,
    eventId: null,
    municipalityId: null,
    requesterUid: null,
    entityKind: null,
    entityId: null,
    chatThreadId: null,
    cosaRequestId: null,
    topic: null,
    read: false,
    createdAt,
    ...overrides,
  };
}

describe('buildActivityFeed', () => {
  it('merges notifications and pending-sent items, sorted by createdAt desc', () => {
    const oldest = makeNotification('n1', new Date('2026-01-01T00:00:00Z'));
    const newest = makeNotification('n2', new Date('2026-01-03T00:00:00Z'));
    const pendingSent = {
      requestType: 'org' as const,
      id: 'p1',
      label: 'Some Org',
      createdAt: new Date('2026-01-02T00:00:00Z'),
    };

    const result = buildActivityFeed([oldest, newest], [pendingSent]);

    expect(result).toHaveLength(3);
    expect(result.map((item) => item.id)).toEqual(['n2', 'p1', 'n1']);
    expect(result[0]).toMatchObject({ kind: 'notification', id: 'n2' });
    expect(result[1]).toMatchObject({ kind: 'pending-sent', id: 'p1', requestType: 'org', label: 'Some Org' });
    expect(result[2]).toMatchObject({ kind: 'notification', id: 'n1' });
  });

  it('returns [] for empty inputs', () => {
    expect(buildActivityFeed([], [])).toEqual([]);
  });
});
