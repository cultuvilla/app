import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { OrgMembersList } from '../OrgMembersList';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

/** Management controls only exist once the heading's "Editar" toggle is on. */
const enterEditMode = () => fireEvent.press(screen.getByTestId('org-members-edit-toggle'));

const mockGetOrgMembers = jest.fn();
const mockSetOrgMemberRole = jest.fn();
const mockRemoveOrgMember = jest.fn();
jest.mock('@cultuvilla/shared/services/orgMemberService', () => ({
  getOrgMembers: (...a: unknown[]) => mockGetOrgMembers(...a),
  setOrgMemberRole: (...a: unknown[]) => mockSetOrgMemberRole(...a),
  removeOrgMember: (...a: unknown[]) => mockRemoveOrgMember(...a),
}));

const mockGetPublicProfile = jest.fn();
jest.mock('@cultuvilla/shared/services/userService', () => ({
  getPublicProfile: (...a: unknown[]) => mockGetPublicProfile(...a),
}));

const mockGetPersonByUserId = jest.fn();
jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonByUserId: (...a: unknown[]) => mockGetPersonByUserId(...a),
}));

// showConfirm auto-accepts so we can assert the action fires on confirm.
const mockShowConfirm = jest.fn();
const mockShowAlert = jest.fn();
jest.mock('../../../lib/dialogs', () => ({
  showConfirm: (title: string, message: string, onConfirm: () => void) => {
    mockShowConfirm(title, message);
    onConfirm();
  },
  showAlert: (...a: unknown[]) => mockShowAlert(...a),
}));

// Real Spanish catalog so we can assert on the visible strings.
jest.mock('../../../lib/i18n', () => {
  const { getMessages } = jest.requireActual('@cultuvilla/i18n');
  const es = getMessages('es');
  const resolve = (k: string): unknown =>
    k.split('.').reduce<unknown>((o, seg) => (o == null ? undefined : (o as Record<string, unknown>)[seg]), es);
  return {
    useT: () => ({
      locale: 'es',
      t: (k: string, vars?: Record<string, string | number>) => {
        const tpl = resolve(k);
        if (typeof tpl !== 'string') return k;
        return vars ? tpl.replace(/\{(\w+)\}/g, (_: string, kk: string) => String(vars[kk] ?? `{${kk}}`)) : tpl;
      },
    }),
  };
});

beforeEach(() => {
  mockGetOrgMembers.mockReset();
  mockSetOrgMemberRole.mockReset();
  mockRemoveOrgMember.mockReset();
  mockGetPublicProfile.mockReset();
  mockGetPersonByUserId.mockReset();
  mockShowConfirm.mockReset();
  mockShowAlert.mockReset();
  mockPush.mockReset();
  mockGetPersonByUserId.mockResolvedValue(null);
  mockSetOrgMemberRole.mockResolvedValue(undefined);
  mockRemoveOrgMember.mockResolvedValue(undefined);
  mockGetPublicProfile.mockImplementation(async (uid: string) => {
    const names: Record<string, string> = {
      admin1: 'Ana Admin',
      admin2: 'Carlos Admin',
      user1: 'Bruno Vecino',
    };
    return names[uid] ? { displayName: names[uid] } : null;
  });
});

test('read-only viewer sees no management controls', async () => {
  mockGetOrgMembers.mockResolvedValue([
    { id: 'admin1', userId: 'admin1', role: 'admin', joinedAt: new Date('2026-01-01') },
    { id: 'user1', userId: 'user1', role: 'member', joinedAt: new Date('2026-02-01') },
  ]);

  render(<OrgMembersList orgId="o1" />);

  await waitFor(() => expect(screen.getByText('Ana Admin')).toBeTruthy());
  expect(screen.queryByTestId('org-members-edit-toggle')).toBeNull();
  expect(screen.queryByTestId('org-member-remove-user1')).toBeNull();
  expect(screen.queryByTestId('org-member-remove-admin1')).toBeNull();
});

test('an admin sees no row actions until edit mode is on', async () => {
  mockGetOrgMembers.mockResolvedValue([
    { id: 'admin1', userId: 'admin1', role: 'admin', joinedAt: new Date('2026-01-01') },
    { id: 'user1', userId: 'user1', role: 'member', joinedAt: new Date('2026-02-01') },
  ]);

  render(<OrgMembersList orgId="o1" canManage currentUserId="admin1" />);

  await waitFor(() => expect(screen.getByTestId('org-member-profile-user1')).toBeTruthy());
  expect(screen.queryByTestId('org-member-remove-user1')).toBeNull();
  expect(screen.queryByTestId('org-member-row-user1')).toBeNull();

  enterEditMode();
  expect(screen.getByTestId('org-member-remove-user1')).toBeTruthy();
  expect(screen.getByTestId('org-member-row-user1')).toBeTruthy();

  // Toggling back off hides them again.
  fireEvent.press(screen.getByTestId('org-members-edit-toggle'));
  expect(screen.queryByTestId('org-member-remove-user1')).toBeNull();
});

