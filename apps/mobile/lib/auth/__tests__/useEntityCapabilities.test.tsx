import { renderHook, waitFor } from '@testing-library/react-native';
import { getVillageMemberRole } from '@cultuvilla/shared/services/villageMemberService';
import { useEntityCapabilities } from '../useEntityCapabilities';
import { useAuth } from '../useAuth';
import { useIsAppAdmin } from '../useIsAppAdmin';

jest.mock('@cultuvilla/shared/services/villageMemberService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/villageMemberService')>(
    '@cultuvilla/shared/services/villageMemberService',
  );
});
jest.mock('../useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('../useIsAppAdmin', () => ({ useIsAppAdmin: jest.fn() }));

const mockAuth = useAuth as jest.Mock;
const mockAppAdmin = useIsAppAdmin as jest.Mock;
const mockRole = getVillageMemberRole as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockReturnValue({ user: { uid: 'alice' }, loading: false });
  mockAppAdmin.mockReturnValue({ isAppAdmin: false, loading: false });
  mockRole.mockResolvedValue('user');
});

async function caps() {
  const { result } = renderHook(() => useEntityCapabilities('m1'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

describe('useEntityCapabilities', () => {
  it('plain member: cannot manage, exposes uid', async () => {
    const result = await caps();
    expect(result.current.canManage).toBe(false);
    expect(result.current.canApprove).toBe(false);
    expect(result.current.uid).toBe('alice');
  });

  it('village admin: can manage and approve', async () => {
    mockRole.mockResolvedValue('admin');
    const result = await caps();
    expect(result.current.canManage).toBe(true);
    expect(result.current.canApprove).toBe(true);
  });

  it('app admin: can manage without a village-admin record', async () => {
    mockAppAdmin.mockReturnValue({ isAppAdmin: true, loading: false });
    const result = await caps();
    expect(result.current.canManage).toBe(true);
  });

  it('unauthenticated: resolves not-loading, cannot manage, uid null', async () => {
    mockAuth.mockReturnValue({ user: null, loading: false });
    const result = await caps();
    expect(result.current.canManage).toBe(false);
    expect(result.current.uid).toBeNull();
  });
});

// `isMember` gates village-scoped reads that are open to residents but not to
// the open web — the event attendee roster. It mirrors the `isVillageMember`
// clause the Firestore rules use, and is broader than canManage: a plain
// member has it, an admin has it, a non-member does not.
describe('useEntityCapabilities.isMember', () => {
  it('plain member of the pueblo is a member', async () => {
    const result = await caps();
    expect(result.current.isMember).toBe(true);
    expect(result.current.canManage).toBe(false);
  });

  it('village admin is also a member', async () => {
    mockRole.mockResolvedValue('admin');
    const result = await caps();
    expect(result.current.isMember).toBe(true);
  });

  it('someone who has not joined the pueblo is not a member', async () => {
    mockRole.mockResolvedValue(null);
    const result = await caps();
    expect(result.current.isMember).toBe(false);
  });

  it('an app admin counts as a member of every pueblo', async () => {
    mockRole.mockResolvedValue(null);
    mockAppAdmin.mockReturnValue({ isAppAdmin: true, loading: false });
    const result = await caps();
    expect(result.current.isMember).toBe(true);
  });

  it('a signed-out viewer is not a member', async () => {
    mockAuth.mockReturnValue({ user: null, loading: false });
    const result = await caps();
    expect(result.current.isMember).toBe(false);
  });

  it('resolves membership and authority from ONE member-doc read', async () => {
    await caps();
    expect(mockRole).toHaveBeenCalledTimes(1);
  });
});

// The predicates themselves are tested in packages/shared (contentPolicy.test.ts,
// and against the rules in contentPolicyParity.test.ts). Here: that the hook
// hands the policy the viewer it resolved.
describe('useEntityCapabilities.can', () => {
  it('a plain member is the author of their own doc and nobody else’s', async () => {
    const result = await caps();
    expect(result.current.can('edit', 'place', { proposedBy: 'alice' })).toBe(true);
    expect(result.current.can('edit', 'place', { proposedBy: 'bob' })).toBe(false);
  });

  it('the village-admin role reaches the policy as village admin', async () => {
    mockRole.mockResolvedValue('admin');
    const result = await caps();
    expect(result.current.can('delete', 'place', { proposedBy: 'bob', status: 'hidden' })).toBe(true);
  });

  it('an app admin reaches the policy as app admin', async () => {
    mockAppAdmin.mockReturnValue({ isAppAdmin: true, loading: false });
    mockRole.mockResolvedValue(null);
    const result = await caps();
    expect(result.current.can('delete', 'historyEntry', { createdBy: 'bob', status: 'hidden' })).toBe(true);
  });

  it('a signed-out viewer authors nothing', async () => {
    mockAuth.mockReturnValue({ user: null, loading: false });
    const result = await caps();
    expect(result.current.can('edit', 'news', { createdBy: null, organizerUserIds: [] })).toBe(false);
  });
});
