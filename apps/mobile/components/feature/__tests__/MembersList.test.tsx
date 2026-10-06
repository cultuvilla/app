import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { MembersList } from '../MembersList';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

const mockGetVillageMembers = jest.fn();
const mockSetVillageMemberRole = jest.fn();
const mockTransferVillageAmbassador = jest.fn();
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  getVillageMembers: (...a: unknown[]) => mockGetVillageMembers(...a),
  setVillageMemberRole: (...a: unknown[]) => mockSetVillageMemberRole(...a),
  transferVillageAmbassador: (...a: unknown[]) => mockTransferVillageAmbassador(...a),
}));

const mockGetMunicipalityPeople = jest.fn();
jest.mock('@cultuvilla/shared/services/municipalityPersonService', () => ({
  getMunicipalityPeople: (...a: unknown[]) => mockGetMunicipalityPeople(...a),
}));

const mockGetMunicipality = jest.fn();
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getMunicipality: (...a: unknown[]) => mockGetMunicipality(...a),
}));

const mockShowConfirm = jest.fn();
jest.mock('../../../lib/dialogs', () => ({
  showConfirm: (_title: string, _message: string, onConfirm: () => void) => {
    mockShowConfirm();
    onConfirm();
  },
  showAlert: jest.fn(),
}));

jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ t: (key: string) => ({
    'village.membersList.colName': 'Nombre',
    'village.membersList.colCenso': 'Censo',
    'village.membersList.censoComplete': 'Censo completo',
    'village.membersList.censoPending': 'Censo pendiente',
    'village.membersList.empty': 'Aún no hay personas registradas.',
    'ambassador.title': 'Embajador',
    'ambassador.titleFemale': 'Embajadora',
    'ambassador.team': 'Equipo del pueblo',
  }[key] ?? key) }),
}));

const people = [
  { id: 'm1_p1', personId: 'p1', municipalityId: 'm1', displayName: 'Álvaro Vecino', sortName: 'alvaro vecino', photoURL: null, userId: 'user1', isPublic: true, barrioId: null },
  { id: 'm1_p2', personId: 'p2', municipalityId: 'm1', displayName: 'Bea A Cargo', sortName: 'bea a cargo', photoURL: null, userId: null, isPublic: true, barrioId: null },
];

beforeEach(() => {
  mockGetVillageMembers.mockReset();
  mockGetMunicipalityPeople.mockReset();
  mockGetMunicipality.mockReset();
  mockSetVillageMemberRole.mockReset();
  mockShowConfirm.mockReset();
  mockPush.mockReset();
  mockGetMunicipalityPeople.mockResolvedValue(people);
  mockGetVillageMembers.mockResolvedValue([
    { userId: 'user1', role: 'user', profileCompletedAt: null },
  ]);
  mockGetMunicipality.mockResolvedValue({ id: 'm1', community: { organizerId: null, profileForm: null } });
  mockSetVillageMemberRole.mockResolvedValue(undefined);
  mockTransferVillageAmbassador.mockReset();
  mockTransferVillageAmbassador.mockResolvedValue(undefined);
});

test('renders account and dependent personas in the directory order', async () => {
  render(<MembersList villageId="m1" />);

  await waitFor(() => expect(screen.getByText('Álvaro Vecino')).toBeTruthy());
  expect(screen.getByText('Bea A Cargo')).toBeTruthy();
  expect(screen.getAllByTestId('member-name').map((node) => node.props.children))
    .toEqual(['Álvaro Vecino', 'Bea A Cargo']);
  expect(mockGetMunicipalityPeople).toHaveBeenCalledWith('m1');
});

test('shows censo only for account-linked people when configured', async () => {
  mockGetMunicipality.mockResolvedValue({
    id: 'm1',
    community: { organizerId: null, profileForm: { fields: [{ key: 'age' }] } },
  });
  mockGetVillageMembers.mockResolvedValue([
    { userId: 'user1', role: 'user', profileCompletedAt: new Date() },
  ]);

  render(<MembersList villageId="m1" />);

  await waitFor(() => expect(screen.getByLabelText('Censo completo')).toBeTruthy());
  expect(screen.queryByLabelText('Censo pendiente')).toBeNull();
});

test('only an account member is actionable for an admin', async () => {
  render(<MembersList villageId="m1" canManage currentUserId="admin" />);

  await waitFor(() => expect(screen.getByTestId('member-row-user1')).toBeTruthy());
  expect(screen.queryByTestId('member-row-')).toBeNull();
  fireEvent.press(screen.getByTestId('member-row-user1'));
  fireEvent.press(screen.getByTestId('member-action-team'));
  expect(mockSetVillageMemberRole).toHaveBeenCalledWith('m1', 'user1', 'admin');
});

