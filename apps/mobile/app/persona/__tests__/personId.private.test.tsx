import { render, waitFor } from '@testing-library/react-native';
import PersonDetailScreen from '../[personId]';

// A private persona is denied by firestore.rules, so the read rejects rather
// than returning null. That has to render as its own state — falling through to
// the 404 branch would tell a neighbour the person doesn't exist, when the
// village roster is listing them by name two screens away.

jest.mock('@cultuvilla/shared/services/personService', () => ({
  createPerson: jest.fn(),
  getPerson: jest.fn(),
  updatePerson: jest.fn(),
  deletePerson: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadUserPhoto: jest.fn(),
}));
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-2', email: 'b@b.test', displayName: null } }),
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (key: string) => key }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ personId: 'p-private' }),
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({ ScreenHeader: () => null }));

describe('PersonDetailScreen — private persona', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the private notice when the read is denied', async () => {
    const personService = require('@cultuvilla/shared/services/personService');
    (personService.getPerson as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      }),
    );

    const { findByText, queryByText } = render(<PersonDetailScreen />);

    expect(await findByText('profile.personPrivate')).toBeTruthy();
    expect(queryByText('404')).toBeNull();
  });

  it('still shows 404 when the person genuinely does not exist', async () => {
    const personService = require('@cultuvilla/shared/services/personService');
    (personService.getPerson as jest.Mock).mockResolvedValue(null);

    const { findByText, queryByText } = render(<PersonDetailScreen />);

    expect(await findByText('404')).toBeTruthy();
    await waitFor(() => expect(queryByText('profile.personPrivate')).toBeNull());
  });
});
