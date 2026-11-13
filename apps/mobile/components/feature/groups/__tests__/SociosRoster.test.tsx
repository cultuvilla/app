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
import { removeOrgMember, setOrgMemberRole } from '@cultuvilla/shared/services/orgMemberService';
import { saveCuotaSettings } from '@cultuvilla/shared/services/cuotaService';
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
jest.mock('@cultuvilla/shared/services/cuotaService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    saveCuotaSettings: jest.fn().mockResolvedValue(undefined),
    watchCuotaSettings: mockWatcher('cuota'),
    watchCuotaAssignments: mockWatcher('assignments'),
    watchCuotaPeriodPayments: mockWatcher('payments'),
  };
});
jest.mock('@cultuvilla/shared/services/orgMemberService', () => ({
  setOrgMemberRole: jest.fn().mockResolvedValue(undefined),
  removeOrgMember: jest.fn().mockResolvedValue(undefined),
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

/** Opens a socio's sheet and takes one of its actions. */
async function take(r: ReturnType<typeof render>, socioId: string, action: string) {
  fireEvent.press(r.getByTestId(`socio-row-${socioId}`));
  expect(r.getByTestId('socio-sheet')).toBeTruthy();
  fireEvent.press(r.getByTestId(`socio-${action}-${socioId}`));
  await waitFor(() => expect(r.queryByTestId('socio-sheet')).toBeNull());
}

/** The confirm a sheet action asks for, once the sheet has gone. */
async function confirmed() {
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  pressConfirm();
}

const CUOTA = {
  id: 'current',
  amountCents: 2500,
  yearAmounts: [],
  tiers: [],
  periodicity: 'yearly',
  startPeriod: '2020',
  dueMonth: 1,
  dueDay: 1,
  remindersEnabled: false,
  configuredBy: 'x',
  updatedAt: new Date(),
};

describe('SociosRoster — admin', () => {
  it('lists active socios with their number, and the bajas under their chip', () => {
    const r = renderAdmin();
    expect(r.getByTestId('socios-roster')).toBeTruthy();
    expect(r.getByTestId('socio-row-Ana')).toBeTruthy();
    expect(r.getByText('12')).toBeTruthy();
    expect(r.queryByTestId('socio-row-Viejo')).toBeNull();
    fireEvent.press(r.getByTestId('socios-filter-bajas'));
    expect(r.getByTestId('socio-row-Viejo')).toBeTruthy();
    expect(r.queryByTestId('socio-row-Ana')).toBeNull();
    fireEvent.press(r.getByTestId('socios-filter-sinApp'));
    expect(r.getByTestId('socio-row-Paco')).toBeTruthy();
    expect(r.queryByTestId('socio-row-Ana')).toBeNull();
  });

  it('reads each row out with its socio number, as it shows it', () => {
    const r = renderAdmin();
    expect(r.getByTestId('socio-row-Paco').props.accessibilityLabel).toBe('12, Paco');
    expect(r.getByTestId('socio-row-Ana').props.accessibilityLabel).toBe('Ana');
  });

  it('searches the book by name or number', () => {
    const r = renderAdmin();
    fireEvent.changeText(r.getByTestId('socios-search'), 'pac');
    expect(r.getByTestId('socio-row-Paco')).toBeTruthy();
    expect(r.queryByTestId('socio-row-Ana')).toBeNull();
    fireEvent.changeText(r.getByTestId('socios-search'), '12');
    expect(r.getByTestId('socio-row-Paco')).toBeTruthy();
    fireEvent.changeText(r.getByTestId('socios-search'), 'nadie');
    expect(r.getByTestId('socios-empty')).toBeTruthy();
  });

  it("shows the junta each socio's cuota, and who still owes it", () => {
    setWatched('cuota', CUOTA);
    setWatched('assignments', []);
    setWatched('payments', [
      { id: 'p1', socioId: 'Ana', periodKey: String(new Date().getFullYear()), kind: 'payment', amountCents: 2500, reversesId: null },
    ]);
    const r = renderAdmin();
    expect(r.queryByTestId('socio-cuota-Ana')).toBeNull();
    expect(r.getByTestId('socio-cuota-Paco')).toBeTruthy();
    fireEvent.press(r.getByTestId('socios-filter-pendiente'));
    expect(r.queryByTestId('socio-row-Ana')).toBeNull();
    expect(r.getByTestId('socio-row-Paco')).toBeTruthy();
    fireEvent.press(r.getByTestId('socio-row-Paco'));
    expect(r.getByTestId('socio-sheet-cuota')).toBeTruthy();
  });

  it('offers no cuota chip while the group has no cuota', () => {
    const r = renderAdmin();
    expect(r.queryByTestId('socios-filter-pendiente')).toBeNull();
  });

  it("opens a socio's record with the contact they shared and every action, the dangerous ones last", () => {
    const r = renderAdmin();
    fireEvent.press(r.getByTestId('socio-row-Ana'));
    expect(r.getByTestId('socio-sheet-contact').props.children).toBe('600');
    const ids = ['socio-number-Ana', 'socio-role-Ana', 'socio-remove-Ana'];
    ids.forEach((id) => expect(r.getByTestId(id)).toBeTruthy());
    expect(r.queryByTestId('socio-baja-Ana')).toBeNull();
    expect(r.queryByTestId('socio-title-Ana')).toBeNull();
    fireEvent.press(r.getByTestId('socio-sheet-close'));
    fireEvent.press(r.getByTestId('socio-row-Paco'));
    ['socio-edit-Paco', 'socio-link-Paco', 'socio-baja-Paco'].forEach((id) => expect(r.getByTestId(id)).toBeTruthy());
    expect(r.queryByTestId('socio-number-Paco')).toBeNull();
  });

  it('offers no action on a baja, nor on the admin\'s own row beyond its number and cargo', () => {
    const r = renderAdmin();
    fireEvent.press(r.getByTestId('socio-row-Tesorera'));
    expect(r.getByTestId('socio-title-Tesorera')).toBeTruthy();
    expect(r.queryByTestId('socio-role-Tesorera')).toBeNull();
    expect(r.queryByTestId('socio-remove-Tesorera')).toBeNull();
    fireEvent.press(r.getByTestId('socio-sheet-close'));
    fireEvent.press(r.getByTestId('socios-filter-bajas'));
    fireEvent.press(r.getByTestId('socio-row-Viejo'));
    expect(r.queryByTestId('socio-number-Viejo')).toBeNull();
  });

  it('makes another member an admin, then takes them out', async () => {
    const r = renderAdmin();
    await take(r, 'Ana', 'role');
    await confirmed();
    await waitFor(() => expect(setOrgMemberRole).toHaveBeenCalledWith('org1', 'u-ana', 'admin'));
    jest.mocked(Alert.alert).mockClear();
    await take(r, 'Ana', 'remove');
    await confirmed();
    await waitFor(() => expect(removeOrgMember).toHaveBeenCalledWith('org1', 'u-ana'));
  });

  it('takes the admin away from another admin', async () => {
    const r = render(<SociosRoster orgId="org1" canManage adminUids={['u-admin', 'u-ana']} currentUid="u-admin" />);
    await take(r, 'Ana', 'role');
    await confirmed();
    await waitFor(() => expect(setOrgMemberRole).toHaveBeenCalledWith('org1', 'u-ana', 'member'));
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
    const r = renderAdmin();
    const errors = () => jest.mocked(Alert.alert).mock.calls.filter((c) => c[0] === 'groups.socios.error');

    await take(r, 'Paco', 'link');
    fireEvent.press(await r.findByTestId('socio-link-sheet-u-ana'));
    await waitFor(() => expect(errors()).toHaveLength(1));
    expect(r.queryByTestId('socio-link-sheet')).toBeNull();

    await take(r, 'Tesorera', 'title');
    fireEvent.press(await r.findByTestId('socio-title-sheet-none'));
    expect(setSocioAdminTitle).toHaveBeenCalledWith('org1', 'Tesorera', null);
    await waitFor(() => expect(errors()).toHaveLength(2));

    await take(r, 'Paco', 'baja');
    await waitFor(() => expect(jest.mocked(Alert.alert).mock.calls.at(-1)?.[0]).toBe('groups.socios.confirmBajaTitle'));
    pressConfirm();
    await waitFor(() => expect(errors()).toHaveLength(3));
  });

  it('corrects a typed-in socio', async () => {
    const r = renderAdmin();
    await take(r, 'Paco', 'edit');
    fireEvent.changeText(await r.findByTestId('typed-socio-name'), 'Paco Pérez');
    fireEvent.press(r.getByTestId('typed-socio-save'));
    await waitFor(() =>
      expect(updateTypedSocio).toHaveBeenCalledWith('org1', 'Paco', { displayName: 'Paco Pérez', socioNumber: 12, phone: '611', email: 'paco@x.es' }),
    );
  });

  it('numbers a member row, refusing a number another socio has', async () => {
    const r = renderAdmin();
    await take(r, 'Ana', 'number');
    expect(await r.findByTestId('socio-number-sheet')).toBeTruthy();
    fireEvent.changeText(r.getByTestId('socio-number-input'), '12');
    fireEvent.press(r.getByTestId('socio-number-save'));
    expect(r.getByText('groups.socios.socioNumberTaken')).toBeTruthy();
    expect(setSocioNumber).not.toHaveBeenCalled();
    fireEvent.changeText(r.getByTestId('socio-number-input'), '13');
    fireEvent.press(r.getByTestId('socio-number-save'));
    await waitFor(() => expect(setSocioNumber).toHaveBeenCalledWith('org1', 'Ana', 13));
  });

  it('links a typed-in socio to a member who joined with the app', async () => {
    const r = renderAdmin();
    await take(r, 'Paco', 'link');
    expect(await r.findByTestId('socio-link-sheet')).toBeTruthy();
    fireEvent.press(r.getByTestId('socio-link-sheet-u-ana'));
    expect(linkSocioToMember).toHaveBeenCalledWith('org1', 'Paco', 'u-ana');
  });

  it('gives an admin a cargo', async () => {
    const r = renderAdmin();
    await take(r, 'Tesorera', 'title');
    expect(await r.findByTestId('socio-title-sheet')).toBeTruthy();
    fireEvent.press(r.getByTestId('socio-title-sheet-presidente'));
    expect(setSocioAdminTitle).toHaveBeenCalledWith('org1', 'Tesorera', 'presidente');
  });

  it('gives a persona or typed socio the baja after confirming', async () => {
    const r = renderAdmin();
    await take(r, 'Hija', 'baja');
    await confirmed();
    expect(setSocioBaja).toHaveBeenCalledWith('org1', expect.objectContaining({ id: 'Hija', kind: 'persona' }));
  });
});

describe('SociosRoster — member with the list visible', () => {
  it('shows names only, with no contact, cuota, filters or actions', () => {
    const r = render(<SociosRoster orgId="org1" canManage={false} adminUids={[]} currentUid="u-ana" />);
    expect(r.getByText('Paco')).toBeTruthy();
    expect(r.getByTestId('socios-search')).toBeTruthy();
    expect(r.queryByTestId('socios-filters')).toBeNull();
    expect(r.queryByTestId('socios-add')).toBeNull();
    expect(r.queryByTestId('socio-row-Paco')).toBeNull();
    expect(r.queryByText('Viejo')).toBeNull();
  });
});

describe('GroupSettings', () => {
  beforeEach(() => {
    setWatched('cuota', null);
  });

  it("an admin turns the cuota's reminders on once it is configured, keeping the rest", () => {
    const none = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} />);
    expect(none.queryByTestId('group-settings-cuota-reminders')).toBeNull();
    none.unmount();

    setWatched('cuota', { id: 'current', amountCents: 3000, remindersEnabled: false, configuredBy: 'x', updatedAt: new Date() });
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} />);
    fireEvent.press(r.getByTestId('group-settings-cuota-reminders'));
    expect(saveCuotaSettings).toHaveBeenCalledWith('org1', { amountCents: 3000, remindersEnabled: true }, 'u1');
  });

  const toggle = (r: ReturnType<typeof render>) => r.getByTestId('group-settings-socios-list-visible');

  it('an admin leaves the Charla to the junta; a group with no roster has no socios switch', () => {
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} hasRoster={false} chatAdminsOnly={false} />);
    expect(r.queryByTestId('group-settings-socios-list-visible')).toBeNull();
    fireEvent.press(r.getByTestId('group-settings-chat-admins-only'));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { chatAdminsOnly: true });
  });

  it('an admin switches the cosateca on, then opens it to the whole pueblo', () => {
    const off = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} />);
    expect(off.queryByTestId('group-settings-cosateca-audience')).toBeNull();
    fireEvent.press(off.getByTestId('group-settings-cosateca'));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { cosateca: { enabled: true, audience: 'integrantes' } });
    off.unmount();
    const on = render(
      <GroupSettings orgId="org1" uid="u1" sociosListVisible={false} cosateca={{ enabled: true, audience: 'integrantes' }} />,
    );
    fireEvent.press(on.getByTestId('group-settings-cosateca-audience-pueblo'));
    expect(updateOrganization).toHaveBeenLastCalledWith('org1', { cosateca: { enabled: true, audience: 'pueblo' } });
  });

  it('an admin requires the phone and the email, one by one', async () => {
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} />);
    fireEvent.press(r.getByTestId('group-settings-socio-phone-required'));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { socioPhoneRequired: true });
    await act(async () => undefined);
    fireEvent.press(r.getByTestId('group-settings-socio-email-required'));
    expect(updateOrganization).toHaveBeenLastCalledWith('org1', { socioEmailRequired: true });
  });

  it('turns on the estatutos setting: frozen while saving, then shows the stored value', async () => {
    let finish!: () => void;
    jest.mocked(updateOrganization).mockReturnValueOnce(new Promise<void>((res) => (finish = res)));
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} />);
    expect(r.getByTestId('group-settings')).toBeTruthy();
    fireEvent.press(toggle(r));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { sociosListVisible: true });
    expect(toggle(r).props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => finish());
    // The org listener delivers the stored value.
    r.rerender(<GroupSettings orgId="org1" uid="u1" sociosListVisible />);
    expect(toggle(r).props.accessibilityState).toEqual({ checked: true, disabled: false });
  });

  it('on a refused write: says so, unfreezes, and keeps the stored value', async () => {
    jest.mocked(updateOrganization).mockRejectedValueOnce(new Error('permission-denied'));
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} />);
    fireEvent.press(toggle(r));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('groups.settings.error'));
    expect(toggle(r).props.accessibilityState).toEqual({ checked: false, disabled: false });
  });
});
