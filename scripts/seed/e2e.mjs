#!/usr/bin/env node
/**
 * Seed the Firebase emulator with the deterministic E2E fixture set.
 *
 * Standalone — it does NOT go through the demo-dataset domain seeders, so the
 * E2E substrate stays isolated from the dev-seed path. But it builds every doc
 * via the SAME production model builders (`@cultuvilla/shared/models`), so the
 * fixtures can't drift from the schema the strict converters enforce (D5).
 *
 * Refuses to run unless the emulator env vars are set (context.mjs will not
 * touch the real dev project). Run via `pnpm seed:e2e` after `pnpm shared:build`.
 */
import { db, auth, GeoPoint, EMULATOR } from './lib/context.mjs';
import {
  buildUserData,
  buildPersonData,
  buildAdminData,
  buildMunicipalityData,
  buildVillageCommunity,
  buildVillageMemberData,
  buildOrganizationData,
  buildOrgMemberData,
  buildEventData,
  buildRegistrationData,
  buildLocationData,
  buildPlaceData,
} from '@cultuvilla/shared/models';
import {
  E2E_PASSWORD,
  users,
  village,
  joinVillage,
  organizerlessVillage,
  org,
  approvalOrg,
  event,
  capacityEvent,
  dependentPerson,
  place,
} from '../data/seed-fixtures/e2e/fixtures.mjs';

if (!EMULATOR) {
  console.error(
    '[seed:e2e] Emulator env not detected. Set FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST\n' +
      '           (scripts/run-tests-with-emulators.mjs does this) — this seeder never targets the real project.',
  );
  process.exit(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Create the Auth user with a deterministic uid, or update it if it exists. */
async function upsertUser({ uid, email, displayName }) {
  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, { email, password: E2E_PASSWORD, displayName, emailVerified: true });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      await auth.createUser({ uid, email, password: E2E_PASSWORD, displayName, emailVerified: true });
    } else {
      throw err;
    }
  }
}

