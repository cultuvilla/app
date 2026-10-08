import { describe, it, expect } from 'vitest';
import { AmbassadorLeadDataSchema, buildAmbassadorLeadData, normalizeLeadPhone } from '../../src/models/ambassadorLead';

describe('normalizeLeadPhone', () => {
  it.each([
    ['612 345 678', '+34612345678'],
    ['612-34-56-78', '+34612345678'],
    ['(91) 234 56 78', '+34912345678'],
    ['+34 612 345 678', '+34612345678'],
    ['0034612345678', '+34612345678'],
    ['+33 6 12 34 56 78', '+33612345678'],
  ])('reads %s as %s', (raw, e164) => {
    expect(normalizeLeadPhone(raw)).toBe(e164);
  });

  it.each(['', '123', '512345678', '61234567', 'seis uno dos', '+1234567', '+1234567890123456'])('rejects %j', (raw) => {
    expect(normalizeLeadPhone(raw)).toBeNull();
  });
});

describe('buildAmbassadorLeadData', () => {
  it('starts every lead as new, in the stored shape', () => {
    const data = buildAmbassadorLeadData({
      municipalityId: null,
      municipalityName: 'Villanueva',
      name: 'Ana',
      phone: '+34612345678',
      createdAt: new Date('2026-10-08T10:00:00Z'),
    });
    expect(data.status).toBe('new');
    expect(AmbassadorLeadDataSchema.parse(data)).toEqual(data);
  });
});
