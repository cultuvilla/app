// Firestore Rules e2e test for /vocabularyTerms and /vocabularyDefinitions.
//
// The pueblo's shared glossary: village members write, everyone reads. Two
// things here are load-bearing beyond the usual member/owner/admin axes and are
// what most of these cases pin down:
//
//   1. A term's doc id is DERIVED (`{municipalityId}__{slug}`), so the create
//      rule must tie the claimed municipalityId to the path — otherwise a
//      member of one pueblo could seed another pueblo's headword.
//   2. `definitionCount` is trigger-owned and gates the author's delete, so a
//      client must never be able to write it.
import { describe, it, expect } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  query,
  where,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, asAnon, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const M = 'm1';
const TERM_ID = `${M}__esbardo`;

function termDoc(createdBy: string, extra: Record<string, unknown> = {}) {
  return {
    municipalityId: M,
    term: 'Esbardo',
    normalized: 'esbardo',
    kind: 'palabra',
    createdBy,
    contributorUserIds: [createdBy],
    contributorOrgIds: [],
    createdAt: new Date(),
    definitionCount: 0,
    commentCount: 0,
    readCount: 0,
    status: 'active',
    hiddenBy: null,
    hiddenAt: null,
    hiddenReason: null,
    ...extra,
  };
}

function definitionDoc(createdBy: string, extra: Record<string, unknown> = {}) {
  return {
    municipalityId: M,
    termId: TERM_ID,
    definition: 'Cría de oso.',
    example: null,
    castellano: 'osezno',
    createdBy,
    contributorUserIds: [createdBy],
    contributorOrgIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'active',
    hiddenBy: null,
    hiddenAt: null,
    hiddenReason: null,
    ...extra,
  };
}

async function seedMember(uid: string, role: 'user' | 'admin' = 'user') {
  await seed(getEnv(), async (ctx) => {
    await setDoc(doc(ctx.firestore(), `municipalities/${M}/members/${uid}`), {
      role,
      joinedAt: new Date(),
      profileAnswers: {},
      profileCompletedAt: null,
    });
  });
}

async function seedTerm(createdBy: string, extra: Record<string, unknown> = {}) {
  await seed(getEnv(), async (ctx) => {
    await setDoc(doc(ctx.firestore(), `vocabularyTerms/${TERM_ID}`), termDoc(createdBy, extra));
  });
}

async function seedDefinition(id: string, createdBy: string, extra: Record<string, unknown> = {}) {
  await seed(getEnv(), async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `vocabularyDefinitions/${id}`),
      definitionDoc(createdBy, extra),
    );
  });
}

describe('firestore.rules — /vocabularyTerms', () => {
  it('anyone, signed out included, can read an active term', async () => {
    await seedTerm('alice');
    await assertSucceeds(getDoc(doc(asAnon(getEnv()), `vocabularyTerms/${TERM_ID}`)));
  });

  it('a member creates a term at its derived id', async () => {
    await seedMember('alice');
    await assertSucceeds(
      setDoc(doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`), termDoc('alice')),
    );
  });

  it('a non-member CANNOT create a term', async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), 'mallory'), `vocabularyTerms/${TERM_ID}`), termDoc('mallory')),
    );
  });

  it('CANNOT create a term whose doc id does not match its municipalityId + slug', async () => {
    await seedMember('alice');
    await assertFails(
      setDoc(doc(asUser(getEnv(), 'alice'), 'vocabularyTerms/m2__esbardo'), termDoc('alice')),
    );
  });

  it('CANNOT create a term whose doc id does not match its normalized form', async () => {
    await seedMember('alice');
    await assertFails(
      setDoc(doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${M}__otracosa`), termDoc('alice')),
    );
  });

  it('CANNOT create a term seeded with a non-zero definitionCount', async () => {
    await seedMember('alice');
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`),
        termDoc('alice', { definitionCount: 7 }),
      ),
    );
  });

  it('CANNOT create a term carrying an unknown field', async () => {
    await seedMember('alice');
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`),
        termDoc('alice', { upvotes: 3 }),
      ),
    );
  });

  it('CANNOT create a term with an unknown kind', async () => {
    await seedMember('alice');
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`),
        termDoc('alice', { kind: 'insulto' }),
      ),
    );
  });

  it('a term is not client-updatable, not even by its author', async () => {
    await seedMember('alice');
    await seedTerm('alice');
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`), { term: 'Esbardu' }),
    );
  });

  it('the author deletes an empty term', async () => {
    await seedMember('alice');
    await seedTerm('alice');
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`)));
  });

  it('the author CANNOT delete a term that still has definitions', async () => {
    await seedMember('alice');
    await seedTerm('alice', { definitionCount: 1 });
    await assertFails(deleteDoc(doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`)));
  });

  it('a village admin deletes a term regardless of its definitions', async () => {
    await seedMember('root', 'admin');
    await seedTerm('alice', { definitionCount: 4 });
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), 'root'), `vocabularyTerms/${TERM_ID}`)));
  });
});

