import { Alert, Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildSocioData } from '@cultuvilla/shared/models/organization';
import { removeOrgMember } from '@cultuvilla/shared/services/orgMemberService';
import { saveSocioContactSharing } from '@cultuvilla/shared/services/socioService';
import { patchUserProfile } from '@cultuvilla/shared/services/userService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { GroupContactGate, SocioContactSheet } from '../GroupContactGate';
import type { MyGroup } from '../../../../lib/orgs/useMyGroups';

let mockProfile: { telephone: string | null; email: string } = { telephone: '+34600111222', email: 'ana@x.es' };

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1', email: mockProfile.email }, profile: mockProfile, refreshProfile: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('@cultuvilla/shared/services/socioService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchMySocios: mockWatcher('mySocios'),
    watchSocioPrivate: mockWatcher('socioPrivate'),
    saveSocioContactSharing: jest.fn().mockResolvedValue(undefined),
  };
});
jest.mock('@cultuvilla/shared/services/orgMemberService', () => ({ removeOrgMember: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@cultuvilla/shared/services/userService', () => ({ patchUserProfile: jest.fn().mockResolvedValue(undefined) }));

function group(role: 'admin' | 'member', over: Record<string, unknown> = {}): MyGroup {
  return {
    org: { id: 'org1', name: 'Peña', type: 'peña', socioPhoneRequired: true, socioEmailRequired: true, ...over },
    role,
  } as unknown as MyGroup;
}

const renderGate = (g: MyGroup) =>
  render(
    <GroupContactGate group={g} uid="u1">
      <Text testID="group-content">grupo</Text>
    </GroupContactGate>,
  );

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
  mockProfile = { telephone: '+34600111222', email: 'ana@x.es' };
  setWatched('mySocios', [{ id: 's1', ...buildSocioData({ kind: 'member', displayName: 'Ana', uid: 'u1', createdBy: 'u1' }) }]);
  setWatched('socioPrivate', null);
});

describe('GroupContactGate', () => {
  it('holds a socio who owes the data, shares the account values without showing or asking them', async () => {
    const { getByTestId, queryByTestId, queryByText } = renderGate(group('member'));
    expect(getByTestId('group-contact-gate')).toBeTruthy();
    expect(queryByTestId('group-content')).toBeNull();
    expect(queryByTestId('socio-contact-phone')).toBeNull();
    expect(queryByTestId('socio-contact-email')).toBeNull();
    expect(queryByText(/600111222|ana@x\.es/)).toBeNull();
    fireEvent.press(getByTestId('socio-contact-accept-button'));
    await waitFor(() =>
      expect(saveSocioContactSharing).toHaveBeenCalledWith('org1', 's1', { phone: '+34600111222', email: 'ana@x.es' }),
    );
    expect(patchUserProfile).not.toHaveBeenCalled();
  });

  it('asks once for a phone the account lacks, and keeps it on the account', async () => {
    mockProfile = { telephone: null, email: 'ana@x.es' };
    const { getByTestId } = renderGate(group('member'));
    fireEvent.press(getByTestId('socio-contact-accept-button'));
    expect(saveSocioContactSharing).not.toHaveBeenCalled();
    fireEvent.changeText(getByTestId('socio-contact-phone'), '600111222');
    fireEvent.press(getByTestId('socio-contact-accept-button'));
    await waitFor(() => expect(saveSocioContactSharing).toHaveBeenCalled());
    expect(patchUserProfile).toHaveBeenCalledWith('u1', { telephone: '+34600111222' });
  });

  it('keeps an email shared by choice when only the phone is required', async () => {
    setWatched('socioPrivate', { id: 's1', phone: null, email: 'otro@x.es', consentAnsweredAt: new Date() });
    const { getByTestId } = renderGate(group('member', { socioEmailRequired: false }));
    fireEvent.press(getByTestId('socio-contact-accept-button'));
    await waitFor(() =>
      expect(saveSocioContactSharing).toHaveBeenCalledWith('org1', 's1', { phone: '+34600111222', email: 'otro@x.es' }),
    );
  });

  it('asks for an email the account lacks, and offers another group when there is one', async () => {
    mockProfile = { telephone: '+34600111222', email: '' };
    const onSwitch = jest.fn();
    const { getByTestId } = render(
      <GroupContactGate group={group('member')} uid="u1" onSwitch={onSwitch}>
        <Text>grupo</Text>
      </GroupContactGate>,
    );
    expect(getByTestId('socio-contact-accept')).toBeTruthy();
    expect(getByTestId('socio-contact-email')).toBeTruthy();
    fireEvent.press(getByTestId('group-contact-gate-switch'));
    expect(onSwitch).toHaveBeenCalled();
  });

  it('lets them leave instead', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByTestId } = renderGate(group('member'));
    fireEvent.press(getByTestId('group-contact-gate-leave'));
    const buttons = (alert.mock.calls.at(-1)?.[2] ?? []) as { onPress?: () => void }[];
    buttons.at(-1)?.onPress?.();
    expect(removeOrgMember).toHaveBeenCalledWith('org1', 'u1');
  });

  it('never holds an admin, a socio who shares it, or a group that does not require it', () => {
    expect(renderGate(group('admin')).getByTestId('group-content')).toBeTruthy();
    expect(renderGate(group('member', { socioPhoneRequired: false, socioEmailRequired: false })).getByTestId('group-content')).toBeTruthy();
    setWatched('socioPrivate', { id: 's1', phone: '+34600111222', email: 'ana@x.es', consentAnsweredAt: new Date() });
    expect(renderGate(group('member')).getByTestId('group-content')).toBeTruthy();
  });
});

describe('SocioContactSheet', () => {
  it('joins on the yes, and closes', async () => {
    const onAccepted = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const { getByTestId } = render(
      <SocioContactSheet
        visible
        orgName="Peña"
        requirement={{ socioPhoneRequired: true, socioEmailRequired: false }}
        onAccepted={onAccepted}
        onClose={onClose}
      />,
    );
    expect(getByTestId('socio-contact-sheet')).toBeTruthy();
    fireEvent.press(getByTestId('socio-contact-accept-button'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onAccepted).toHaveBeenCalled();
    expect(saveSocioContactSharing).not.toHaveBeenCalled();
  });
});
