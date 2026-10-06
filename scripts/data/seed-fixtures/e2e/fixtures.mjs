/**
 * Deterministic E2E fixtures for the Firebase emulator.
 *
 * Consumed by `scripts/seed/e2e.mjs`, which builds converter-valid docs via the
 * shared model builders (so these can't drift from schema — D5). The Maestro
 * flows under `apps/mobile/e2e/native/flows/` hard-code the handful of
 * identifiers they need (YAML can't import JS); THIS file is the source of truth.
 *
 * Small, stable, assertion-friendly on purpose — never the demo_1 showcase set.
 * IDs are fixed (not dataset-namespaced) because this set owns the emulator.
 */

export const E2E_PASSWORD = 'e2e-cultuvilla-pw';

// personId links the profile to a persons/{id} doc. Without it the app treats
// the user as not-yet-onboarded and diverts to complete-profile, so the event
// register FAB never renders — seed the person so login → sign-up is one hop.
export const users = {
  admin: {
    uid: 'e2e-admin',
    email: 'e2e-admin@cultuvilla.test',
    displayName: 'E2E Admin',
    personId: 'e2e-person-admin',
    givenName: 'Admin',
    firstSurname: 'E2E',
  },
  attendee: {
    uid: 'e2e-user',
    email: 'e2e-user@cultuvilla.test',
    displayName: 'E2E User',
    personId: 'e2e-person-user',
    givenName: 'Usuario',
    firstSurname: 'E2E',
    // A stored phone so the organizer-request screen (which validates a phone on
    // submit) prefills it — the flow doesn't have to drive the phone field.
    telephone: '+34600000000',
  },
  // App super-admin: presence of an admins/{uid} doc is what isAppAdmin() tests.
  // Approves organizer requests in the organizer-request-approval flow.
  superAdmin: {
    uid: 'e2e-superadmin',
    email: 'e2e-superadmin@cultuvilla.test',
    displayName: 'E2E Superadmin',
    personId: 'e2e-person-superadmin',
    givenName: 'Super',
    firstSurname: 'Admin',
    appAdmin: true,
  },
  // Onboarded villager who is NOT a member of any org — joins an open peña in
  // the org-create-approve-join flow and asks to join `approvalOrg` in the
  // org-join-request flow.
  joiner: {
    uid: 'e2e-joiner',
    email: 'e2e-joiner@cultuvilla.test',
    displayName: 'E2E Joiner',
    personId: 'e2e-person-joiner',
    givenName: 'Vecino',
    firstSurname: 'Nuevo',
  },
  // Auth account ONLY — no persons/{id}, no users/{uid} profile. Signing in
  // diverts to complete-profile, which is exactly what the onboarding flow drives.
  fresh: {
    uid: 'e2e-fresh',
    email: 'e2e-fresh@cultuvilla.test',
    displayName: 'E2E Fresh',
    authOnly: true,
  },
};

export const village = {
  docId: 'e2e-village-altozano',
  slug: 'altozano-de-prueba',
  name: 'Altozano de Prueba',
  province: 'Valencia',
  comunidadAutonoma: 'Comunitat Valenciana',
  codigoINE: '46999',
  description: 'Pueblo de prueba para los tests E2E.',
  coordinates: { lat: 39.4699, lng: -0.3763 },
};

export const joinVillage = {
  docId: 'e2e-village-join',
  slug: 'pueblo-de-union-e2e',
  name: 'Pueblo de Unión E2E',
  province: 'Valencia',
  comunidadAutonoma: 'Comunitat Valenciana',
  codigoINE: '46997',
  description: 'Pueblo activo usado para comprobar la unión directa.',
  coordinates: { lat: 39.52, lng: -0.42 },
};

// An ACTIVE village that has been started but has no organizer yet (community
// present, organizerId null — the "wiki phase"). The organizer-request-approval
// flow requests to organize THIS pueblo; on approval the super-admin sets its
// organizerId and promotes the requester to admin. Kept separate from the main
// `village` so approving it never mutates state other flows rely on.
export const organizerlessVillage = {
  docId: 'e2e-village-solana',
  slug: 'solana-de-prueba',
  name: 'Solana de Prueba',
  province: 'Valencia',
  comunidadAutonoma: 'Comunitat Valenciana',
  codigoINE: '46998',
  description: 'Pueblo iniciado sin organizador, para el flujo de solicitud.',
  coordinates: { lat: 39.5, lng: -0.4 },
};

export const org = {
  docId: 'e2e-org-ayto',
  name: 'Ayuntamiento de Altozano',
  type: 'ayuntamiento',
  description: 'Organización de prueba para los tests E2E.',
};

// A peña whose members are admitted by approval (`joinPolicy: 'approval'`).
// The org-join-request flow asks to join it as `users.joiner`; `users.admin` is
// its org admin and resolves the request from the Buzón.
export const approvalOrg = {
  docId: 'e2e-org-pena-cerrada',
  name: 'Peña Cerrada E2E',
  type: 'peña',
  description: 'Peña con admisión por solicitud, para el flujo de unión con aprobación.',
};

export const event = {
  docId: 'e2e-event-fiesta',
  title: 'Fiesta de Prueba E2E',
  description: 'Evento de prueba para el flujo de inscripción end-to-end.',
  startOffsetDays: 7,
  maxAttendees: 100,
  status: 'published',
};

export const capacityEvent = {
  docId: 'e2e-event-aforo',
  title: 'Evento con Aforo E2E',
  description: 'Evento lleno usado para comprobar lista de espera y promoción.',
  startOffsetDays: 8,
  maxAttendees: 1,
  status: 'published',
  seededRegistrationId: 'e2e-reg-admin-confirmed',
};

export const dependentPerson = {
  docId: 'e2e-person-dependent',
  givenName: 'Lucía',
  firstSurname: 'Dependiente',
};

export const place = {
  docId: 'e2e-place-plaza',
  name: 'Plaza E2E Visible',
  kind: 'plaza',
  description: 'Lugar visible usado para comprobar eliminación moderada.',
};