describe('firestore.rules — /vocabularyWords (the shared word index)', () => {
  // Derived, function-owned, and public: it is what the "añadir palabra"
  // search reads, so a client write here would let one villager restyle a
  // word's spelling for every pueblo, or invent one no village records.
  const WORD = 'vocabularyWords/esbardo';
  const wordDoc = () => ({
    term: 'Esbardo',
    normalized: 'esbardo',
    kind: 'palabra',
    villageCount: 2,
    firstMunicipalityId: M,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  async function seedWord() {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), WORD), wordDoc());
    });
  }

  it('anyone, signed out included, can read the index — search must work for visitors', async () => {
    await seedWord();
    await assertSucceeds(getDoc(doc(asAnon(getEnv()), WORD)));
  });

  it('a village member CANNOT invent a word in the index', async () => {
    await seedMember('alice');
    await assertFails(setDoc(doc(asUser(getEnv(), 'alice'), WORD), wordDoc()));
  });

  it('a village member CANNOT restyle a word for every pueblo', async () => {
    await seedMember('alice');
    await seedWord();
    await assertFails(updateDoc(doc(asUser(getEnv(), 'alice'), WORD), { term: 'ESBARDO!!' }));
  });

  it('a village member CANNOT inflate a word’s village count', async () => {
    await seedMember('alice');
    await seedWord();
    await assertFails(updateDoc(doc(asUser(getEnv(), 'alice'), WORD), { villageCount: 999 }));
  });

  it('even a village admin CANNOT write the index — it is derived, not authored', async () => {
    await seedMember('root', 'admin');
    await seedWord();
    await assertFails(deleteDoc(doc(asUser(getEnv(), 'root'), WORD)));
  });
});

describe('firestore.rules — digitization credit on words and meanings', () => {
  // Credit is not authority, so the rules only guard two things: the author
  // cannot write themselves out of their own contribution, and a list cannot
  // be used to name the whole village.

  it('a member credits other villagers and groups on a new word', async () => {
    await seedMember('alice');
    await assertSucceeds(
      setDoc(
        doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`),
        termDoc('alice', {
          contributorUserIds: ['alice', 'bob', 'carol'],
          contributorOrgIds: ['peña-el-botijo'],
        }),
      ),
    );
  });

  it('CANNOT create a word whose credit leaves its own author out', async () => {
    await seedMember('alice');
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`),
        termDoc('alice', { contributorUserIds: ['bob'] }),
      ),
    );
  });

  it('CANNOT create a word crediting more than twenty people', async () => {
    await seedMember('alice');
    const everyone = ['alice', ...Array.from({ length: 20 }, (_, i) => `u${String(i)}`)];
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`),
        termDoc('alice', { contributorUserIds: everyone }),
      ),
    );
  });

  it('CANNOT create a word crediting more than twenty groups', async () => {
    await seedMember('alice');
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`),
        termDoc('alice', { contributorOrgIds: Array.from({ length: 21 }, (_, i) => `o${String(i)}`) }),
      ),
    );
  });

  it('CANNOT create a word without the credit fields at all', async () => {
    await seedMember('alice');
    const { contributorUserIds: _u, contributorOrgIds: _o, ...uncredited } = termDoc('alice');
    await assertFails(
      setDoc(doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`), uncredited),
    );
  });

  it('a member credits others on a meaning', async () => {
    await seedMember('bob');
    await seedTerm('alice');
    await assertSucceeds(
      addDoc(
        collection(asUser(getEnv(), 'bob'), 'vocabularyDefinitions'),
        definitionDoc('bob', { contributorUserIds: ['bob', 'dora'], contributorOrgIds: ['o1'] }),
      ),
    );
  });

  it('CANNOT add a meaning whose credit leaves its own author out', async () => {
    await seedMember('bob');
    await seedTerm('alice');
    await assertFails(
      addDoc(
        collection(asUser(getEnv(), 'bob'), 'vocabularyDefinitions'),
        definitionDoc('bob', { contributorUserIds: ['dora'] }),
      ),
    );
  });

  it('the author re-credits their own meaning', async () => {
    await seedMember('bob');
    await seedTerm('alice');
    await seedDefinition('d1', 'bob');
    await assertSucceeds(
      updateDoc(doc(asUser(getEnv(), 'bob'), 'vocabularyDefinitions/d1'), {
        contributorUserIds: ['bob', 'dora'],
        updatedAt: new Date(),
      }),
    );
  });

  it('the author CANNOT re-credit their meaning so that it drops themselves', async () => {
    await seedMember('bob');
    await seedTerm('alice');
    await seedDefinition('d1', 'bob');
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'bob'), 'vocabularyDefinitions/d1'), {
        contributorUserIds: ['dora'],
        updatedAt: new Date(),
      }),
    );
  });

  it('somebody credited on a meaning CANNOT edit it — credit is not authority', async () => {
    await seedMember('dora');
    await seedTerm('alice');
    await seedDefinition('d1', 'bob', { contributorUserIds: ['bob', 'dora'] });
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'dora'), 'vocabularyDefinitions/d1'), {
        definition: 'Otra cosa.',
        updatedAt: new Date(),
      }),
    );
  });

  it('a word’s credit is fixed once recorded — not even its author re-credits it', async () => {
    await seedMember('alice');
    await seedTerm('alice');
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`), {
        contributorUserIds: ['alice', 'bob'],
      }),
    );
  });
});

