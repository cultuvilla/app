import { describe, expect, it } from 'vitest';
import { loadQueries, parentCollectionOf, placeDocument } from '../../../src/validation';

describe('placeDocument', () => {
  it('tells apart collections that share an id by their full path', () => {
    const keys = ['municipalityMembers', 'organizationMembers'] as const;
    expect(placeDocument('municipalities/m1/members/u1', keys)).toEqual({ key: 'municipalityMembers', parents: ['m1'], id: 'u1' });
    expect(placeDocument('organizations/o1/members/u1', keys)).toEqual({ key: 'organizationMembers', parents: ['o1'], id: 'u1' });
  });

  it('drops a path no requested template fits', () => {
    expect(placeDocument('cosas/c1/members/u1', ['municipalityMembers'])).toBeNull();
    expect(placeDocument('municipalities/m1', ['municipalityMembers'])).toBeNull();
  });
});

describe('loadQueries', () => {
  it('reads each collection id once, as a group when any of its templates is nested', () => {
    const queries = loadQueries(['events', 'municipalityMembers', 'organizationMembers', 'comments']);
    expect(queries).toEqual(
      expect.arrayContaining([
        { collectionId: 'events', group: false, keys: ['events'] },
        { collectionId: 'members', group: true, keys: ['municipalityMembers', 'organizationMembers'] },
        { collectionId: 'comments', group: false, keys: ['comments'] },
      ]),
    );
    expect(queries).toHaveLength(3);
  });
});

describe('parentCollectionOf', () => {
  it('resolves a subcollection to the collection above it', () => {
    expect(parentCollectionOf('eventRegistrations')).toBe('events');
    expect(parentCollectionOf('organizationMessageReads')).toBe('organizationMessages');
  });

  it('refuses a top-level collection', () => {
    expect(() => parentCollectionOf('events')).toThrow();
  });
});
