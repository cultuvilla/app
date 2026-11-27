// Test data builders for municipalities (the entity that hosts a village
// community). Pure factory: returns a MunicipalityData object; persisting it
// to the emulator is the test's responsibility.

import {
  buildMunicipalityData,
  buildVillageCommunity,
  type MunicipalityData,
} from '../../src/models/municipality/MunicipalityDataModel';

let counter = 0;
const nextId = () => ++counter;

export function makeMunicipality(
  overrides: Partial<MunicipalityData> = {},
): MunicipalityData {
  const n = nextId();
  const base = buildMunicipalityData({
    name: `Test Municipality ${String(n)}`,
    province: 'Salamanca',
    comunidadAutonoma: 'Castilla y León',
    codigoINE: `99${String(n).padStart(3, '0')}`,
    slug: `test-municipality-${String(n)}`,
    coordinates: { lat: 40.9, lng: -5.7 },
  });
  return { ...base, ...overrides };
}

export function makeActiveCommunity(
  overrides: Partial<MunicipalityData> = {},
): MunicipalityData {
  const base = makeMunicipality();
  return {
    ...base,
    community: buildVillageCommunity({
      description: 'Test community',
      organizerId: 'test-admin',
    }),
    communityActive: true,
    ...overrides,
  };
}
