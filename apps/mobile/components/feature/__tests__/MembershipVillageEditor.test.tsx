import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { MembershipVillageEditor } from '../MembershipVillageEditor';

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
// eslint-disable-next-line prefer-const -- reassigned per-test to vary the active village.
let mockActiveMunicipalityId = 'm1';
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ profile: { activeMunicipalityId: mockActiveMunicipalityId } }),
}));

// babel-plugin-jest-hoist only allows out-of-scope references from `jest.mock`
// factories for identifiers prefixed with "mock" (case-insensitive) — see
// VillageDiscovery.test.tsx for the established pattern in this repo.
const mockGetUserMemberships = jest.fn();
const mockLeaveVillage = jest.fn().mockResolvedValue(undefined);
const mockEnsureVillageMembership = jest.fn().mockResolvedValue(undefined);
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  getUserMemberships: (...a: unknown[]) => mockGetUserMemberships(...a),
  leaveVillage: (...a: unknown[]) => mockLeaveVillage(...a),
  ensureVillageMembership: (...a: unknown[]) => mockEnsureVillageMembership(...a),
}));
const mockGetPersonByUserId = jest.fn();
const mockUpdateResidenceBarrio = jest.fn().mockResolvedValue(undefined);
jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonByUserId: (...a: unknown[]) => mockGetPersonByUserId(...a),
  updateResidenceBarrio: (...a: unknown[]) => mockUpdateResidenceBarrio(...a),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getMunicipality: jest.fn().mockResolvedValue({ name: 'Villa Uno' }),
  getBarrios: jest.fn().mockResolvedValue([]),
  searchMunicipalities: jest.fn().mockResolvedValue([]),
}));
const mockSetActiveMunicipality = jest.fn().mockResolvedValue(undefined);
jest.mock('@cultuvilla/shared/services/userService', () => ({
  setActiveMunicipality: (...a: unknown[]) => mockSetActiveMunicipality(...a),
}));
jest.mock('@cultuvilla/shared/models/municipality', () => ({ escudoThumbDisplayUrl: () => null }));

beforeEach(() => {
  mockGetUserMemberships.mockReset();
  mockGetPersonByUserId.mockReset();
  mockLeaveVillage.mockClear();
  mockSetActiveMunicipality.mockClear();
  mockActiveMunicipalityId = 'm1';
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  });
});

it('renders one leave button per joined village', async () => {
  mockGetUserMemberships.mockResolvedValue([{ municipalityId: 'm1', role: 'user', joinedAt: new Date(), profileCompletedAt: null }]);
  mockGetPersonByUserId.mockResolvedValue({ municipalityLinks: [{ municipalityId: 'm1', barrioId: null }] });
  const { getAllByLabelText } = render(<MembershipVillageEditor userId="u1" />);
  await waitFor(() => expect(getAllByLabelText('profile.personForm.removeVillage')).toHaveLength(1));
});

it('leaves the village and reassigns active on confirm', async () => {
  mockGetUserMemberships.mockResolvedValue([
    { municipalityId: 'm1', role: 'user', joinedAt: new Date(), profileCompletedAt: null },
    { municipalityId: 'm2', role: 'user', joinedAt: new Date(), profileCompletedAt: null },
  ]);
  mockGetPersonByUserId.mockResolvedValue({ municipalityLinks: [] });
  const { getAllByLabelText } = render(<MembershipVillageEditor userId="u1" />);
  await waitFor(() => expect(getAllByLabelText('profile.personForm.removeVillage').length).toBe(2));
  fireEvent.press(getAllByLabelText('profile.personForm.removeVillage')[0]!);
  await waitFor(() => expect(mockLeaveVillage).toHaveBeenCalledWith('m1', 'u1'));
  // m1 was active → reassign to the remaining membership.
  await waitFor(() => expect(mockSetActiveMunicipality).toHaveBeenCalledWith('u1', 'm2'));
});

it('shows a barrio control for every village, even one with no approved barrios', async () => {
  // getBarrios is mocked to resolve [] for every village. The barrio control
  // must still render per row so the user can set/change a barrio for any of
  // their villages — not vanish for barrio-less villages (regression guard).
  mockGetUserMemberships.mockResolvedValue([
    { municipalityId: 'm1', role: 'user', joinedAt: new Date(), profileCompletedAt: null },
    { municipalityId: 'm2', role: 'user', joinedAt: new Date(), profileCompletedAt: null },
  ]);
  mockGetPersonByUserId.mockResolvedValue({ municipalityLinks: [] });
  const { getAllByText } = render(<MembershipVillageEditor userId="u1" />);
  await waitFor(() => expect(getAllByText('profile.personForm.barrio')).toHaveLength(2));
});

it('leaves a non-active village without reassigning active', async () => {
  mockActiveMunicipalityId = 'm2';
  mockGetUserMemberships.mockResolvedValue([
    { municipalityId: 'm1', role: 'user', joinedAt: new Date(), profileCompletedAt: null },
    { municipalityId: 'm2', role: 'user', joinedAt: new Date(), profileCompletedAt: null },
  ]);
  mockGetPersonByUserId.mockResolvedValue({ municipalityLinks: [] });
  const { getAllByLabelText } = render(<MembershipVillageEditor userId="u1" />);
  await waitFor(() => expect(getAllByLabelText('profile.personForm.removeVillage').length).toBe(2));
  fireEvent.press(getAllByLabelText('profile.personForm.removeVillage')[0]!);
  await waitFor(() => expect(mockLeaveVillage).toHaveBeenCalledWith('m1', 'u1'));
  expect(mockSetActiveMunicipality).not.toHaveBeenCalled();
});
