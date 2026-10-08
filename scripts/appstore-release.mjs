#!/usr/bin/env node
/**
 * Drive the iOS release from the command line (and from CI).
 *
 * `eas submit` stops at the upload. This picks up there:
 *
 *   status                    what ASC thinks the recent versions are
 *   submit [--build-number=N] attach the build, set notes, submit for review;
 *                             without N, the newest build of the app.config version
 *   release [--version=X.Y.Z] release an approved version waiting on the button
 *   phased --state=…          pause / resume / complete a rollout
 *   testflight [--build-number=N] [--groups=internal|external|all|Name,…] [--beta-review]
 *                             list TestFlight groups; with a build, add it to them
 *                             (--beta-review submits it for external testers)
 *
 * Everything that writes is dry-run by default and needs --apply, because these
 * calls are visible to Apple and to users and several are irreversible.
 *
 * Credentials come from APPLE_ASC_KEY_ID / APPLE_ASC_ISSUER_ID /
 * APPLE_ASC_API_KEY_P8 and the app from ASC_APP_ID — the same repo vars and
 * secret mobile-release.yml already uses. There is no key on a laptop by
 * design; run this through Actions → "App Store release".
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeAscRequest } from './lib/appstore.mjs';
import {
  distributeToTestflight,
  getAvailability,
  getBuildBetaState,
  latestBuildForVersion,
  listBetaGroups,
  listVersions,
  releaseVersion,
  setPhasedReleaseState,
  setReleaseType,
  submitIosForReview,
} from './lib/appstore-flows.mjs';
import { extractReleaseNotes } from './lib/changelog-notes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PHASED_STATES = ['PAUSE', 'RESUME', 'COMPLETE'];

function parseArgs(argv) {
  const out = { _: [] };
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const [key, value] = arg.replace(/^--/, '').split('=');
    out[key] = value ?? true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? 'status';
const apply = args.apply === true;
const log = (m) => console.log(m);

const ascAppId = process.env.ASC_APP_ID;
if (!ascAppId) {
  console.error('ASC_APP_ID is not set — it is a repo variable; see docs/store/release-runbook.md.');
  process.exit(1);
}

const request = makeAscRequest();
if (!request) {
  console.error(
    'App Store Connect credentials missing. Need APPLE_ASC_KEY_ID, APPLE_ASC_ISSUER_ID and\n' +
      'APPLE_ASC_API_KEY_P8. Beta/prod keys are not distributed to laptops — run this via\n' +
      'Actions → "App Store release".',
  );
  process.exit(1);
}

/** The marketing version the app currently declares. */
function appVersion() {
  const cfg = readFileSync(resolve(ROOT, 'apps/mobile/app.config.ts'), 'utf8');
  const m = cfg.match(/^\s*version:\s*'([^']+)'/m);
  if (!m) throw new Error('could not read `version` from apps/mobile/app.config.ts');
  return m[1];
}

function requireApply(what) {
  if (apply) return;
  console.log(`\nDRY RUN — nothing was sent to Apple. Re-run with --apply to ${what}.`);
  process.exit(0);
}

