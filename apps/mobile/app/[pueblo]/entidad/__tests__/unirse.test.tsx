import { render } from '@testing-library/react-native';

const mockRedirect = jest.fn((_props: { href: string }) => null);
const mockParams: { pueblo?: string; entidad?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Redirect: (props: { href: string }) => mockRedirect(props),
}));

import OrgJoinRedirect from '../[entidad]/unirse';

beforeEach(() => {
  mockRedirect.mockClear();
  delete mockParams.pueblo;
  delete mockParams.entidad;
});

describe('org invite redirect', () => {
  it('opens the org detail carrying the join intent', () => {
    Object.assign(mockParams, { pueblo: 'villa', entidad: 'pena_o1' });
    render(<OrgJoinRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/villa/entidad/pena_o1?intent=join' });
  });

  it('falls back to home when the link is incomplete', () => {
    Object.assign(mockParams, { pueblo: 'villa' });
    render(<OrgJoinRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/(tabs)' });
  });
});
