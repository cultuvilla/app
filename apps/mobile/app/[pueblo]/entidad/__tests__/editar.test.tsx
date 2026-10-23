import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import OrgEditScreen from '../[entidad]/editar';

const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa', entidad: 'pena_org1' }),
  Redirect: (props: { href: string }) => mockRedirect(props),
  router: { back: jest.fn() },
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../components/layout/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('../../../../lib/auth/useOrgCapabilities', () => ({
  useOrgCapabilities: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  getOrganization: jest.fn().mockResolvedValue({
    id: 'org1', name: 'Peña', description: null, type: 'peña', images: [], municipalityId: 'm1', villageSlug: 'villa',
  }),
  updateOrganization: jest.fn(),
}));
jest.mock('../../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadOrganizationImage: jest.fn(),
}));

import { useOrgCapabilities } from '../../../../lib/auth/useOrgCapabilities';
import { getOrganization, updateOrganization } from '@cultuvilla/shared/services/organizationService';
import { uploadOrganizationImage } from '@cultuvilla/shared/services/imageService';
import { pickImageAsBlob } from '../../../../lib/images';

describe('OrgEditScreen guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('redirects to the org detail when the viewer cannot manage', async () => {
    (useOrgCapabilities as jest.Mock).mockReturnValue({ canManage: false, uid: 'u1', loading: false });
    render(<OrgEditScreen />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith({ href: '/villa/entidad/pena_org1' }));
  });

  it('does not redirect before the org has finished loading', async () => {
    const { getOrganization } = jest.requireMock('@cultuvilla/shared/services/organizationService') as {
      getOrganization: jest.Mock;
    };
    getOrganization.mockImplementation(() => new Promise(() => {}));
    (useOrgCapabilities as jest.Mock).mockReturnValue({ canManage: false, uid: 'u1', loading: false });
    render(<OrgEditScreen />);
    await waitFor(() => expect(getOrganization).toHaveBeenCalled());
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

// A failed upload used to vanish: the spinner stopped and the photo was gone.
describe('OrgEditScreen photo upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getOrganization as jest.Mock).mockResolvedValue({
      id: 'org1', name: 'Peña', description: null, type: 'peña', images: [], municipalityId: 'm1', villageSlug: 'villa',
    });
  });

  it('says so when the upload fails, and keeps the org without the photo', async () => {
    (useOrgCapabilities as jest.Mock).mockReturnValue({ canManage: true, canDelete: false, uid: 'boss', loading: false });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (pickImageAsBlob as jest.Mock).mockResolvedValueOnce({ blob: {} as Blob, filename: 'a.jpg', contentType: 'image/jpeg', previewUri: 'file://a.jpg' });
    (uploadOrganizationImage as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('Max retry time exceeded'), { code: 'storage/retry-limit-exceeded' }),
    );
    const { findByTestId, queryByTestId } = render(<OrgEditScreen />);
    fireEvent.press(await findByTestId('org-edit-images-add'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Sin conexión', expect.any(String), expect.any(Array), expect.anything()));
    expect(updateOrganization).not.toHaveBeenCalled();
    expect(queryByTestId('org-edit-images-remove-0')).toBeNull();
    alert.mockRestore();
  });
});
