import { render } from '@testing-library/react-native';
import { ProfileView } from '../ProfileView';

jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../../lib/deeplink/useShareDeepLink', () => ({ useShareDeepLink: () => jest.fn() }));
jest.mock('../../../../lib/callableError', () => ({ useCallableErrorHandler: () => jest.fn() }));
jest.mock('../../../../lib/hooks/useAmbassadorVillages', () => ({ useAmbassadorVillages: () => [] }));
jest.mock('../../../../lib/navigation/openVillage', () => ({ openVillage: jest.fn() }));
jest.mock('../../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('@cultuvilla/shared/services/personService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/personService')>(
      '@cultuvilla/shared/services/personService',
    ),
);
jest.mock('@cultuvilla/shared/services/imageService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/imageService')>(
      '@cultuvilla/shared/services/imageService',
    ),
);
jest.mock('@cultuvilla/shared/services/deepLinkService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/deepLinkService')>(
      '@cultuvilla/shared/services/deepLinkService',
    ),
);
jest.mock('../ProfileHeader', () => ({ ProfileHeader: () => null }));
jest.mock('../VillagesScroll', () => ({ VillagesScroll: () => null }));
jest.mock('../../../../lib/profile/useProfileData', () => ({
  useProfileData: () => ({
    selfPerson: null,
    allPersonas: [],
    eventsCreated: 0,
    managedEvents: [],
    newsCount: 0,
    createdNews: [],
    newsError: null,
    orgs: [],
    villages: [{ municipalityId: 'm1', name: 'Matabuena' }],
    loading: false,
  }),
}));

describe('profile villages heading', () => {
  it('says «Mis pueblos» on your own profile', () => {
    const { getByText, queryByText } = render(
      <ProfileView uid="u1" activeMunicipalityId="m1" variant="self" fallbackName="Yo" />,
    );
    expect(getByText('profile.villagesEntry')).toBeTruthy();
    expect(queryByText('profile.villagesEntryOther')).toBeNull();
  });

  it("is not possessive on another user's profile", () => {
    const { getByText, queryByText } = render(
      <ProfileView uid="u2" activeMunicipalityId="m1" variant="other" fallbackName="Otra" />,
    );
    expect(getByText('profile.villagesEntryOther')).toBeTruthy();
    expect(queryByText('profile.villagesEntry')).toBeNull();
  });
});
