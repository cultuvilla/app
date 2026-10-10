import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { OrganizationsManager } from '../OrganizationsManager';
import {
  requestOrganization, approveOrganization,
} from '@cultuvilla/shared/services/organizationService';
import { uploadOrganizationImage } from '@cultuvilla/shared/services/imageService';
import { pickImageAsBlob } from '../../../../lib/images';
import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';
import { observability } from '@cultuvilla/shared';

jest.mock('@cultuvilla/shared', () => ({
  ...jest.requireActual('@cultuvilla/shared'),
  observability: { trackEvent: jest.fn() },
}));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  requestOrganization: jest.fn().mockResolvedValue('new-org'),
  newOrganizationId: jest.fn(() => 'new-org'),
  approveOrganization: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadOrganizationImage: jest.fn().mockResolvedValue('https://example.com/org.jpg'),
}));
jest.mock('../../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({ useEntityCapabilities: jest.fn() }));

const mockCaps = useEntityCapabilities as jest.Mock;
const mockPick = pickImageAsBlob as jest.Mock;

const stubImage = { blob: {} as Blob, filename: 'org.jpg', contentType: 'image/jpeg', previewUri: 'file://org.jpg' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPick.mockResolvedValue(stubImage);
  mockCaps.mockReturnValue({ canManage: false, canApprove: false, uid: 'alice', loading: false });
});

describe('<OrganizationsManager>', () => {
  it('a villager submitting requests a pending organization (no auto-approve)', async () => {
    const { getByTestId, getByText } = render(<OrganizationsManager villageId="m1" />);
    getByText('organization.submitRequest');
    fireEvent.changeText(getByTestId('org-name-input'), 'Peña El Pilar');
    fireEvent.press(getByTestId('org-submit'));
    await waitFor(() =>
      expect(requestOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Peña El Pilar', type: 'peña', municipalityId: 'm1', requestedBy: 'alice', status: 'pending', images: [],
        }),
      ),
    );
    expect(approveOrganization).not.toHaveBeenCalled();
    expect(observability.trackEvent).toHaveBeenCalledWith('org.create.success', { municipalityId: 'm1' });
  });

  it('an organizer submitting requests then auto-approves', async () => {
    mockCaps.mockReturnValue({ canManage: true, canApprove: true, uid: 'boss', loading: false });
    const { getByTestId } = render(<OrganizationsManager villageId="m1" />);
    fireEvent.changeText(getByTestId('org-name-input'), 'Peña Nueva');
    fireEvent.press(getByTestId('org-submit'));
    await waitFor(() => expect(requestOrganization).toHaveBeenCalled());
    await waitFor(() => expect(approveOrganization).toHaveBeenCalledWith('new-org'));
  });

  it('uploads a picked image to the minted org id and includes it in the request payload', async () => {
    const { getByTestId, getByLabelText } = render(<OrganizationsManager villageId="m1" />);
    fireEvent.press(getByLabelText('organization.addImage'));
    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    fireEvent.changeText(getByTestId('org-name-input'), 'Peña El Pilar');
    fireEvent.press(getByTestId('org-submit'));

    expect(uploadOrganizationImage).toHaveBeenCalledWith('new-org', stubImage);
    await waitFor(() =>
      expect(requestOrganization).toHaveBeenCalledWith(
        expect.objectContaining({ images: ['https://example.com/org.jpg'] }),
      ),
    );
  });

  // On iOS the multiline description's keyboard covered the submit button and
  // nothing dismissed it: return adds a line, and a tap outside an input
  // dismisses nothing unless a ScrollView takes it (E2E flow 70).
  it('lays the form out in a scroll view that lets a tap outside close the keyboard', () => {
    const { UNSAFE_getAllByType, getByTestId } = render(<OrganizationsManager villageId="m1" />);
    const scrolls = UNSAFE_getAllByType(ScrollView);
    expect(scrolls.some((s) => s.props.keyboardShouldPersistTaps === 'handled')).toBe(true);
    expect(getByTestId('org-submit')).toBeTruthy();
  });
});
