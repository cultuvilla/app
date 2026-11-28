#!/usr/bin/env node
/**
 * The second pass of `org-municipality-ids`, after Cloud Functions deploy.
 *
 * The pre-deploy pass runs while the old `approveOrganization` is still live, and
 * that one approves a group without writing `municipalityIds`: a group approved
 * in between would be missing from its own pueblo's list until this runs. Same
 * patch, same idempotence. See docs/decisions/multi-village-groups.md.
 *
 *   node scripts/backfill-org-municipality-ids-after-deploy.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { run } from './backfill-org-municipality-ids.mjs';

export const meta = {
  id: 'org-municipality-ids-after-deploy',
  kind: 'backfill',
  description: 'Re-list in its home pueblo any organization approved while the deploy ran',
  phase: 'post-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['beta', 'prod'],
  dependsOn: ['org-municipality-ids'],
};

export { run };

if (isMain(import.meta.url)) await runBackfill({ meta, run });