describe('firestore.rules — adding a word, as vocabularyService actually does it', () => {
  // The service reads the derived term id BEFORE writing it (ensureVocabularyTerm),
  // because a blind setDoc onto an existing term would be an *update* in rules
  // terms and is denied. That read lands on a document that does not exist yet,
  // and a read rule that dereferences `resource.data` errors on a null resource
  // instead of returning "not found" — which Firestore reports as
  // permission-denied. This is the exact first step of adding any new word, so
  // it broke the whole feature while every single-rule test still passed.
  it('a member can read a term that does not exist yet — the first step of adding a word', async () => {
    await seedMember('alice');
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`)));
  });

  it('a signed-out visitor can read a term that does not exist — a dead share link is 404, not denied', async () => {
    await assertSucceeds(getDoc(doc(asAnon(getEnv()), `vocabularyTerms/${TERM_ID}`)));
  });

  it('reading a missing term reports it as missing rather than throwing', async () => {
    await seedMember('alice');
    const snap = await getDoc(doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`));
    expect(snap.exists()).toBe(false);
  });

  // The whole addVocabularyEntry sequence, in order: probe, create the term,
  // attach the first definition.
  it('runs the full add-a-word sequence the service performs', async () => {
    await seedMember('alice');
    const alice = asUser(getEnv(), 'alice');
    await assertSucceeds(getDoc(doc(alice, `vocabularyTerms/${TERM_ID}`)));
    await assertSucceeds(setDoc(doc(alice, `vocabularyTerms/${TERM_ID}`), termDoc('alice')));
    await assertSucceeds(
      addDoc(collection(alice, 'vocabularyDefinitions'), definitionDoc('alice')),
    );
  });

  // Second contributor on the same word: their probe finds the existing term, so
  // they skip the create and only attach a definition.
  it('lets a second villager attach a meaning to a word somebody else added', async () => {
    await seedMember('alice');
    await seedMember('bob');
    await seedTerm('alice');
    const bob = asUser(getEnv(), 'bob');
    const probe = await getDoc(doc(bob, `vocabularyTerms/${TERM_ID}`));
    expect(probe.exists()).toBe(true);
    await assertSucceeds(addDoc(collection(bob, 'vocabularyDefinitions'), definitionDoc('bob')));
  });
});

