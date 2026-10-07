import { describe, it, expect } from 'vitest';
import {
  villageTitle,
  ambassadorTitleKey,
} from '../../../src/models/municipality/villageTitle';

describe('villageTitle', () => {
  it('names the organizer pointer the ambassador', () => {
    expect(villageTitle({ userId: 'u1', role: 'admin', organizerId: 'u1' })).toBe('ambassador');
  });

  it('names every other admin the village team', () => {
    expect(villageTitle({ userId: 'u2', role: 'admin', organizerId: 'u1' })).toBe('team');
    expect(villageTitle({ userId: 'u2', role: 'admin', organizerId: null })).toBe('team');
  });

  it('names a plain member a member', () => {
    expect(villageTitle({ userId: 'u2', role: 'user', organizerId: 'u1' })).toBe('member');
  });

  it('never grants the title to a non-admin, even if the pointer names them', () => {
    // The pointer grants no authority; a dangling pointer on a demoted user must
    // not surface a title they no longer hold.
    expect(villageTitle({ userId: 'u1', role: 'user', organizerId: 'u1' })).toBe('member');
  });
});

describe('ambassadorTitleKey', () => {
  it('is feminine for female', () => {
    expect(ambassadorTitleKey('female')).toBe('ambassador.titleFemale');
  });

  it('is masculine for male, other and unknown — Spanish has no neutral form', () => {
    expect(ambassadorTitleKey('male')).toBe('ambassador.title');
    expect(ambassadorTitleKey('other')).toBe('ambassador.title');
    expect(ambassadorTitleKey(null)).toBe('ambassador.title');
  });

  it('offers the in-village variant', () => {
    expect(ambassadorTitleKey('female', 'inVillage')).toBe('ambassador.inVillageFemale');
    expect(ambassadorTitleKey(null, 'inVillage')).toBe('ambassador.inVillage');
  });
});
