import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { meta, municipalityIdsPatch } from '../backfill-org-municipality-ids.mjs';

describe('backfill-org-municipality-ids', () => {
  it('runs unattended before the deploy, on every env', () => {
    assert.equal(meta.phase, 'pre-deploy');
    assert.equal(meta.idempotent, true);
    assert.deepEqual(meta.autoApply, ['dev', 'beta', 'prod']);
  });

  it('lists a group without the field in its home pueblo', () => {
    assert.deepEqual(municipalityIdsPatch({ municipalityId: 'm1' }), { municipalityIds: ['m1'] });
    assert.deepEqual(municipalityIdsPatch({ municipalityId: 'm1', municipalityIds: [] }), { municipalityIds: ['m1'] });
  });

  it('keeps the other pueblos when the home is missing', () => {
    assert.deepEqual(municipalityIdsPatch({ municipalityId: 'm1', municipalityIds: ['m2'] }), {
      municipalityIds: ['m1', 'm2'],
    });
  });

  it('leaves a group that already lists its home', () => {
    assert.equal(municipalityIdsPatch({ municipalityId: 'm1', municipalityIds: ['m2', 'm1'] }), null);
  });

  it('skips a doc without a home', () => {
    assert.equal(municipalityIdsPatch({}), null);
  });
});
