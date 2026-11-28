import { describe, expect, it } from 'vitest';
import {
  isOrgPrivateEvent,
  isPublicDoc,
  isPubliclyListed,
  PUBLIC_STATUS,
  type PublicKind,
} from '../../src/policy';
import { isPrivateEvent } from '../../src/models/event/EventDataModel';
import { eventLinkTarget } from '../../src/utils/urls';
import { EVENT_VISIBILITY_SHAPES } from '../helpers/eventVisibilityShapes';

describe('isOrgPrivateEvent — the pointer is the gate, as in canReadEvent', () => {
  for (const shape of EVENT_VISIBILITY_SHAPES) {
    it(`${shape.name} → ${shape.private ? 'private' : 'public'}`, () => {
      expect(isOrgPrivateEvent(shape.raw)).toBe(shape.private);
    });
  }

  it('the typed isPrivateEvent gives the same answer, enum ignored', () => {
    expect(isPrivateEvent({ visibilityOrgId: 'org1' })).toBe(true);
    expect(isPrivateEvent({ visibilityOrgId: null })).toBe(false);
  });

  it('a private event link never carries its title, whatever the enum says', () => {
    const target = eventLinkTarget({ id: 'e1', title: 'Cena secreta', villageSlug: 'villa', visibilityOrgId: '' });
    expect(target.title).not.toContain('Cena');
  });
});

const NON_EVENT_KINDS = Object.keys(PUBLIC_STATUS) as (keyof typeof PUBLIC_STATUS)[];
const STATUSES = ['active', 'approved', 'published', 'hidden', 'pending', 'rejected', 'draft', undefined];

describe('isPublicDoc / isPubliclyListed — content kinds', () => {
  for (const kind of NON_EVENT_KINDS) {
    for (const status of STATUSES) {
      const expected = status === PUBLIC_STATUS[kind];
      it(`${kind} with status ${String(status)} → ${expected ? 'public' : 'hidden'}`, () => {
        expect(isPublicDoc(kind, { status })).toBe(expected);
        expect(isPubliclyListed(kind, { status })).toBe(expected);
      });
    }
  }
});

describe('isPublicDoc / isPubliclyListed — events', () => {
  const kind: PublicKind = 'event';
  const cases: { status: unknown; page: boolean; listed: boolean }[] = [
    { status: 'published', page: true, listed: true },
    { status: 'completed', page: true, listed: true },
    { status: 'cancelled', page: true, listed: false },
    { status: 'draft', page: false, listed: false },
    { status: undefined, page: false, listed: false },
  ];
  for (const c of cases) {
    it(`a public event with status ${String(c.status)}: page ${String(c.page)}, listed ${String(c.listed)}`, () => {
      const raw = { status: c.status, visibility: 'public', visibilityOrgId: null };
      expect(isPublicDoc(kind, raw)).toBe(c.page);
      expect(isPubliclyListed(kind, raw)).toBe(c.listed);
    });
  }

  for (const shape of EVENT_VISIBILITY_SHAPES.filter((s) => s.private)) {
    it(`a published event that is ${shape.name} is never listed`, () => {
      expect(isPubliclyListed(kind, { ...shape.raw, status: 'published' })).toBe(false);
    });
  }
});