const ambassadorPeople = [
  { id: 'm1_pa', personId: 'pa', municipalityId: 'm1', displayName: 'Ana Embajadora', sortName: 'ana', photoURL: null, userId: 'amb', isPublic: true, barrioId: null },
  { id: 'm1_pt', personId: 'pt', municipalityId: 'm1', displayName: 'Tomás Equipo', sortName: 'tomas', photoURL: null, userId: 'team', isPublic: true, barrioId: null },
  { id: 'm1_pv', personId: 'pv', municipalityId: 'm1', displayName: 'Vera Vecina', sortName: 'vera', photoURL: null, userId: 'vec', isPublic: true, barrioId: null },
];

function seedAmbassadorVillage() {
  mockGetMunicipalityPeople.mockResolvedValue(ambassadorPeople);
  mockGetVillageMembers.mockResolvedValue([
    { userId: 'amb', role: 'admin', profileCompletedAt: null },
    { userId: 'team', role: 'admin', profileCompletedAt: null },
    { userId: 'vec', role: 'user', profileCompletedAt: null },
  ]);
  mockGetMunicipality.mockResolvedValue({
    id: 'm1',
    community: { organizerId: 'amb', organizerSex: 'female', profileForm: null },
  });
}

test('shows the Embajadora title, the team badge, and nothing for a vecino', async () => {
  seedAmbassadorVillage();
  render(<MembersList villageId="m1" />);

  await waitFor(() => expect(screen.getByText('Embajadora')).toBeTruthy());
  expect(screen.getByTestId('member-title-pt')).toBeTruthy();
  expect(screen.getByText('Equipo del pueblo')).toBeTruthy();
  expect(screen.queryByTestId('member-title-pv')).toBeNull();
});

test('stamps the Cultuvilla seal on the Embajador alone', async () => {
  seedAmbassadorVillage();
  render(<MembersList villageId="m1" />);

  await waitFor(() => expect(screen.getByText('Embajadora')).toBeTruthy());
  expect(screen.getAllByTestId('avatar-ambassador-seal')).toHaveLength(1);
});

test('the Embajador can hand the title to a member', async () => {
  seedAmbassadorVillage();
  render(<MembersList villageId="m1" canManage currentUserId="amb" />);

  await waitFor(() => expect(screen.getByTestId('member-row-vec')).toBeTruthy());
  // Their own row is never actionable.
  expect(screen.queryByTestId('member-row-amb')).toBeNull();
  fireEvent.press(screen.getByTestId('member-row-vec'));
  fireEvent.press(screen.getByTestId('member-action-transfer'));
  expect(mockTransferVillageAmbassador).toHaveBeenCalledWith('m1', 'vec');
});

test('a team admin manages the team but cannot move the title', async () => {
  seedAmbassadorVillage();
  render(<MembersList villageId="m1" canManage currentUserId="team" />);

  await waitFor(() => expect(screen.getByTestId('member-row-vec')).toBeTruthy());
  // The Embajador's row is not actionable for anyone.
  expect(screen.queryByTestId('member-row-amb')).toBeNull();
  fireEvent.press(screen.getByTestId('member-row-vec'));
  expect(screen.getByTestId('member-action-team')).toBeTruthy();
  expect(screen.queryByTestId('member-action-transfer')).toBeNull();
});

test('opens the linked user profile from the name or avatar area', async () => {
  render(<MembersList villageId="m1" />);
  await waitFor(() => expect(screen.getByTestId('person-profile-p1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('person-profile-p1'));
  expect(mockPush).toHaveBeenCalledWith('/usuario/user1');
});

test('opens a dependent persona profile when no user account is linked', async () => {
  render(<MembersList villageId="m1" />);
  await waitFor(() => expect(screen.getByTestId('person-profile-p2')).toBeTruthy());
  fireEvent.press(screen.getByTestId('person-profile-p2'));
  expect(mockPush).toHaveBeenCalledWith('/persona/p2');
});

// A private dependent stays in the census by name, but their card is
// unreadable to everyone but their creator, so the row must not navigate.
test('lists a private dependent persona but does not open it', async () => {
  mockGetMunicipalityPeople.mockResolvedValue([
    {
      id: 'm1_p3', personId: 'p3', municipalityId: 'm1', displayName: 'Carla Privada',
      sortName: 'carla privada', photoURL: null, userId: null, isPublic: false, barrioId: null,
    },
  ]);
  render(<MembersList villageId="m1" />);
  await waitFor(() => expect(screen.getByText('Carla Privada')).toBeTruthy());
  fireEvent.press(screen.getByTestId('person-profile-p3'));
  expect(mockPush).not.toHaveBeenCalled();
});

test('shows the people empty state', async () => {
  mockGetMunicipalityPeople.mockResolvedValue([]);
  render(<MembersList villageId="m1" />);
  await waitFor(() => expect(screen.getByText('Aún no hay personas registradas.')).toBeTruthy());
});