async function run() {
  // Auth accounts + persons/{id} + users/{uid} profile docs. The person is
  // linked via personId so the app treats the user as onboarded (otherwise the
  // register FAB never renders — it diverts to complete-profile).
  for (const u of [users.admin, users.attendee, users.superAdmin, users.joiner]) {
    await upsertUser(u);
    await db
      .collection('persons')
      .doc(u.personId)
      .set(
        buildPersonData({
          givenName: u.givenName,
          firstSurname: u.firstSurname,
          createdBy: u.uid,
          userId: u.uid,
        }),
        { merge: true },
      );
    await db
      .collection('users')
      .doc(u.uid)
      .set(
        buildUserData({
          displayName: u.displayName,
          email: u.email,
          personId: u.personId,
          telephone: u.telephone,
        }),
        { merge: true },
      );
  }

  await db
    .collection('persons')
    .doc(dependentPerson.docId)
    .set(
      buildPersonData({
        givenName: dependentPerson.givenName,
        firstSurname: dependentPerson.firstSurname,
        createdBy: users.attendee.uid,
        userId: null,
        municipalityLinks: [{ municipalityId: village.docId, barrioId: null }],
      }),
      { merge: true },
    );

  // The "fresh" user is Auth-only: no persons/{id}, no users/{uid} profile. The
  // onboarding-profile flow signs it in and drives complete-profile from scratch.
  await upsertUser(users.fresh);

  // App super-admin grant. Presence of admins/{uid} is what isAppAdmin() tests;
  // it authorizes respondToOrganizerRequest in the organizer-request flow.
  await db.collection('admins').doc(users.superAdmin.uid).set(buildAdminData(), { merge: true });

  // Activated village = municipality doc + community overlay + members
  const coords = new GeoPoint(village.coordinates.lat, village.coordinates.lng);
  await db
    .collection('municipalities')
    .doc(village.docId)
    .set(
      {
        ...buildMunicipalityData({
          name: village.name,
          province: village.province,
          comunidadAutonoma: village.comunidadAutonoma,
          codigoINE: village.codigoINE,
          slug: village.slug,
          coordinates: coords,
        }),
        community: buildVillageCommunity({
          description: village.description,
          adminUserId: users.admin.uid,
        }),
        communityActive: true,
      },
      { merge: true },
    );
  const members = db.collection('municipalities').doc(village.docId).collection('members');
  await members
    .doc(users.admin.uid)
    .set(buildVillageMemberData({ userId: users.admin.uid, role: 'admin' }), { merge: true });
  await members
    .doc(users.attendee.uid)
    .set(buildVillageMemberData({ userId: users.attendee.uid, role: 'user' }), { merge: true });
  await members
    .doc(users.joiner.uid)
    .set(buildVillageMemberData({ userId: users.joiner.uid, role: 'user' }), { merge: true });

  const joinCoords = new GeoPoint(joinVillage.coordinates.lat, joinVillage.coordinates.lng);
  await db
    .collection('municipalities')
    .doc(joinVillage.docId)
    .set(
      {
        ...buildMunicipalityData({
          name: joinVillage.name,
          province: joinVillage.province,
          comunidadAutonoma: joinVillage.comunidadAutonoma,
          codigoINE: joinVillage.codigoINE,
          slug: joinVillage.slug,
          coordinates: joinCoords,
        }),
        community: buildVillageCommunity({
          description: joinVillage.description,
          adminUserId: users.admin.uid,
        }),
        communityActive: true,
      },
      { merge: true },
    );

  // Active village, started but organizer-less (community.organizerId === null).
  // The organizer-request flow requests to organize it; approval sets the
  // organizerId and promotes the requester to admin.
  const solanaCoords = new GeoPoint(
    organizerlessVillage.coordinates.lat,
    organizerlessVillage.coordinates.lng,
  );
  await db
    .collection('municipalities')
    .doc(organizerlessVillage.docId)
    .set(
      {
        ...buildMunicipalityData({
          name: organizerlessVillage.name,
          province: organizerlessVillage.province,
          comunidadAutonoma: organizerlessVillage.comunidadAutonoma,
          codigoINE: organizerlessVillage.codigoINE,
          slug: organizerlessVillage.slug,
          coordinates: solanaCoords,
        }),
        community: buildVillageCommunity({ description: organizerlessVillage.description }),
        communityActive: true,
      },
      { merge: true },
    );

  // Approved organization + founding admin member. approveOrganization writes
  // the member in prod; the demo org seeder omits it, so seed it here directly.
  await db
    .collection('organizations')
    .doc(org.docId)
    .set(
      buildOrganizationData({
        name: org.name,
        type: org.type,
        description: org.description,
        municipalityId: village.docId,
        villageSlug: village.slug,
        requestedBy: users.admin.uid,
        status: 'approved',
        reviewedBy: users.admin.uid,
        reviewedAt: new Date(),
      }),
      { merge: true },
    );
  await db
    .collection('organizations')
    .doc(org.docId)
    .collection('members')
    .doc(users.admin.uid)
    .set(buildOrgMemberData({ userId: users.admin.uid, role: 'admin' }), { merge: true });

  // Approved peña that admits members by request. Its only member is its admin,
  // who resolves the joiner's request in the org-join-request flow.
  await db
    .collection('organizations')
    .doc(approvalOrg.docId)
    .set(
      buildOrganizationData({
        name: approvalOrg.name,
        type: approvalOrg.type,
        description: approvalOrg.description,
        municipalityId: village.docId,
        villageSlug: village.slug,
        requestedBy: users.admin.uid,
        status: 'approved',
        reviewedBy: users.admin.uid,
        reviewedAt: new Date(),
        joinPolicy: 'approval',
      }),
      { merge: true },
    );
  await db
    .collection('organizations')
    .doc(approvalOrg.docId)
    .collection('members')
    .doc(users.admin.uid)
    .set(buildOrgMemberData({ userId: users.admin.uid, role: 'admin' }), { merge: true });

  // Upcoming published event in the village
  const startDate = new Date(Date.now() + event.startOffsetDays * DAY_MS);
  await db
    .collection('events')
    .doc(event.docId)
    .set(
      buildEventData({
        title: event.title,
        description: event.description,
        startDate,
        location: buildLocationData({
          coordinates: village.coordinates,
          displayName: `Plaza Mayor, ${village.name}`,
        }),
        maxAttendees: event.maxAttendees,
        telephoneRequired: false,
        status: event.status,
        organizerUserIds: [users.admin.uid],
        organizerOrgIds: [org.docId],
        createdBy: users.admin.uid,
        municipalityId: village.docId,
        villageName: village.name,
        villageSlug: village.slug,
        villageCoordinates: coords,
      }),
      { merge: true },
    );

  const capacityStartDate = new Date(Date.now() + capacityEvent.startOffsetDays * DAY_MS);
  const capacityData = buildEventData({
    title: capacityEvent.title,
    description: capacityEvent.description,
    startDate: capacityStartDate,
    location: buildLocationData({
      coordinates: village.coordinates,
      displayName: `Centro social, ${village.name}`,
    }),
    maxAttendees: capacityEvent.maxAttendees,
    telephoneRequired: false,
    status: capacityEvent.status,
    organizerUserIds: [users.admin.uid],
    organizerOrgIds: [org.docId],
    createdBy: users.admin.uid,
    municipalityId: village.docId,
    villageName: village.name,
    villageSlug: village.slug,
    villageCoordinates: coords,
  });
  await db
    .collection('events')
    .doc(capacityEvent.docId)
    .set(
      {
        ...capacityData,
        confirmedCount: 1,
        totalCount: 1,
      },
      { merge: true },
    );
  await db
    .collection('events')
    .doc(capacityEvent.docId)
    .collection('registrations')
    .doc(capacityEvent.seededRegistrationId)
    .set(
      buildRegistrationData({
        userId: users.admin.uid,
        personId: users.admin.personId,
        name: `${users.admin.givenName} ${users.admin.firstSurname}`,
        status: 'confirmed',
        position: 0,
        isMember: true,
      }),
      { merge: true },
    );

  await db
    .collection('municipalities')
    .doc(village.docId)
    .collection('places')
    .doc(place.docId)
    .set(
      buildPlaceData({
        name: place.name,
        kind: place.kind,
        description: place.description,
        municipalityId: village.docId,
        proposedBy: users.admin.uid,
      }),
      { merge: true },
    );

  console.log(
    `[seed:e2e] seeded emulator (users=${users.admin.uid},${users.attendee.uid},` +
      `${users.superAdmin.uid},${users.joiner.uid},${users.fresh.uid} ` +
      `village=${village.docId} organizerless=${organizerlessVillage.docId} ` +
      `joinVillage=${joinVillage.docId} org=${org.docId} approvalOrg=${approvalOrg.docId} ` +
      `event=${event.docId} ` +
      `capacityEvent=${capacityEvent.docId})`,
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed:e2e] failed:', err);
    process.exit(1);
  });
