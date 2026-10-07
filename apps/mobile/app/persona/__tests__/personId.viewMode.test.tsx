import { render, waitFor } from '@testing-library/react-native';
import PersonDetailScreen from '../[personId]';

// Opening a persona from the village tab — the roster, a barrio, an event's
// attendees — is "who is this?", not "let me edit them". The edit form is
// reached only from your own profile, which passes edit=1. This holds even for
// a dependent you created, which is the case that used to open the form.

const mockDependent = {
  id: 'p-1',
  userId: null,
  createdBy: 'uid-1',
  givenName: 'Marta',
  middleNames: [],
  firstSurname: 'Prieto',
  secondSurname: null,
  nickname: null,
  sex: null,
  birthday: null,
  birthPlace: null,
  municipalityLinks: [],
  occupations: [],
  biography: 'Vive en el barrio Centro',
  photoURL: null,
  isPublic: true,
};

let mockSearchParams: { personId: string; edit?: string } = { personId: 'p-1' };

jest.mock('@cultuvilla/shared/services/personService', () => ({
  createPerson: jest.fn(),
  getPerson: jest.fn(async () => mockDependent),
  updatePerson: jest.fn(),
  deletePerson: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadUserPhoto: jest.fn(),
}));
jest.mock('../../../lib/auth/useAuth', () => ({
  // The creator of the dependent — the case that must NOT auto-open the form.
  useAuth: () => ({ user: { uid: 'uid-1' }, profile: null }),
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (key: string) => key }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockSearchParams,
}));
jest.mock('../../../components/layout/ScreenHeader', () => {
  const { Text } = require('react-native');
  return {
    ScreenHeader: ({ title, rightSlot }: { title?: string; rightSlot?: unknown }) => (
      <>
        <Text testID="header-title">{title}</Text>
        {rightSlot ? <Text testID="header-right-slot">slot</Text> : null}
      </>
    ),
  };
});
jest.mock('../../../components/feature/PersonForm', () => {
  const { Text } = require('react-native');
  return { PersonForm: () => <Text testID="person-form">form</Text> };
});

describe('PersonDetailScreen — view vs edit', () => {
  beforeEach(() => {
    mockSearchParams = { personId: 'p-1' };
    jest.clearAllMocks();
  });

  it('shows the read-only details for a dependent you created', async () => {
    const { queryByTestId, findByText } = render(<PersonDetailScreen />);

    await findByText('Vive en el barrio Centro');
    expect(queryByTestId('person-form')).toBeNull();
    // No delete affordance either — that belongs to the form.
    expect(queryByTestId('header-right-slot')).toBeNull();
  });

  it('opens the form when the profile screen asks for it with edit=1', async () => {
    mockSearchParams = { personId: 'p-1', edit: '1' };

    const { findByTestId, getByTestId } = render(<PersonDetailScreen />);

    await findByTestId('person-form');
    expect(getByTestId('header-right-slot')).toBeTruthy();
  });

  it('never opens the form for someone else’s persona, even with edit=1', async () => {
    mockSearchParams = { personId: 'p-1', edit: '1' };
    const personService = require('@cultuvilla/shared/services/personService');
    (personService.getPerson as jest.Mock).mockResolvedValue({
      ...mockDependent,
      createdBy: 'someone-else',
    });

    const { queryByTestId, findByText } = render(<PersonDetailScreen />);

    await findByText('Vive en el barrio Centro');
    await waitFor(() => expect(queryByTestId('person-form')).toBeNull());
  });
});
