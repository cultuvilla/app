import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import PersonDetailScreen from '../[personId]';

// Regression: editing an EXISTING person/persona photo uploaded to the
// person-scoped storage path (`persons/<id>/photos/...`), whose rule needs a
// cross-service firestore.get the live project can't resolve -> 403
// storage/unauthorized. All person photo uploads must use the user-scoped
// uploader (`users/<uid>/photo/...`), the same path new persons already use.

const EXISTING_PERSON = {
  id: 'p-existing',
  userId: null,
  createdBy: 'uid-1',
  givenName: 'Ana',
  middleNames: [],
  firstSurname: 'Gil',
  secondSurname: null,
  nickname: null,
  sex: null,
  birthday: null,
  birthPlace: null,
  municipalityLinks: [],
  biography: null,
  photoURL: null,
};

jest.mock('@cultuvilla/shared/services/personService', () => ({
  createPerson: jest.fn().mockResolvedValue('p-new'),
  getPerson: jest.fn(),
  updatePerson: jest.fn().mockResolvedValue(undefined),
  deletePerson: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadUserPhoto: jest.fn().mockResolvedValue('https://photo.test/new.jpg'),
}));
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-1', email: 'a@b.test', displayName: null } }),
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (key: string) => key }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ personId: 'p-existing', edit: '1' }),
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({ ScreenHeader: () => null }));
// Stub the form so we can fire onSubmit with a photo directly.
jest.mock('../../../components/feature/PersonForm', () => {
  const { Pressable, Text } = require('react-native');
  return {
    PersonForm: ({ onSubmit }: { onSubmit: (v: unknown, p: unknown) => void }) => (
      <Pressable
        testID="submit"
        onPress={() =>
          onSubmit(
            {
              givenName: 'Ana',
              firstSurname: 'Gil',
              secondSurname: '',
              nickname: '',
              sex: null,
              birthday: null,
              birthPlaceMunicipalityId: null,
              biography: '',
              occupations: [],
            },
            { blob: { type: 'image/jpeg' } },
          )
        }
      >
        <Text>submit</Text>
      </Pressable>
    ),
  };
});

describe('PersonDetailScreen — edit existing photo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uploads an existing person photo to the user-scoped path', async () => {
    const personService = require('@cultuvilla/shared/services/personService');
    const imageService = require('@cultuvilla/shared/services/imageService');
    (personService.getPerson as jest.Mock).mockResolvedValue(EXISTING_PERSON);

    const { findByTestId } = render(<PersonDetailScreen />);

    await waitFor(() => {
      expect(personService.getPerson).toHaveBeenCalledWith('p-existing');
    });

    // Wait for `loading` to clear so the form (and its submit) is mounted
    // before pressing — querying eagerly raced the getPerson resolution.
    const submit = await findByTestId('submit');
    await act(async () => {
      fireEvent.press(submit);
    });

    await waitFor(() => {
      expect(imageService.uploadUserPhoto).toHaveBeenCalledWith(
        'uid-1',
        expect.objectContaining({ contentType: 'image/jpeg' }),
      );
    });
    expect(personService.updatePerson).toHaveBeenCalledWith('p-existing', {
      photoURL: 'https://photo.test/new.jpg',
    });
  });
});
