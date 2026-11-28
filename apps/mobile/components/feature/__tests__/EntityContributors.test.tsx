import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { EntityContributors } from '../EntityContributors';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

const mockGetOrganization = jest.fn();
jest.mock('@cultuvilla/shared/services/organizationService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/organizationService')>('@cultuvilla/shared/services/organizationService', () => ({
      getOrganization: (id: string) => mockGetOrganization(id),
    })),
);

jest.mock('../LiveOwnerChip', () => ({
  LiveOwnerChip: ({
    ownerId,
    ownerType,
    onPress,
  }: {
    ownerId: string;
    ownerType: string;
    onPress?: () => void;
  }) => {
    const { Text } = require('react-native');
    return (
      <Text testID={`${ownerType}:${ownerId}`} onPress={onPress}>
        {ownerId}
      </Text>
    );
  },
}));

const { router } = jest.requireMock('expo-router');

describe('EntityContributors', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders people and organizations under the supplied credit label', () => {
    const { getByText } = render(
      <EntityContributors label="Contribuyeron" userIds={['u1']} orgIds={['o1']} />,
    );
    getByText('Contribuyeron');
    expect(getByText('o1')).toBeTruthy();
    expect(getByText('u1')).toBeTruthy();
  });

  it('renders nothing when there are no public credits', () => {
    const { toJSON } = render(<EntityContributors label="Contribuyeron" userIds={[]} orgIds={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('opens a credited person profile when their chip is pressed', () => {
    const { getByTestId } = render(
      <EntityContributors label="Contribuyeron" userIds={['u1']} orgIds={[]} />,
    );
    fireEvent.press(getByTestId('user:u1'));
    expect(router.push).toHaveBeenCalledWith('/usuario/u1');
  });

  it('opens a credited organization when its chip is pressed', async () => {
    mockGetOrganization.mockResolvedValueOnce({ id: 'o1', name: 'Peña El Roble', villageSlug: 'villa' });
    const { getByTestId } = render(
      <EntityContributors label="Contribuyeron" userIds={[]} orgIds={['o1']} />,
    );
    fireEvent.press(getByTestId('organization:o1'));
    expect(mockGetOrganization).toHaveBeenCalledWith('o1');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/villa/entidad/pena-el-roble_o1'));
  });
});
