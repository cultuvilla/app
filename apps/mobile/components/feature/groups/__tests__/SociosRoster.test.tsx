import { Alert } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { buildSocioData, type SocioDataInput } from '@cultuvilla/shared/models/organization';
import {
  addTypedSocio,
  linkSocioToMember,
  setSocioAdminTitle,
  setSocioBaja,
  setSocioNumber,
  updateTypedSocio,
} from '@cultuvilla/shared/services/socioService';
import { updateOrganization } from '@cultuvilla/shared/services/organizationService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { SociosRoster } from '../SociosRoster';
import { GroupSettings } from '../GroupSettings';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (k: string, v?: Record<string, unknown>) => (v?.name ? `${k}:${String(v.name)}` : k) }),
}));
jest.mock('@cultuvilla/shared/services/socioService', () => ({
  watchOrgSocios: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('socios'),
  watchOrgSocioPrivates: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('privates'),
  addTypedSocio: jest.fn().mockResolvedValue('new'),
  updateTypedSocio: jest.fn().mockResolvedValue(undefined),
  linkSocioToMember: jest.fn().mockResolvedValue(undefined),
  setSocioAdminTitle: jest.fn().mockResolvedValue(undefined),
  setSocioBaja: jest.fn().mockResolvedValue(undefined),
  setSocioNumber: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  updateOrganization: jest.fn().mockResolvedValue(undefined),
}));

function socio(id: string, input: Partial<SocioDataInput> & { bajaAt?: Date | null }) {
  const { bajaAt = null, ...rest } = input;
  return { id, ...buildSocioData({ kind: 'member', displayName: id, createdBy: 'x', ...rest }), bajaAt };
}

const ROWS = [
  socio('Ana', { uid: 'u-ana' }),
  socio('Tesorera', { uid: 'u-admin', adminTitle: 'tesorero' }),
  socio('Hija', { kind: 'persona', personId: 'p1', responsibleUid: 'u-ana' }),
  socio('Paco', { kind: 'typed', socioNumber: 12 }),
  socio('Viejo', { uid: 'u-old', bajaAt: new Date('2025-01-01') }),
];

function pressConfirm() {
  const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as { onPress?: () => void }[];
  buttons.at(-1)?.onPress?.();
}

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  setWatched('socios', ROWS);
  setWatched('privates', [
    { id: 'Ana', phone: '600', email: null, consentAnsweredAt: new Date() },
    { id: 'Paco', phone: '611', email: 'paco@x.es', consentAnsweredAt: null },
  ]);
});

function renderAdmin() {
  return render(<SociosRoster orgId="org1" canManage adminUids={['u-admin']} currentUid="u-admin" />);
}

