import { render } from '@testing-library/react-native';
import { AmbassadorCarnet } from '../AmbassadorCarnet';

jest.mock('../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (key: string, params?: Record<string, string>) =>
      params?.village ? `${key}:${params.village}` : key,
  }),
}));

describe('AmbassadorCarnet', () => {
  it('shows the name, the full title for the pueblo and the Cultuvilla seal', () => {
    const { getByTestId, getByText } = render(
      <AmbassadorCarnet
        name="Lucía Martín"
        photoURL={null}
        sex={null}
        villageName="Matabuena"
        escudoUrl={null}
      />,
    );
    expect(getByTestId('ambassador-carnet-name')).toHaveTextContent('Lucía Martín');
    expect(getByText('organize.carnet.title:Matabuena')).toBeTruthy();
    expect(getByTestId('avatar-ambassador-mark')).toBeTruthy();
  });

  it('reads Embajadora for a woman', () => {
    const { getByText } = render(
      <AmbassadorCarnet
        name="Lucía Martín"
        photoURL={null}
        sex="female"
        villageName="Matabuena"
        escudoUrl={null}
      />,
    );
    expect(getByText('organize.carnet.titleFemale:Matabuena')).toBeTruthy();
  });
});