test('tapping a member opens their profile, in edit mode or out of it', async () => {
  mockGetOrgMembers.mockResolvedValue([
    { id: 'admin1', userId: 'admin1', role: 'admin', joinedAt: new Date('2026-01-01') },
    { id: 'user1', userId: 'user1', role: 'member', joinedAt: new Date('2026-02-01') },
  ]);

  render(<OrgMembersList orgId="o1" canManage currentUserId="admin1" />);

  await waitFor(() => expect(screen.getByTestId('org-member-profile-user1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('org-member-profile-user1'));
  expect(mockPush).toHaveBeenCalledWith('/usuario/user1');
  expect(mockSetOrgMemberRole).not.toHaveBeenCalled();

  enterEditMode();
  fireEvent.press(screen.getByTestId('org-member-profile-user1'));
  expect(mockPush).toHaveBeenCalledTimes(2);
});

test('a read-only viewer can still open a member profile', async () => {
  mockGetOrgMembers.mockResolvedValue([
    { id: 'user1', userId: 'user1', role: 'member', joinedAt: new Date('2026-02-01') },
  ]);

  render(<OrgMembersList orgId="o1" />);

  await waitFor(() => expect(screen.getByTestId('org-member-profile-user1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('org-member-profile-user1'));
  expect(mockPush).toHaveBeenCalledWith('/usuario/user1');
});

test('shows a member full name with the apodo in parentheses, not the apodo alone', async () => {
  mockGetOrgMembers.mockResolvedValue([
    { id: 'user1', userId: 'user1', role: 'member', joinedAt: new Date('2026-02-01') },
  ]);
  mockGetPersonByUserId.mockResolvedValue({
    givenName: 'Juan',
    middleNames: ['Carlos'],
    firstSurname: 'García',
    secondSurname: 'López',
    nickname: 'Juanito',
    photoURL: null,
  });

  render(<OrgMembersList orgId="o1" />);

  await waitFor(() => expect(screen.getByText('Juan Carlos García López (Juanito)')).toBeTruthy());
  expect(screen.queryByText('Juanito')).toBeNull();
});

test('an org admin can promote a member; the roster refetches afterwards', async () => {
  mockGetOrgMembers.mockResolvedValue([
    { id: 'admin1', userId: 'admin1', role: 'admin', joinedAt: new Date('2026-01-01') },
    { id: 'user1', userId: 'user1', role: 'member', joinedAt: new Date('2026-02-01') },
  ]);

  render(<OrgMembersList orgId="o1" canManage currentUserId="admin1" />);

  await waitFor(() => expect(screen.getByTestId('org-member-profile-user1')).toBeTruthy());
  enterEditMode();
  fireEvent.press(screen.getByTestId('org-member-row-user1'));

  expect(mockSetOrgMemberRole).toHaveBeenCalledWith('o1', 'user1', 'admin');
  await waitFor(() => expect(mockGetOrgMembers).toHaveBeenCalledTimes(2));
});

test('an org admin can demote another admin', async () => {
  mockGetOrgMembers.mockResolvedValue([
    { id: 'admin1', userId: 'admin1', role: 'admin', joinedAt: new Date('2026-01-01') },
    { id: 'admin2', userId: 'admin2', role: 'admin', joinedAt: new Date('2026-02-01') },
  ]);

  render(<OrgMembersList orgId="o1" canManage currentUserId="admin1" />);

  await waitFor(() => expect(screen.getByTestId('org-member-profile-admin2')).toBeTruthy());
  enterEditMode();
  fireEvent.press(screen.getByTestId('org-member-row-admin2'));

  expect(mockSetOrgMemberRole).toHaveBeenCalledWith('o1', 'admin2', 'member');
});

test('an org admin can remove another member', async () => {
  mockGetOrgMembers.mockResolvedValue([
    { id: 'admin1', userId: 'admin1', role: 'admin', joinedAt: new Date('2026-01-01') },
    { id: 'user1', userId: 'user1', role: 'member', joinedAt: new Date('2026-02-01') },
  ]);

  render(<OrgMembersList orgId="o1" canManage currentUserId="admin1" />);

  await waitFor(() => expect(screen.getByTestId('org-member-profile-user1')).toBeTruthy());
  enterEditMode();
  fireEvent.press(screen.getByTestId('org-member-remove-user1'));

  expect(mockRemoveOrgMember).toHaveBeenCalledWith('o1', 'user1');
  await waitFor(() => expect(mockGetOrgMembers).toHaveBeenCalledTimes(2));
});

test('an admin cannot change or remove their own row', async () => {
  mockGetOrgMembers.mockResolvedValue([
    { id: 'admin1', userId: 'admin1', role: 'admin', joinedAt: new Date('2026-01-01') },
    { id: 'user1', userId: 'user1', role: 'member', joinedAt: new Date('2026-02-01') },
  ]);

  render(<OrgMembersList orgId="o1" canManage currentUserId="admin1" />);

  await waitFor(() => expect(screen.getByTestId('org-member-profile-admin1')).toBeTruthy());
  enterEditMode();
  expect(screen.getByTestId('org-member-row-user1')).toBeTruthy();
  expect(screen.queryByTestId('org-member-remove-admin1')).toBeNull();
  expect(screen.queryByTestId('org-member-row-admin1')).toBeNull();
  expect(mockSetOrgMemberRole).not.toHaveBeenCalled();
});

test('surfaces an error if the role change fails', async () => {
  mockSetOrgMemberRole.mockRejectedValue(new Error('No autorizado.'));
  mockGetOrgMembers.mockResolvedValue([
    { id: 'admin1', userId: 'admin1', role: 'admin', joinedAt: new Date('2026-01-01') },
    { id: 'user1', userId: 'user1', role: 'member', joinedAt: new Date('2026-02-01') },
  ]);

  render(<OrgMembersList orgId="o1" canManage currentUserId="admin1" />);

  await waitFor(() => expect(screen.getByTestId('org-member-profile-user1')).toBeTruthy());
  enterEditMode();
  fireEvent.press(screen.getByTestId('org-member-row-user1'));

  await waitFor(() => expect(mockShowAlert).toHaveBeenCalledWith('No autorizado.'));
});

test('surfaces an error if removal fails', async () => {
  mockRemoveOrgMember.mockRejectedValue(new Error('No autorizado.'));
  mockGetOrgMembers.mockResolvedValue([
    { id: 'admin1', userId: 'admin1', role: 'admin', joinedAt: new Date('2026-01-01') },
    { id: 'user1', userId: 'user1', role: 'member', joinedAt: new Date('2026-02-01') },
  ]);

  render(<OrgMembersList orgId="o1" canManage currentUserId="admin1" />);

  await waitFor(() => expect(screen.getByTestId('org-member-profile-user1')).toBeTruthy());
  enterEditMode();
  fireEvent.press(screen.getByTestId('org-member-remove-user1'));

  await waitFor(() => expect(mockShowAlert).toHaveBeenCalledWith('No autorizado.'));
});

test('an org with no members renders nothing, not even the heading', async () => {
  mockGetOrgMembers.mockResolvedValue([]);

  const { toJSON } = render(<OrgMembersList orgId="o1" canManage currentUserId="admin1" />);

  await waitFor(() => expect(mockGetOrgMembers).toHaveBeenCalled());
  await waitFor(() => expect(toJSON()).toBeNull());
});

// A row action labelled only "Eliminar" or "Hacer administrador" did not say
// whose row it was, and on iOS it shared its label with the confirming
// alert's button, which sits over it (E2E flow 74 tapped the icon instead).
test('row actions name the member they act on', async () => {
  mockGetOrgMembers.mockResolvedValue([
    { id: 'admin1', userId: 'admin1', role: 'admin', joinedAt: new Date('2026-01-01') },
    { id: 'user1', userId: 'user1', role: 'member', joinedAt: new Date('2026-02-01') },
  ]);

  render(<OrgMembersList orgId="o1" canManage currentUserId="admin1" />);
  await waitFor(() => expect(screen.getByTestId('org-member-profile-user1')).toBeTruthy());
  enterEditMode();

  expect(screen.getByTestId('org-member-remove-user1').props.accessibilityLabel).toBe(
    'Eliminar a Bruno Vecino del grupo',
  );
  expect(screen.getByTestId('org-member-row-user1').props.accessibilityLabel).toBe(
    'Hacer administrador a Bruno Vecino',
  );
});
