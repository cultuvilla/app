import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { buildSocioData } from '@cultuvilla/shared/models/organization';
import { saveSocioContactSharing } from '@cultuvilla/shared/services/socioService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { SocioConsentCard } from '../SocioConsentCard';

jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1', email: 'ana@x.es' }, profile: { telephone: '600111222', email: 'ana@x.es' } }),
}));
jest.mock('@cultuvilla/shared/services/socioService', () => ({
  watchMySocios: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('mySocios'),
  watchSocioPrivate: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('socioPrivate'),
  saveSocioContactSharing: jest.fn().mockResolvedValue(undefined),
}));

const ownRow = { id: 's1', ...buildSocioData({ kind: 'member', displayName: 'Ana', uid: 'u1', createdBy: 'u1' }) };

beforeEach(() => {
  resetWatchers();
  jest.mocked(saveSocioContactSharing).mockClear();
});

describe('SocioConsentCard', () => {
  it('waits for the roster row the trigger creates on join', () => {
    setWatched('mySocios', []);
    const { queryByTestId } = render(<SocioConsentCard orgId="org1" />);
    expect(queryByTestId('socio-consent-card')).toBeNull();
  });

  it('asks, prefilled from the profile, and stores only what the member shares', async () => {
    setWatched('mySocios', [ownRow]);
    setWatched('socioPrivate', null);
    const { getByTestId, queryByTestId } = render(<SocioConsentCard orgId="org1" />);
    expect(getByTestId('socio-consent-phone').props.value).toBe('600111222');
    expect(getByTestId('socio-consent-email').props.value).toBe('ana@x.es');
    fireEvent.press(getByTestId('socio-consent-share-email'));
    expect(queryByTestId('socio-consent-email')).toBeNull();
    expect(getByTestId('socio-consent-share-phone')).toBeTruthy();
    fireEvent.press(getByTestId('socio-consent-save'));
    await waitFor(() =>
      expect(saveSocioContactSharing).toHaveBeenCalledWith('org1', 's1', { phone: '600111222', email: null }),
    );
  });

  it('on the org page, disappears once answered', () => {
    setWatched('mySocios', [ownRow]);
    setWatched('socioPrivate', { id: 's1', phone: null, email: 'ana@x.es', consentAnsweredAt: new Date() });
    const { queryByTestId } = render(<SocioConsentCard orgId="org1" onlyWhenUnanswered />);
    expect(queryByTestId('socio-consent-card')).toBeNull();
    expect(queryByTestId('socio-consent-edit')).toBeNull();
  });

  it('in the Grupos tab, summarises the answer with a way to change it', () => {
    setWatched('mySocios', [ownRow]);
    setWatched('socioPrivate', { id: 's1', phone: null, email: 'ana@x.es', consentAnsweredAt: new Date() });
    const { getByTestId } = render(<SocioConsentCard orgId="org1" />);
    fireEvent.press(getByTestId('socio-consent-edit'));
    expect(getByTestId('socio-consent-card')).toBeTruthy();
  });
});