switch (command) {
  case 'status': {
    const versions = await listVersions(request, { ascAppId });
    if (!versions.length) {
      console.log('No iOS App Store versions exist for this app yet.');
      break;
    }
    console.log('\nApp Store versions (newest first)\n');
    for (const v of versions) {
      console.log(
        `  ${String(v.versionString).padEnd(10)} build ${String(v.buildNumber ?? '—').padEnd(5)} ` +
          `${String(v.appStoreState).padEnd(26)} releaseType=${v.releaseType ?? '—'}`,
      );
    }
    const pending = versions.filter((v) => v.appStoreState === 'PENDING_DEVELOPER_RELEASE');
    if (pending.length) {
      console.log(
        `\n${pending.length} version(s) approved and waiting on a manual release. ` +
          `Run: appstore-release.mjs release --apply`,
      );
    }
    const manual = versions.filter((v) => v.releaseType && v.releaseType !== 'AFTER_APPROVAL');
    if (manual.length) {
      console.log(
        `${manual.length} version(s) still on a manual releaseType — future approvals will stall the same way.`,
      );
    }

    // An approved version in an app that is removed from sale is invisible in
    // every storefront, and nothing on the version says so.
    const availability = await getAvailability(request, { ascAppId });
    if (!availability.known) {
      console.log(`\nAvailability: could not read it — ${availability.reason}`);
    } else if (availability.forSale) {
      console.log(
        `\nAvailability: for sale in ${availability.atLeast ? '200+' : availability.territories} territories ` +
          `(via ${availability.source}).`,
      );
    } else {
      console.log(
        '\nAvailability: THE APP IS REMOVED FROM SALE — for sale in 0 territories.\n' +
          'An approved version will still appear nowhere. Fix it in App Store Connect →\n' +
          'Pricing and Availability → Availability, which is not exposed by this API key.',
      );
    }
    break;
  }

  case 'submit': {
    const versionString = typeof args.version === 'string' ? args.version : appVersion();
    let buildNumber = args['build-number'];
    if (!buildNumber || buildNumber === true) {
      // The build `beta` already put in front of TestFlight testers.
      buildNumber = await latestBuildForVersion(request, { ascAppId, versionString });
      if (!buildNumber) {
        console.error(
          `No processed build of ${versionString} in App Store Connect. It reaches TestFlight when\n` +
            'that version merges to beta; or build one with mobile-release (platform=ios).',
        );
        process.exit(1);
      }
      console.log(`Using build ${buildNumber}, the newest ${versionString} build in TestFlight.`);
    }
    const notes =
      typeof args.notes === 'string'
        ? args.notes
        : extractReleaseNotes(readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf8'), versionString);

    console.log(`\nSubmitting ${versionString} (build ${buildNumber}) for App Store review.`);
    console.log(`\nRelease notes (es-ES):\n${'─'.repeat(60)}\n${notes}\n${'─'.repeat(60)}`);
    requireApply('submit it to Apple');

    const result = await submitIosForReview({
      request,
      ascAppId,
      versionString,
      buildNumber,
      notes,
      releaseType: args['release-type'] === 'MANUAL' ? 'MANUAL' : 'AFTER_APPROVAL',
      phased: args.phased !== 'false',
      log,
    });
    console.log(`\n${result.status}: ${JSON.stringify(result)}`);
    break;
  }

  case 'release': {
    const versionString = typeof args.version === 'string' ? args.version : null;
    const result = await releaseVersion(request, {
      ascAppId,
      versionString,
      apply,
      log,
    });
    console.log(`\n${result.status}: ${result.message ?? result.target?.versionString ?? ''}`);
    if (result.status === 'dry-run') {
      console.log('Re-run with --apply to release it.');
      process.exit(0);
    }
    if (result.status === 'not-found') process.exit(1);
    break;
  }

  case 'set-release-type': {
    const releaseType = typeof args['release-type'] === 'string' ? args['release-type'] : 'AFTER_APPROVAL';
    const versions = await listVersions(request, { ascAppId });
    const editable = versions.filter(
      (v) => v.releaseType && v.releaseType !== releaseType && v.appStoreState !== 'READY_FOR_SALE',
    );
    if (!editable.length) {
      console.log(`Every version already has releaseType=${releaseType} (or is already out).`);
      break;
    }
    console.log(`Would set releaseType=${releaseType} on: ${editable.map((v) => v.versionString).join(', ')}`);
    requireApply('change it');
    for (const v of editable) {
      await setReleaseType(request, { versionId: v.id, releaseType });
      console.log(`  ${v.versionString} → ${releaseType}`);
    }
    break;
  }

  case 'phased': {
    const state = typeof args.state === 'string' ? args.state.toUpperCase() : null;
    if (!PHASED_STATES.includes(state)) {
      console.error(`phased needs --state=${PHASED_STATES.join('|').toLowerCase()}`);
      process.exit(1);
    }
    const versions = await listVersions(request, { ascAppId });
    const live = versions.find((v) => v.appStoreState === 'READY_FOR_SALE') ?? versions[0];
    if (!live) {
      console.error('no version to act on');
      process.exit(1);
    }
    const existing = await request('GET', `/appStoreVersions/${live.id}/appStoreVersionPhasedRelease`);
    const phasedReleaseId = existing?.data?.id;
    if (!phasedReleaseId) {
      console.error(`${live.versionString} has no phased release to ${state.toLowerCase()}.`);
      process.exit(1);
    }
    console.log(`Would set ${live.versionString} phased release → ${state}`);
    requireApply('change it');
    // COMPLETE means "give it to everyone now"; the API spells the states
    // differently from the verbs, so map at the edge.
    const apiState = { PAUSE: 'PAUSED', RESUME: 'ACTIVE', COMPLETE: 'COMPLETE' }[state];
    await setPhasedReleaseState(request, { phasedReleaseId, state: apiState });
    console.log(`${live.versionString} phased release is now ${apiState}`);
    break;
  }

  case 'testflight': {
    const groups = await listBetaGroups(request, { ascAppId });
    console.log('\nTestFlight groups\n');
    for (const g of groups) {
      // Counts only: Actions logs of this public repo are public, and tester
      // emails must not land in them.
      const testers = await request('GET', `/betaGroups/${g.id}/betaTesters?limit=200`);
      console.log(
        `  ${String(g.attributes?.name).padEnd(28)} ${g.attributes?.isInternalGroup ? 'internal' : 'external'} ` +
          `${String((testers.data || []).length).padStart(3)} testers` +
          `${g.attributes?.hasAccessToAllBuilds ? '  (automatic: gets every build)' : ''}`,
      );
    }
    const buildNumber = args['build-number'];
    if (!buildNumber || buildNumber === true) break;

    const beta = await getBuildBetaState(request, { ascAppId, buildNumber });
    console.log(`\nBuild ${buildNumber}: internal=${beta.internal} external=${beta.external}`);

    const selector = typeof args.groups === 'string' ? args.groups : 'internal';
    console.log(`\nDistributing build ${buildNumber} to: ${selector}`);
    const betaReviewNotes = args['beta-review']
      ? extractReleaseNotes(readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf8'), appVersion())
      : undefined;
    const result = await distributeToTestflight(request, {
      ascAppId,
      buildNumber,
      selector,
      apply,
      betaReviewNotes,
      log,
    });
    console.log(`\n${result.status}${result.betaReview ? ` (beta review: ${result.betaReview})` : ''}`);
    if (result.status === 'dry-run') {
      console.log('DRY RUN — nothing was sent to Apple. Re-run with --apply to distribute it.');
    }
    break;
  }

  default:
    console.error(
      `Unknown command "${command}". Use: status | submit | release | set-release-type | phased | testflight`,
    );
    process.exit(1);
}