describe('firestore.rules — /vocabularyDefinitions', () => {
  // The dictionary list credits every contributor per row from one query over
  // the village's meanings — which a signed-out web reader must be able to run.
  it('anyone, signed out included, can list a village’s active meanings', async () => {
    await seedDefinition('d1', 'alice');
    await assertSucceeds(
      getDocs(
        query(
          collection(asAnon(getEnv()), 'vocabularyDefinitions'),
          where('municipalityId', '==', M),
          where('status', '==', 'active'),
        ),
      ),
    );
  });

  it('a member adds a definition to an existing term', async () => {
    await seedMember('bob');
    await seedTerm('alice');
    await assertSucceeds(
      addDoc(collection(asUser(getEnv(), 'bob'), 'vocabularyDefinitions'), definitionDoc('bob')),
    );
  });

  it('CANNOT add a definition claiming a municipality the term does not belong to', async () => {
    await seedMember('bob');
    await seed(getEnv(), async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `vocabularyTerms/${TERM_ID}`),
        termDoc('alice', { municipalityId: 'm2' }),
      );
    });
    await assertFails(
      addDoc(collection(asUser(getEnv(), 'bob'), 'vocabularyDefinitions'), definitionDoc('bob')),
    );
  });

  it('CANNOT add a definition pointing at a term that does not exist', async () => {
    await seedMember('bob');
    await assertFails(
      addDoc(collection(asUser(getEnv(), 'bob'), 'vocabularyDefinitions'), definitionDoc('bob')),
    );
  });

  it('CANNOT add a definition attributed to somebody else', async () => {
    await seedMember('bob');
    await seedTerm('alice');
    await assertFails(
      addDoc(collection(asUser(getEnv(), 'bob'), 'vocabularyDefinitions'), definitionDoc('alice')),
    );
  });

  it('the author edits their own definition', async () => {
    await seedMember('bob');
    await seedTerm('alice');
    await seedDefinition('d1', 'bob');
    await assertSucceeds(
      updateDoc(doc(asUser(getEnv(), 'bob'), 'vocabularyDefinitions/d1'), {
        definition: 'Cría del oso pardo.',
        updatedAt: new Date(),
      }),
    );
  });

  it('a village admin CANNOT rewrite somebody else’s meaning — hide/delete is the lever', async () => {
    await seedMember('root', 'admin');
    await seedTerm('alice');
    await seedDefinition('d1', 'bob');
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'root'), 'vocabularyDefinitions/d1'), {
        definition: 'Otra cosa.',
        updatedAt: new Date(),
      }),
    );
  });

  it('the author CANNOT re-point their definition at another term', async () => {
    await seedMember('bob');
    await seedTerm('alice');
    await seedDefinition('d1', 'bob');
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'bob'), 'vocabularyDefinitions/d1'), {
        termId: `${M}__otracosa`,
      }),
    );
  });

  it('the author CANNOT unhide their own moderated definition', async () => {
    await seedMember('bob');
    await seedTerm('alice');
    await seedDefinition('d1', 'bob', { status: 'hidden', hiddenBy: 'root' });
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'bob'), 'vocabularyDefinitions/d1'), {
        status: 'active',
        hiddenBy: null,
      }),
    );
  });

  it('a village admin deletes somebody else’s definition', async () => {
    await seedMember('root', 'admin');
    await seedTerm('alice');
    await seedDefinition('d1', 'bob');
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), 'root'), 'vocabularyDefinitions/d1')));
  });

  it('an unrelated member CANNOT delete somebody else’s definition', async () => {
    await seedMember('carol');
    await seedTerm('alice');
    await seedDefinition('d1', 'bob');
    await assertFails(deleteDoc(doc(asUser(getEnv(), 'carol'), 'vocabularyDefinitions/d1')));
  });
});

// A hidden word or meaning leaves the open feed: only its pueblo's members and
// its author still read it.
describe('firestore.rules — reading a hidden word or meaning', () => {
  const hidden = { status: 'hidden', hiddenBy: 'vadmin', hiddenAt: new Date(), hiddenReason: 'spam' };

  it('refuses a stranger a hidden term, and lets its pueblo and its author read it', async () => {
    await seedMember('bob');
    await seedTerm('alice', hidden);
    await assertFails(getDoc(doc(asAnon(getEnv()), `vocabularyTerms/${TERM_ID}`)));
    await assertFails(getDoc(doc(asUser(getEnv(), 'carol'), `vocabularyTerms/${TERM_ID}`)));
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'bob'), `vocabularyTerms/${TERM_ID}`)));
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'alice'), `vocabularyTerms/${TERM_ID}`)));
  });

  it('refuses a stranger a hidden definition, and lets its pueblo and its author read it', async () => {
    await seedMember('bob');
    await seedTerm('alice');
    await seedDefinition('d1', 'alice', hidden);
    await assertFails(getDoc(doc(asUser(getEnv(), 'carol'), 'vocabularyDefinitions/d1')));
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'bob'), 'vocabularyDefinitions/d1')));
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'alice'), 'vocabularyDefinitions/d1')));
  });
});
