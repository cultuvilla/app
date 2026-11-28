import { orphanInvariant, referenceInvariant, type Ref } from '../factories';
import type { SnapshotDoc } from '../types';

function stringArray(doc: SnapshotDoc, field: string): unknown[] {
  const value = doc.data[field];
  return Array.isArray(value) ? (value as unknown[]) : [];
}

export const eventMunicipalityExists = referenceInvariant({
  id: 'events.municipalityId.exists',
  description: 'Every event belongs to an existing municipality',
  collection: 'events',
  targets: ['municipalities'],
  refs: (doc) => [{ field: 'municipalityId', value: doc.data['municipalityId'], target: 'municipalities' }],
});

export const eventOrganizerOrgsExist = referenceInvariant({
  id: 'events.organizerOrgIds.exist',
  description: 'Every organizing group of an event exists',
  collection: 'events',
  targets: ['organizations'],
  refs: (doc) => stringArray(doc, 'organizerOrgIds').map((value): Ref => ({ field: 'organizerOrgIds', value, target: 'organizations' })),
});

export const eventVisibilityOrgExists = referenceInvariant({
  id: 'events.visibilityOrgId.exists',
  description: 'A private event names an existing group',
  collection: 'events',
  targets: ['organizations'],
  refs: (doc) => [{ field: 'visibilityOrgId', value: doc.data['visibilityOrgId'], target: 'organizations', optional: true }],
});

export const eventFiestaEditionExists = referenceInvariant({
  id: 'events.fiestaEditionId.exists',
  description: 'An event filed under a fiesta edition names an existing one',
  collection: 'events',
  targets: ['fiestaEditions'],
  refs: (doc) => [{ field: 'fiestaEditionId', value: doc.data['fiestaEditionId'], target: 'fiestaEditions', optional: true }],
});

export const registrationParentExists = orphanInvariant('eventRegistrations');

export const registrationPersonExists = referenceInvariant({
  id: 'eventRegistrations.personId.exists',
  description: 'Every registration names an existing person (walk-ins carry none)',
  collection: 'eventRegistrations',
  targets: ['persons'],
  refs: (doc) => [{ field: 'personId', value: doc.data['personId'], target: 'persons', optional: true }],
});

export const newsMunicipalityExists = referenceInvariant({
  id: 'news.municipalityId.exists',
  description: 'Every news post belongs to an existing municipality',
  collection: 'news',
  targets: ['municipalities'],
  refs: (doc) => [{ field: 'municipalityId', value: doc.data['municipalityId'], target: 'municipalities' }],
});

export const newsOrganizerOrgsExist = referenceInvariant({
  id: 'news.organizerOrgIds.exist',
  description: 'Every group a news post is published by exists',
  collection: 'news',
  targets: ['organizations'],
  refs: (doc) => stringArray(doc, 'organizerOrgIds').map((value): Ref => ({ field: 'organizerOrgIds', value, target: 'organizations' })),
});