describe('SociosRoster — admin', () => {
  it('lists active socios with their kind and the contact data they shared', () => {
    const { getByTestId, getByText, queryByTestId } = renderAdmin();
    expect(getByTestId('socios-roster')).toBeTruthy();
    expect(getByTestId('socio-row-Ana')).toBeTruthy();
    expect(getByText('600')).toBeTruthy();
    expect(getByText('611 · paco@x.es')).toBeTruthy();
    expect(queryByTestId('socio-row-Viejo')).toBeNull();
    fireEvent.press(getByTestId('socios-toggle-bajas'));
    expect(getByTestId('socio-row-Viejo')).toBeTruthy();
  });

  it('types in a new socio', async () => {
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('socios-add'));
    expect(getByTestId('typed-socio-sheet')).toBeTruthy();
    fireEvent.changeText(getByTestId('typed-socio-name'), 'Lola');
    fireEvent.changeText(getByTestId('typed-socio-phone'), '622');
    fireEvent.changeText(getByTestId('typed-socio-email'), '');
    fireEvent.press(getByTestId('typed-socio-save'));
    await waitFor(() =>
      expect(addTypedSocio).toHaveBeenCalledWith('org1', { displayName: 'Lola', socioNumber: null, phone: '622', email: '' }, 'u-admin'),
    );
  });

  it('closes the sheet once the new socio is saved', async () => {
    const { getByTestId, queryByTestId } = renderAdmin();
    fireEvent.press(getByTestId('socios-add'));
    fireEvent.changeText(getByTestId('typed-socio-name'), 'Lola');
    fireEvent.press(getByTestId('typed-socio-save'));
    await waitFor(() => expect(addTypedSocio).toHaveBeenCalled());
    await act(async () => {});
    expect(queryByTestId('typed-socio-sheet')).toBeNull();
  });

  it('keeps the sheet open and says so when the write is refused', async () => {
    jest.mocked(addTypedSocio).mockRejectedValueOnce(new Error('permission-denied'));
    const { getByTestId, queryByTestId } = renderAdmin();
    fireEvent.press(getByTestId('socios-add'));
    fireEvent.changeText(getByTestId('typed-socio-name'), 'Lola');
    fireEvent.press(getByTestId('typed-socio-save'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('groups.socios.error'));
    expect(getByTestId('typed-socio-sheet')).toBeTruthy();
    expect(queryByTestId('typed-socio-save-spinner')).toBeNull();
    expect(getByTestId('typed-socio-name').props.value).toBe('Lola');
  });

  it('tells the admin when a link, a title or a baja is refused', async () => {
    jest.mocked(linkSocioToMember).mockRejectedValueOnce(new Error('failed-precondition'));
    jest.mocked(setSocioAdminTitle).mockRejectedValueOnce(new Error('permission-denied'));
    jest.mocked(setSocioBaja).mockRejectedValueOnce(new Error('permission-denied'));
    const { getByTestId, queryByTestId } = renderAdmin();

    fireEvent.press(getByTestId('socio-link-Paco'));
    fireEvent.press(getByTestId('socio-link-sheet-u-ana'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('groups.socios.error'));
    expect(queryByTestId('socio-link-sheet')).toBeNull();

    fireEvent.press(getByTestId('socio-title-Tesorera'));
    fireEvent.press(getByTestId('socio-title-sheet-none'));
    expect(setSocioAdminTitle).toHaveBeenCalledWith('org1', 'Tesorera', null);
    await waitFor(() => expect(jest.mocked(Alert.alert).mock.calls.filter((c) => c[0] === 'groups.socios.error')).toHaveLength(2));

    fireEvent.press(getByTestId('socio-baja-Paco'));
    pressConfirm();
    await waitFor(() => expect(jest.mocked(Alert.alert).mock.calls.filter((c) => c[0] === 'groups.socios.error')).toHaveLength(3));
  });

  it('corrects a typed-in socio', async () => {
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('socio-edit-Paco'));
    fireEvent.changeText(getByTestId('typed-socio-name'), 'Paco Pérez');
    fireEvent.press(getByTestId('typed-socio-save'));
    await waitFor(() =>
      expect(updateTypedSocio).toHaveBeenCalledWith('org1', 'Paco', { displayName: 'Paco Pérez', socioNumber: 12, phone: '611', email: 'paco@x.es' }),
    );
  });

  it('numbers a member row, refusing a number another socio has', async () => {
    const { getByTestId, getByText } = renderAdmin();
    expect(getByText('groups.socios.numberShort · groups.socios.kindTyped · groups.socios.alta', { exact: false })).toBeTruthy();
    fireEvent.press(getByTestId('socio-number-Ana'));
    expect(getByTestId('socio-number-sheet')).toBeTruthy();
    fireEvent.changeText(getByTestId('socio-number-input'), '12');
    fireEvent.press(getByTestId('socio-number-save'));
    expect(getByText('groups.socios.socioNumberTaken')).toBeTruthy();
    expect(setSocioNumber).not.toHaveBeenCalled();
    fireEvent.changeText(getByTestId('socio-number-input'), '13');
    fireEvent.press(getByTestId('socio-number-save'));
    await waitFor(() => expect(setSocioNumber).toHaveBeenCalledWith('org1', 'Ana', 13));
  });

  it('links a typed-in socio to a member who joined with the app', () => {
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('socio-link-Paco'));
    expect(getByTestId('socio-link-sheet')).toBeTruthy();
    fireEvent.press(getByTestId('socio-link-sheet-u-ana'));
    expect(linkSocioToMember).toHaveBeenCalledWith('org1', 'Paco', 'u-ana');
  });

  it("gives an admin a title, and only admins' rows offer it", () => {
    const { getByTestId, queryByTestId } = renderAdmin();
    expect(queryByTestId('socio-title-Ana')).toBeNull();
    fireEvent.press(getByTestId('socio-title-Tesorera'));
    expect(getByTestId('socio-title-sheet')).toBeTruthy();
    fireEvent.press(getByTestId('socio-title-sheet-presidente'));
    expect(setSocioAdminTitle).toHaveBeenCalledWith('org1', 'Tesorera', 'presidente');
  });

  it('gives a persona or typed socio the baja after confirming, but never a member row', () => {
    const { getByTestId, queryByTestId } = renderAdmin();
    expect(queryByTestId('socio-baja-Ana')).toBeNull();
    fireEvent.press(getByTestId('socio-baja-Hija'));
    expect(setSocioBaja).not.toHaveBeenCalled();
    pressConfirm();
    expect(setSocioBaja).toHaveBeenCalledWith('org1', expect.objectContaining({ id: 'Hija', kind: 'persona' }));
  });
});

describe('SociosRoster — member with the estatutos setting on', () => {
  it('shows names only, with no contact data or actions', () => {
    const { getByText, queryByText, queryByTestId } = render(
      <SociosRoster orgId="org1" canManage={false} adminUids={[]} currentUid="u-ana" />,
    );
    expect(getByText('Paco')).toBeTruthy();
    expect(queryByText('611 · paco@x.es')).toBeNull();
    expect(queryByTestId('socios-add')).toBeNull();
    expect(queryByTestId('socio-row-Paco')).toBeNull();
  });
});

describe('GroupSettings', () => {
  const toggle = (r: ReturnType<typeof render>) => r.getByTestId('group-settings-socios-list-visible');

  it('turns on the estatutos setting: frozen while saving, then shows the stored value', async () => {
    let finish!: () => void;
    jest.mocked(updateOrganization).mockReturnValueOnce(new Promise<void>((res) => (finish = res)));
    const r = render(<GroupSettings orgId="org1" sociosListVisible={false} />);
    expect(r.getByTestId('group-settings')).toBeTruthy();
    fireEvent.press(toggle(r));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { sociosListVisible: true });
    expect(toggle(r).props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => finish());
    // The org listener delivers the stored value.
    r.rerender(<GroupSettings orgId="org1" sociosListVisible />);
    expect(toggle(r).props.accessibilityState).toEqual({ checked: true, disabled: false });
  });

  it('on a refused write: says so, unfreezes, and keeps the stored value', async () => {
    jest.mocked(updateOrganization).mockRejectedValueOnce(new Error('permission-denied'));
    const r = render(<GroupSettings orgId="org1" sociosListVisible={false} />);
    fireEvent.press(toggle(r));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('groups.settings.error'));
    expect(toggle(r).props.accessibilityState).toEqual({ checked: false, disabled: false });
  });
});
