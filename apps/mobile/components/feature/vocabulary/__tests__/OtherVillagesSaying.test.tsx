import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { OtherVillagesSaying } from '../OtherVillagesSaying';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (k: string) => k }),
}));
jest.mock('@cultuvilla/shared/services/vocabularyService', () => ({
  getVillagesSayingTerm: jest.fn().mockResolvedValue([
    { id: 'm2__zagal', municipalityId: 'm2', definitionCount: 2, term: 'Zagal' },
  ]),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getMunicipality: jest.fn().mockResolvedValue({ name: 'Segovia', slug: 'segovia' }),
}));

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
