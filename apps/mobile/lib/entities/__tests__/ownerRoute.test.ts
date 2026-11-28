import { router } from 'expo-router';
import { openOwner } from '../ownerRoute';
import { getOrganization } from '@cultuvilla/shared/services/organizationService';
import { partialOf } from '../../../test/fakeModule';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@cultuvilla/shared/services/organizationService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/organizationService')>(
      '@cultuvilla/shared/services/organizationService',
    ),
);

const push = jest.mocked(router.push);
const getOrg = jest.mocked(getOrganization);

describe('openOwner', () => {
  beforeEach(() => {
    push.mockClear();
    getOrg.mockReset();
  });

  it('opens a user profile', async () => {
    await openOwner('user', 'u1');
    expect(push).toHaveBeenCalledWith('/usuario/u1');
  });

  it('opens a persona', async () => {
    await openOwner('person', 'p1');
    expect(push).toHaveBeenCalledWith('/persona/p1');
  });

  it('resolves an organization to its pueblo-first path', async () => {
    getOrg.mockResolvedValue(
      partialOf<NonNullable<Awaited<ReturnType<typeof getOrganization>>>>({
        id: 'o1',
        name: 'Peña El Roble',
        villageSlug: 'matabuena',
      }),
    );
    await openOwner('organization', 'o1');
    expect(push).toHaveBeenCalledWith('/matabuena/entidad/pena-el-roble_o1');
  });

  it('goes nowhere when the organization is gone', async () => {
    getOrg.mockResolvedValue(null);
    await openOwner('organization', 'missing');
    expect(push).not.toHaveBeenCalled();
  });
});
