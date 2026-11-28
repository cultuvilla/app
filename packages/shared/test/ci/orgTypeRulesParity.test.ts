// firestore.rules and one backfill restate the organization types by hand.
// Each list must equal the TS constant it copies, so adding or removing a type
// fails here until every copy moves with it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OrganizationTypeSchema,
  PROPOSABLE_ORGANIZATION_TYPES,
} from '../../src/models/organization/OrganizationDataModel';
import { SOCIO_ROSTER_ORG_TYPES } from '../../src/models/organization/SocioDataModel';

const repo = resolve(__dirname, '../../../..');
const rules = readFileSync(resolve(repo, 'firestore.rules'), 'utf8');
const backfill = readFileSync(resolve(repo, 'scripts/backfill-socio-roster.mjs'), 'utf8');

function quotedList(src: string): string[] {
  return [...src.matchAll(/'([^']*)'/g)].map((m) => m[1]).sort();
}

function capture(re: RegExp, src: string, what: string): string {
  const m = re.exec(src);
  if (!m) throw new Error(`${what} not found`);
  return m[1];
}

/** The sorted quoted list of the nth `<lhs> in [...]` after `from`. */
function listAfter(src: string, from: string, lhs: string, nth = 0): string[] {
  const at = src.indexOf(from);
  if (at < 0) throw new Error(`${from} not found`);
  const re = new RegExp(`(?<![.\\w])${lhs.replace(/[.$()]/g, '\\$&')}\\s*in\\s*\\[([^\\]]*)\\]`, 'g');
  const matches = [...src.slice(at).matchAll(re)];
  if (matches.length <= nth) throw new Error(`${lhs} in [...] not found after ${from}`);
  return quotedList(matches[nth][1]);
}

const sorted = (xs: readonly string[]) => [...xs].sort();

describe('organization types: firestore.rules matches the model', () => {
  it('isValidOrganizationCreate accepts exactly OrganizationTypeSchema', () => {
    expect(listAfter(rules, 'function isValidOrganizationCreate', 'd.type')).toEqual(
      sorted(OrganizationTypeSchema.options),
    );
  });

  it('orgHasSocioRoster names exactly SOCIO_ROSTER_ORG_TYPES', () => {
    const body = rules.slice(rules.indexOf('function orgHasSocioRoster'));
    const list = capture(/\.data\.type\s*in\s*\[([^\]]*)\]/, body, 'orgHasSocioRoster list');
    expect(quotedList(list)).toEqual(sorted(SOCIO_ROSTER_ORG_TYPES));
  });

  it('an org update moves type only among PROPOSABLE_ORGANIZATION_TYPES', () => {
    const update = rules.slice(rules.indexOf('match /organizations/{orgId}'));
    expect(listAfter(update, 'allow update', 'resource.data.type')).toEqual(sorted(PROPOSABLE_ORGANIZATION_TYPES));
    expect(listAfter(update, 'allow update', 'request.resource.data.type')).toEqual(
      sorted(PROPOSABLE_ORGANIZATION_TYPES),
    );
  });
});

describe('organization types: backfill-socio-roster matches the model', () => {
  it('ROSTER_ORG_TYPES equals SOCIO_ROSTER_ORG_TYPES', () => {
    const list = capture(/const ROSTER_ORG_TYPES = new Set\(\[([^\]]*)\]\)/, backfill, 'ROSTER_ORG_TYPES');
    expect(quotedList(list)).toEqual(sorted(SOCIO_ROSTER_ORG_TYPES));
  });
});
