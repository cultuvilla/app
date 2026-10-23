import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import BarrioEditScreen from '../[barrio]/editar';

const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa', barrio: 'centro_b1' }),
  Redirect: (props: { href: string }) => mockRedirect(props),
  router: { back: jest.fn(), replace: jest.fn() },
}));
jest.mock('../../../../lib/navigation/VillageRouteGate');
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: jest.fn(),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getBarrio: jest.fn(),
  updateBarrio: jest.fn(),
  deleteBarrio: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/moderationService', () => ({
  hideContent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadBarrioImage: jest.fn(),
}));

import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';
import { getBarrio, updateBarrio } from '@cultuvilla/shared/services/municipalityService';
import { uploadBarrioImage } from '@cultuvilla/shared/services/imageService';
import { pickImageAsBlob } from '../../../../lib/images';

function mockCaps(opts: { canManage: boolean; uid: string | null; canEdit: boolean }) {
  const caps = {
    canManage: opts.canManage,
    canApprove: opts.canManage,
    uid: opts.uid,
    loading: false,
    canEdit: jest.fn(() => opts.canEdit),
    canDelete: jest.fn(() => opts.canEdit),
  };
  (useEntityCapabilities as jest.Mock).mockReturnValue(caps);
  return caps;
}

describe('BarrioEditScreen guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getBarrio as jest.Mock).mockResolvedValue({
      id: 'b1',
      name: 'Centro',
      images: [],
      municipalityId: 'm1',
      proposedBy: 'creator',
      status: 'active',
    });
  });

  it('redirects to the barrio detail when the viewer can neither manage nor edit', async () => {
    mockCaps({ canManage: false, uid: 'u1', canEdit: false });
    render(<BarrioEditScreen />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith({ href: '/villa/barrio/centro_b1' }));
  });

  it('lets the creator edit their own barrio without being a village admin', async () => {
    const caps = mockCaps({ canManage: false, uid: 'creator', canEdit: true });
    const { findByDisplayValue } = render(<BarrioEditScreen />);
    await findByDisplayValue('Centro');
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(caps.canEdit).toHaveBeenCalledWith('creator');
  });
});

// A failed upload used to vanish: the spinner stopped and the photo was gone.
describe('BarrioEditScreen photo upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getBarrio as jest.Mock).mockResolvedValue({
      id: 'b1', name: 'Centro', images: [], municipalityId: 'm1', proposedBy: 'creator', status: 'active',
    });
  });

  it('says so when the upload fails, and keeps the barrio without the photo', async () => {
    mockCaps({ canManage: false, uid: 'creator', canEdit: true });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (pickImageAsBlob as jest.Mock).mockResolvedValueOnce({ blob: {} as Blob, filename: 'a.jpg', contentType: 'image/jpeg', previewUri: 'file://a.jpg' });
    (uploadBarrioImage as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('User does not have permission'), { code: 'storage/unauthorized' }),
    );
    const { findByTestId, queryByTestId } = render(<BarrioEditScreen />);
    fireEvent.press(await findByTestId('barrio-edit-images-add'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('No puedes hacer eso', expect.any(String), expect.any(Array), expect.anything()));
    expect(updateBarrio).not.toHaveBeenCalled();
    expect(queryByTestId('barrio-edit-images-remove-0')).toBeNull();
    alert.mockRestore();
  });
});
