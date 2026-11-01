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
import {
  buildCuotaAssignmentData,
  buildCuotaPaymentData,
  buildCuotaSettingsData,
} from '../../src/models/organization/CuotaDataModel';
import { buildGroupTaskData, buildTaskTemplateData } from '../../src/models/organization/GroupTaskDataModel';
import { buildGroupNotificationPrefsData } from '../../src/models/notification/NotificationPrefsDataModel';
import { buildActaData, buildLedgerEntryData } from '../../src/models/organization/RecordsDataModel';
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
    label: 'organizations/{orgId}/actas — isValidActaFields (actaKeys)',
    build: () => buildActaData({ body: 'asamblea_general', heldOn: '2026-03-15', createdBy: 'u1' }),
    ruleKeys: [
      'body', 'title', 'heldOn', 'place', 'attendees', 'otherAttendees', 'agenda', 'agreements',
      'visibleToSocios', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt',
    ],
  },
  {
    label: 'organizations/{orgId}/ledgerEntries — isValidLedgerEntry',
    build: () => buildLedgerEntryData({ kind: 'expense', amountCents: 12000, on: '2026-08-14', concept: 'Orquesta', recordedBy: 'u1' }),
    ruleKeys: ['kind', 'amountCents', 'on', 'concept', 'category', 'reversesId', 'recordedBy', 'recordedAt'],
  },
  {
    label: 'organizations/{orgId}/tasks — isValidGroupTaskCreate (groupTaskKeys)',
    build: () => buildGroupTaskData({ title: 'Asamblea', createdBy: 'u1' }),
    ruleKeys: [
      'title', 'notes', 'assigneeUids', 'dueOn', 'time', 'slots', 'claimedUids', 'waitlistUids',
      'declinedUids', 'recurrence', 'nextTaskId', 'eventId', 'doneAt', 'doneBy', 'createdBy', 'createdAt',
    ],
  },
  {
    label: 'organizations/{orgId}/taskTemplates — isValidTaskTemplate',
    build: () =>
      buildTaskTemplateData({ name: 'Fiestas', items: [{ title: 'Orquesta', notes: null, offsetDays: -60, time: null, slots: null }], updatedBy: 'u1' }),
    ruleKeys: ['name', 'items', 'updatedBy', 'updatedAt'],
  },
  {
    label: 'users/{uid}/groupPrefs/{orgId} — inline in match /groupPrefs',
    build: () => buildGroupNotificationPrefsData({ messagesMuted: true }),
    ruleKeys: ['messagesMuted', 'generalChatPush', 'updatedAt'],
  },
  {
    label: 'organizations/{orgId}/cuotaSettings — isValidCuotaSettings',
    build: () =>
      buildCuotaSettingsData({
        amountCents: 3000, periodicity: 'yearly', dueMonth: 3, dueDay: 1, graceDays: 30, startPeriod: '2026', configuredBy: 'u1',
      }),
    ruleKeys: [
      'amountCents', 'periodicity', 'dueMonth', 'dueDay', 'graceDays', 'startPeriod', 'tiers',
      'bizum', 'iban', 'payInstructions', 'remindersEnabled', 'configuredBy', 'updatedAt',
    ],
  },
  {
    label: 'organizations/{orgId}/cuotaAssignments — isValidCuotaAssignment',
    build: () => buildCuotaAssignmentData({ updatedBy: 'u1' }),
    ruleKeys: ['tierId', 'exempt', 'customAmountCents', 'updatedBy', 'updatedAt'],
  },
  {
    label: 'organizations/{orgId}/cuotaPayments — isValidCuotaPayment',
    build: () =>
      buildCuotaPaymentData({ socioId: 's1', periodKey: '2026', amountCents: 3000, method: 'bizum', paidOn: '2026-02-20', recordedBy: 'u1' }),
    ruleKeys: [
      'socioId', 'periodKey', 'kind', 'reversesId', 'amountCents', 'method', 'paidOn',
      'note', 'recordedBy', 'recordedAt',
    ],
  },
  {
    label: 'organizations — isValidOrganizationCreate',
    build: () =>
      buildOrganizationData({ name: 'Peña', type: 'peña', municipalityId: 'm1', villageSlug: 'matabuena', requestedBy: 'u1' }),
    ruleKeys: [
      'name', 'description', 'images', 'type', 'status', 'municipalityId', 'villageSlug',
      'requestedBy', 'reviewedBy', 'createdAt', 'reviewedAt',
      'commentCount', 'readCount', 'memberCount', 'followerCount', 'membersPublic', 'joinPolicy', 'sociosListVisible',
      'chatAdminsOnly',
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
