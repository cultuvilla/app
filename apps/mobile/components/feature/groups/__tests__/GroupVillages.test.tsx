import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import {
  cancelOrgPresenceRequest,
  removeOrgPresence,
  requestOrgPresence,
} from '@cultuvilla/shared/services/orgPresenceService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { GroupVillagesSettings } from '../GroupVillagesSettings';
import { GroupSettings } from '../GroupSettings';
import { OrgVillagesRow } from '../../OrgVillagesRow';
import { VillageOrgCard } from '../../VillageOrgCard';

jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k),
  }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@cultuvilla/shared/services/municipalityService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule');
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return fakeService<typeof import('@cultuvilla/shared/services/municipalityService')>(
    '@cultuvilla/shared/services/municipalityService',
    () => ({ watchMunicipalitiesByIds: mockWatcher('villages') }),
  );
});
jest.mock('@cultuvilla/shared/services/orgPresenceService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule');
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return fakeService<typeof import('@cultuvilla/shared/services/orgPresenceService')>(
    '@cultuvilla/shared/services/orgPresenceService',
    () => ({
      requestOrgPresence: async () => undefined,
      cancelOrgPresenceRequest: async () => undefined,
      removeOrgPresence: async () => undefined,
      watchOrgPresenceRequests: mockWatcher('presence'),
    }),
  );
});
jest.mock('@cultuvilla/shared/services/organizationService');
jest.mock('@cultuvilla/shared/services/cuotaService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule');
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return fakeService<typeof import('@cultuvilla/shared/services/cuotaService')>('@cultuvilla/shared/services/cuotaService', () => ({
    watchCuotaSettings: mockWatcher('cuota'),
  }));
});
// The pueblo search is its own screen; picking «m9» is all these tests need of it.
jest.mock('../../../primitives/VillagePicker', () => ({
  VillagePicker: ({ trigger, onChange }: { trigger: (open: () => void) => unknown; onChange: (id: string) => void }) =>
    trigger(() => onChange('m9')),
}));

const VILLAGES = [
  { id: 'home', name: 'Villarino', slug: 'villarino' },
  { id: 'm2', name: 'Pereña', slug: 'perena' },
  { id: 'm3', name: 'Cabeza', slug: 'cabeza' },
];
const ORG = { id: 'o1', name: 'Asociación Comarcal', municipalityId: 'home', municipalityIds: ['home', 'm2'] };

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
  setWatched('villages', VILLAGES);
  setWatched('presence', [{ orgId: 'o1', municipalityId: 'm3', homeMunicipalityId: 'home', orgName: 'x', requestedBy: 'u1', createdAt: new Date() }]);
  setWatched('cuota', null);
});

describe('GroupVillagesSettings', () => {
  it('lists the pueblos the group is in and the ones still to answer', () => {
    const r = render(<GroupVillagesSettings org={ORG} uid="u1" />);
    expect(r.getByTestId('group-settings-villages-list')).toBeTruthy();
    expect(r.getByTestId('group-village-m2')).toBeTruthy();
    expect(r.getByTestId('group-village-pending-m3')).toBeTruthy();
    expect(r.getByText('organization.villages.settingsHint:Villarino')).toBeTruthy();
    // The home is never offered for leaving.
    expect(r.queryByTestId('group-village-leave-home')).toBeNull();
  });

  it('leaves a pueblo only after confirming', () => {
    const alert = jest.spyOn(Alert, 'alert');
    const r = render(<GroupVillagesSettings org={ORG} uid="u1" />);
    fireEvent.press(r.getByTestId('group-village-leave-m2'));
    expect(removeOrgPresence).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((b) => b.text === 'organization.villages.leave')?.onPress?.();
    expect(removeOrgPresence).toHaveBeenCalledWith('o1', 'm2');
  });

  it('withdraws a pending request', () => {
    const r = render(<GroupVillagesSettings org={ORG} uid="u1" />);
    fireEvent.press(r.getByTestId('group-village-cancel-m3'));
    expect(cancelOrgPresenceRequest).toHaveBeenCalledWith('o1', 'm3');
  });

  it('asks a pueblo that has a community', async () => {
    jest.mocked(getMunicipality).mockResolvedValue({ id: 'm9', name: 'Ledesma', communityActive: true } as never);
    const r = render(<GroupVillagesSettings org={ORG} uid="u1" />);
    fireEvent.press(r.getByTestId('group-village-add'));
    await waitFor(() =>
      expect(requestOrgPresence).toHaveBeenCalledWith({
        orgId: 'o1',
        orgName: 'Asociación Comarcal',
        homeMunicipalityId: 'home',
        municipalityId: 'm9',
        requestedBy: 'u1',
      }),
    );
  });

  it('explains instead of asking a pueblo with no Equipo to answer', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.mocked(getMunicipality).mockResolvedValue({ id: 'm9', name: 'Ledesma', communityActive: false } as never);
    const r = render(<GroupVillagesSettings org={ORG} uid="u1" />);
    fireEvent.press(r.getByTestId('group-village-add'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('organization.villages.notActive:Ledesma'));
    expect(requestOrgPresence).not.toHaveBeenCalled();
  });
});

describe('GroupSettings', () => {
  it('shows the Pueblos section only for a group that may be in several', () => {
    const peña = render(<GroupSettings orgId="o1" uid="u1" sociosListVisible villages={ORG} />);
    expect(peña.getByTestId('group-settings-villages')).toBeTruthy();
    peña.unmount();
    const ayuntamiento = render(<GroupSettings orgId="o1" uid="u1" sociosListVisible isAyuntamiento />);
    expect(ayuntamiento.queryByTestId('group-settings-villages')).toBeNull();
  });
});

describe('OrgVillagesRow', () => {
  it('names the home and links every other pueblo', () => {
    const r = render(<OrgVillagesRow org={ORG} />);
    expect(r.getByTestId('org-villages-row')).toBeTruthy();
    fireEvent.press(r.getByTestId('org-villages-home'));
    expect(router.push).toHaveBeenCalledWith('/villarino');
    fireEvent.press(r.getByTestId('org-villages-m2'));
    expect(router.push).toHaveBeenCalledWith('/perena');
  });

  it('says nothing for a group in its home alone', () => {
    const r = render(<OrgVillagesRow org={{ municipalityId: 'home', municipalityIds: ['home'] }} />);
    expect(r.queryByTestId('org-villages-row')).toBeNull();
  });
});

describe('VillageOrgCard', () => {
  const org = {
    ...ORG,
    villageSlug: 'villarino',
    images: [],
    commentCount: 0,
    memberCount: 3,
  } as never;

  it("says where a visiting group is from and opens it under its home", () => {
    const r = render(<VillageOrgCard org={org} villageId="m2" villageSlug="perena" sub="3 integrantes" icon="business-outline" />);
    expect(r.getByText('organization.villages.from:Villarino')).toBeTruthy();
    fireEvent.press(r.getByText('Asociación Comarcal'));
    expect(jest.mocked(router.push).mock.calls[0]?.[0]).toMatch(/^\/villarino\/entidad\//);
  });

  it('shows its own line at home', () => {
    const r = render(<VillageOrgCard org={org} villageId="home" villageSlug="villarino" sub="3 integrantes" icon="business-outline" />);
    expect(r.getByText('3 integrantes')).toBeTruthy();
  });
});
