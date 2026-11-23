import { describe, expect, it } from 'vitest';
import { can, CONTENT_POLICY, type Actor, type PolicyKind } from '../../src/policy';

const anon: Actor = { uid: null, isAppAdmin: false, isVillageAdmin: false };
const stranger: Actor = { uid: 'stranger', isAppAdmin: false, isVillageAdmin: false };
const author: Actor = { uid: 'author', isAppAdmin: false, isVillageAdmin: false };
const organizer: Actor = { uid: 'organizer', isAppAdmin: false, isVillageAdmin: false };
const villageAdmin: Actor = { uid: 'boss', isAppAdmin: false, isVillageAdmin: true };
const appAdmin: Actor = { uid: 'root', isAppAdmin: true, isVillageAdmin: false };
const orgAdmin: Actor = { uid: 'orgboss', isAppAdmin: false, isVillageAdmin: false, isOrgAdmin: true };

const byCreator = (status: 'active' | 'hidden' = 'active') => ({
  createdBy: 'author',
  organizerUserIds: ['author', 'organizer'],
  status,
});
const byProposer = (status: 'active' | 'hidden' = 'active') => ({ proposedBy: 'author', status });

describe('content policy', () => {
  it.each(['event', 'news'] as const)('%s: author, named organizer or admin edits', (kind) => {
    for (const status of ['active', 'hidden'] as const) {
      const d = byCreator(status);
      expect(can('edit', kind, author, d)).toBe(true);
      expect(can('edit', kind, organizer, d)).toBe(true);
      expect(can('edit', kind, villageAdmin, d)).toBe(true);
      expect(can('edit', kind, appAdmin, d)).toBe(true);
      expect(can('edit', kind, stranger, d)).toBe(false);
      expect(can('edit', kind, anon, d)).toBe(false);
    }
  });

  it('event: cancelling is an edit, so the edit predicate answers it', () => {
    expect(CONTENT_POLICY.event.deleteSurface).toBe('update:cancel');
    expect(can('delete', 'event', organizer, byCreator('hidden'))).toBe(true);
    expect(can('delete', 'event', stranger, byCreator())).toBe(false);
  });

  it('news: the author deletes only while active; a named organizer never; admins always', () => {
    expect(can('delete', 'news', author, byCreator('active'))).toBe(true);
    expect(can('delete', 'news', author, byCreator('hidden'))).toBe(false);
    expect(can('delete', 'news', organizer, byCreator('active'))).toBe(false);
    expect(can('delete', 'news', villageAdmin, byCreator('hidden'))).toBe(true);
    expect(can('delete', 'news', appAdmin, byCreator('hidden'))).toBe(true);
  });

  it.each(['place', 'barrio', 'festivalPoster'] as const)(
    '%s: identified by proposedBy; the author edits at any status, withdraws only while active',
    (kind) => {
      expect(can('edit', kind, author, byProposer('hidden'))).toBe(true);
      expect(can('delete', kind, author, byProposer('active'))).toBe(true);
      expect(can('delete', kind, author, byProposer('hidden'))).toBe(false);
      expect(can('edit', kind, stranger, byProposer())).toBe(false);
      expect(can('delete', kind, villageAdmin, byProposer('hidden'))).toBe(true);
      // createdBy is not the author field for these kinds.
      expect(can('edit', kind, author, { createdBy: 'author', status: 'active' })).toBe(false);
    },
  );

  it('historyEntry: identified by createdBy, no organizer set', () => {
    expect(can('edit', 'historyEntry', author, byCreator('hidden'))).toBe(true);
    expect(can('edit', 'historyEntry', organizer, byCreator())).toBe(false);
    expect(can('delete', 'historyEntry', author, byCreator('hidden'))).toBe(false);
    expect(can('delete', 'historyEntry', appAdmin, byCreator('hidden'))).toBe(true);
  });

  it('organization: an org admin edits but only village/app admins delete', () => {
    expect(can('edit', 'organization', orgAdmin, {})).toBe(true);
    expect(can('delete', 'organization', orgAdmin, {})).toBe(false);
    expect(can('delete', 'organization', villageAdmin, {})).toBe(true);
    expect(can('delete', 'organization', appAdmin, {})).toBe(true);
    expect(can('edit', 'organization', stranger, {})).toBe(false);
  });

  it('vocabularyTerm: nobody edits; the author withdraws only an active, empty term', () => {
    const term = (status: 'active' | 'hidden', definitionCount: number) => ({
      createdBy: 'author',
      status,
      definitionCount,
    });
    expect(can('edit', 'vocabularyTerm', appAdmin, term('active', 0))).toBe(false);
    expect(can('delete', 'vocabularyTerm', author, term('active', 0))).toBe(true);
    expect(can('delete', 'vocabularyTerm', author, term('active', 1))).toBe(false);
    expect(can('delete', 'vocabularyTerm', author, term('hidden', 0))).toBe(false);
    expect(can('delete', 'vocabularyTerm', villageAdmin, term('hidden', 3))).toBe(true);
  });

  it('vocabularyDefinition: only the author edits; author or admin deletes at any status', () => {
    const def = { createdBy: 'author', status: 'hidden' };
    expect(can('edit', 'vocabularyDefinition', author, def)).toBe(true);
    expect(can('edit', 'vocabularyDefinition', villageAdmin, def)).toBe(false);
    expect(can('delete', 'vocabularyDefinition', author, def)).toBe(true);
    expect(can('delete', 'vocabularyDefinition', villageAdmin, def)).toBe(true);
    expect(can('delete', 'vocabularyDefinition', stranger, def)).toBe(false);
  });

  it('a signed-out viewer never matches a doc with no author', () => {
    const kinds = Object.keys(CONTENT_POLICY) as PolicyKind[];
    for (const kind of kinds) {
      expect(can('edit', kind, anon, { createdBy: null, proposedBy: null, status: 'active' })).toBe(false);
      expect(can('delete', kind, anon, { createdBy: null, proposedBy: null, status: 'active' })).toBe(false);
    }
  });
});
