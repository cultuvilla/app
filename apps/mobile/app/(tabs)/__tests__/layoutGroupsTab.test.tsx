import { render } from '@testing-library/react-native';
import TabsLayout from '../_layout';

const mockScreens: Record<string, { href?: unknown }> = {};
let mockGroupCount = 0;

jest.mock('expo-router', () => {
  const Tabs = ({ children }: { children: unknown }) => children;
  Tabs.Screen = ({ name, options }: { name: string; options?: { href?: unknown } }) => {
    mockScreens[name] = options ?? {};
    return null;
  };
  return { Tabs };
});
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' }, loading: false }) }));
jest.mock('../../../lib/auth/RegisterGateContext', () => ({ useRegisterGate: () => ({ requireAuth: jest.fn() }) }));
jest.mock('../../../lib/village/GuestActiveVillageContext', () => ({ useGuestActiveVillage: () => ({ guestVillageId: null }) }));
jest.mock('../../../lib/orgs/useMyGroups', () => ({
  useMyGroups: () => ({ groups: Array.from({ length: mockGroupCount }, (_, i) => ({ org: { id: `o${i}` }, role: 'member' })), status: 'ready' }),
}));

describe('Grupos tab visibility', () => {
  it('is hidden for someone in no group', () => {
    mockGroupCount = 0;
    render(<TabsLayout />);
    expect(mockScreens.grupos?.href).toBeNull();
  });

  it('shows once the user belongs to a group', () => {
    mockGroupCount = 1;
    render(<TabsLayout />);
    expect(mockScreens.grupos?.href).toBeUndefined();
  });
});
