// Cross-layer data-integrity invariant (workstream A4).
//
// Every create-gated Firestore collection is validated in two places written in
// two different languages: a TypeScript model builder (`build*Data`) and an
// `isValid*Create(d)` function in `firestore.rules` that pins the exact field
// set via `keys().hasOnly([...]).hasAll([...])`. These drift silently:
//   - add a field to a builder but not the rule  → the rule rejects a
//     legitimate client write in prod.
//   - tighten the rule but not the builder        → the strict Zod converter
//     (makeConverter → schema.parse) throws on the next read.
// This suite fails the moment a builder's output key set and its rule's allowed
// key set disagree, so the two must be changed together.
//
// It is a pure in-memory test (no emulator): it compares `Object.keys(builder())`
// against the key list transcribed from firestore.rules. When you change a rule
// validator, update the matching `ruleKeys` here in the same commit.
import { describe, it, expect } from 'vitest';
import { buildOrganizationData } from '../../src/models/organization/OrganizationDataModel';
import { buildOrgMemberData } from '../../src/models/organization/OrgMemberDataModel';
import { buildOrgJoinRequestData } from '../../src/models/organization/OrgJoinRequestDataModel';
import { buildOrganizerRequestData } from '../../src/models/municipality/OrganizerRequestDataModel';
import { buildPlaceData, buildBarrioData } from '../../src/models/municipality/MunicipalityDataModel';

interface ShapeContract {
  /** Collection path + the firestore.rules validator it mirrors. */
  label: string;
  /** Build a representative doc with only the required inputs supplied. */
  build: () => Record<string, unknown>;
  /** Exact key set the rule's `keys().hasOnly([...]).hasAll([...])` permits. */
  ruleKeys: string[];
}

const SHAPE_CONTRACTS: ShapeContract[] = [
  {
    label: 'organizations — isValidOrganizationCreate',
    build: () =>
      buildOrganizationData({ name: 'Peña', type: 'peña', municipalityId: 'm1', villageSlug: 'matabuena', requestedBy: 'u1' }),
    ruleKeys: [
      'name', 'description', 'images', 'type', 'status', 'municipalityId', 'villageSlug',
      'requestedBy', 'reviewedBy', 'createdAt', 'reviewedAt',
      'commentCount', 'readCount', 'memberCount', 'membersPublic', 'joinPolicy',
    ],
  },
  {
    label: 'organizations/{orgId}/members — org member create validator',
    build: () => buildOrgMemberData({ userId: 'u1' }),
    ruleKeys: ['userId', 'joinedAt', 'role'],
  },
  {
    label: 'organizations/{orgId}/joinRequests — isValidOrgJoinRequestCreate',
    build: () => buildOrgJoinRequestData({ userId: 'u1', orgId: 'o1', municipalityId: 'm1' }),
    ruleKeys: ['userId', 'orgId', 'municipalityId', 'createdAt'],
  },
  {
    label: 'places (create) — isValidPlaceCreate',
    build: () => buildPlaceData({ name: 'Cementerio Viejo', kind: 'cemetery', municipalityId: 'm1' }),
    ruleKeys: [
      'name', 'kind', 'description', 'municipalityId', 'coordinates', 'locationLabel', 'images',
      'createdAt', 'status', 'proposedBy', 'contributorUserIds', 'contributorOrgIds', 'hiddenBy', 'hiddenAt', 'hiddenReason',
      'commentCount', 'readCount', 'burialCount',
    ],
  },
  {
    label: 'barrios (create) — isValidBarrioCreate',
    build: () => buildBarrioData({ name: 'Centro', municipalityId: 'm1' }),
    ruleKeys: [
      'name', 'municipalityId', 'kind', 'source', 'isSeat',
      'images', 'createdAt', 'status', 'proposedBy',
      'hiddenBy', 'hiddenAt', 'hiddenReason',
      'commentCount', 'readCount', 'residentCount',
    ],
  },
];

describe('model builder ↔ firestore.rules shape-validator contract', () => {
  for (const { label, build, ruleKeys } of SHAPE_CONTRACTS) {
    it(`${label}: builder output keys equal the rule's allowed key set`, () => {
      expect(Object.keys(build()).sort()).toEqual([...ruleKeys].sort());
    });
  }
});

describe('review-lifecycle create defaults', () => {
  // The rules' isValid*Create require a fresh request: status=='pending' with
  // reviewedAt/reviewedBy null; the response callables (respondToOrganizerRequest,
  // approveOrganization) all assume that starting state. Every approval-gated
  // builder must produce it.
  const PENDING_BUILDERS: Array<[string, Record<string, unknown>]> = [
    ['organization', buildOrganizationData({ name: 'x', type: 'peña', municipalityId: 'm', villageSlug: 'v', requestedBy: 'u' })],
    ['organizerRequest', buildOrganizerRequestData({ userId: 'u', municipalityId: 'm' })],
  ];

  for (const [name, built] of PENDING_BUILDERS) {
    it(`${name} defaults to pending with no reviewer`, () => {
      expect(built.status).toBe('pending');
      expect(built.reviewedBy).toBeNull();
      expect(built.reviewedAt).toBeNull();
    });
  }
});

describe('visibility-lifecycle create defaults', () => {
  // Barrios/places are instant self-service creates (no propose/approve
  // ceremony) — see AGENTS.md and the content-moderation-unification plan.
  // Every fresh doc must land `active` with no hide stamp; hiding happens
  // later via the `setContentVisibility` callable.
  const ACTIVE_BUILDERS: Array<[string, Record<string, unknown>]> = [
    ['place', buildPlaceData({ name: 'x', kind: 'cemetery', municipalityId: 'm' })],
    ['barrio', buildBarrioData({ name: 'x', municipalityId: 'm' })],
  ];

  for (const [name, built] of ACTIVE_BUILDERS) {
    it(`${name} defaults to active with no hide stamp`, () => {
      expect(built.status).toBe('active');
      expect(built.hiddenBy).toBeNull();
      expect(built.hiddenAt).toBeNull();
      expect(built.hiddenReason).toBeNull();
    });
  }
});
