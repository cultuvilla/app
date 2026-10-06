import { render } from '@testing-library/react-native';
import { ProfileHeader } from '../ProfileHeader';

jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (key: string, params?: Record<string, string>) =>
      params?.village ? `${key}:${params.village}` : key,
  }),
}));

describe('ProfileHeader', () => {
  it('shows nothing extra for someone who holds no title', () => {
    const { queryByTestId } = render(<ProfileHeader person={null} fallbackName="Lucía" />);
    expect(queryByTestId('avatar-ambassador-seal')).toBeNull();
  });

  it('names each pueblo the person is Embajador of, under the name, and stamps the seal', () => {
    const { getByText, getByTestId } = render(
      <ProfileHeader
        person={null}
        fallbackName="Lucía"
        ambassadorOf={[
          { id: 'm1', name: 'Matabuena', sex: 'female' },
          { id: 'm2', name: 'Abalcisqueta', sex: 'female' },
        ]}
      />,
    );
    expect(getByText('ambassador.inVillageFemale:Matabuena')).toBeTruthy();
    expect(getByText('ambassador.inVillageFemale:Abalcisqueta')).toBeTruthy();
    expect(getByTestId('avatar-ambassador-seal')).toBeTruthy();
  });
});
