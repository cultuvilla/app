import { describe, it, expect, vi, beforeEach } from 'vitest';

const callable = vi.fn((input: unknown) => Promise.resolve({ data: { echo: input } }));
vi.mock('../../src/firebase', () => ({ getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callable) }));

import { httpsCallable } from 'firebase/functions';
import {
  fetchTransparentAvisos,
  fetchTransparentCuota,
  fetchTransparentCuotaIncome,
} from '../../src/services/groupTransparencyService';
import { GetGroupTransparencyInputSchema, publicCuotaStatus } from '../../src/models/organization/GroupTransparencyModel';
import { buildOrganizationData, OrganizationDataSchema } from '../../src/models/organization/OrganizationDataModel';

beforeEach(() => vi.clearAllMocks());

describe('groupTransparencyService', () => {
  it('asks getGroupTransparency for one view at a time', async () => {
    await fetchTransparentCuota('o1');
    await fetchTransparentAvisos('o1');
    await fetchTransparentCuotaIncome('o1', '2026');
    expect(httpsCallable).toHaveBeenCalledWith({}, 'getGroupTransparency');
    expect(callable.mock.calls.map((c) => c[0])).toEqual([
      { orgId: 'o1', view: 'cuota' },
      { orgId: 'o1', view: 'avisos' },
      { orgId: 'o1', view: 'cuentas', year: '2026' },
    ]);
    for (const [input] of callable.mock.calls) expect(GetGroupTransparencyInputSchema.safeParse(input).success).toBe(true);
  });
});

describe('GroupTransparencyModel', () => {
  it('tells the other socios only al día or pendiente', () => {
    expect(publicCuotaStatus('al_dia')).toBe('al_dia');
    expect(publicCuotaStatus('pendiente')).toBe('pendiente');
    expect(publicCuotaStatus('vencida')).toBe('pendiente');
  });

  it('starts every group with everything private, and reads an older doc the same way', () => {
    const off = { cuota: false, avisos: false, cuentas: false };
    const built = buildOrganizationData({ name: 'P', type: 'peña', municipalityId: 'm', villageSlug: 'v', requestedBy: 'u' });
    expect(built.transparency).toEqual(off);
    const { transparency: _t, ...older } = built;
    expect(OrganizationDataSchema.parse(older).transparency).toEqual(off);
  });

  it('refuses a cuentas read without a year', () => {
    expect(GetGroupTransparencyInputSchema.safeParse({ orgId: 'o1', view: 'cuentas' }).success).toBe(false);
    expect(GetGroupTransparencyInputSchema.safeParse({ orgId: 'o1', view: 'contactos' }).success).toBe(false);
  });
});
