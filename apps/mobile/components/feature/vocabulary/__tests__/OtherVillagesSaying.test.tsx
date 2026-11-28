import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { OtherVillagesSaying } from '../OtherVillagesSaying';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (k: string) => k }),
}));
// Both fakes are built from the real service, so a renamed export fails here
// instead of reading as undefined in the component. Type aliases a factory
// reads must be named mock*, or babel-jest refuses them as out of scope.
type MockVocabulary = typeof import('@cultuvilla/shared/services/vocabularyService');
type MockSaying = Awaited<ReturnType<MockVocabulary['getVillagesSayingTerm']>>[number];
type MockMunicipalities = typeof import('@cultuvilla/shared/services/municipalityService');
type MockMunicipality = NonNullable<Awaited<ReturnType<MockMunicipalities['getMunicipality']>>>;
jest.mock('@cultuvilla/shared/services/vocabularyService', () => {
  const { fakeService, partialOf } =
    jest.requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule');
  return fakeService<MockVocabulary>('@cultuvilla/shared/services/vocabularyService', () => ({
    getVillagesSayingTerm: async () => [
      partialOf<MockSaying>({ id: 'm2__zagal', municipalityId: 'm2', definitionCount: 2, term: 'Zagal' }),
    ],
  }));
});
jest.mock('@cultuvilla/shared/services/municipalityService', () => {
  const { fakeService, partialOf } =
    jest.requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule');
  return fakeService<MockMunicipalities>('@cultuvilla/shared/services/municipalityService', () => ({
    getMunicipality: async () => partialOf<MockMunicipality>({ name: 'Segovia', slug: 'segovia' }),
  }));
});

describe('<OtherVillagesSaying>', () => {
  it('lists the other pueblos that record the word, each linking to its entry', async () => {
    const { findByTestId, getByTestId } = render(
      <OtherVillagesSaying normalized="zagal" municipalityId="m1" />,
    );
    expect(await findByTestId('vocabulary-other-villages')).toBeTruthy();
    fireEvent.press(getByTestId('vocabulary-other-village-m2'));
    expect(router.push).toHaveBeenCalledWith(expect.stringContaining('segovia'));
  });
});
