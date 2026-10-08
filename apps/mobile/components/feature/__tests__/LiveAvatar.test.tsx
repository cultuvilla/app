import { render, waitFor } from '@testing-library/react-native';
import { LiveAvatar } from '../LiveAvatar';
import { useFirestoreDoc } from '@cultuvilla/shared/hooks';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { publicProfileDoc, personDoc, organizationDoc } from '@cultuvilla/shared/firebase/refs/client';

jest.mock('@cultuvilla/shared/firebase', () => ({
  getDb: jest.fn(() => ({})),
}));
jest.mock('@cultuvilla/shared/hooks', () => ({
  useFirestoreDoc: jest.fn(),
}));
jest.mock('@cultuvilla/shared/firebase/refs/client', () => ({
  publicProfileDoc: jest.fn((_db, id) => ({ __ref: 'publicProfile', id })),
  personDoc: jest.fn((_db, id) => ({ __ref: 'person', id })),
  organizationDoc: jest.fn((_db, id) => ({ __ref: 'organization', id })),
}));
jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonByUserId: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (key: string) => key }),
}));
// LiveAvatar renders through useOwnerSummary, which reads the signed-in viewer
// to resolve the owner's persona photo.
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'viewer-9' } }),
}));

const mockUseFirestoreDoc = useFirestoreDoc as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseFirestoreDoc.mockReturnValue({ data: undefined, loading: true, error: null });
});

describe('<LiveAvatar>', () => {
  it("renders a user owner's photo from their linked persona", async () => {
    mockUseFirestoreDoc.mockReturnValue({
      data: { displayName: 'Alice', activeMunicipalityId: null },
      loading: false,
      error: null,
    });
    (getPersonByUserId as jest.Mock).mockResolvedValueOnce({ photoURL: 'https://img/alice.jpg' });

    const { findByTestId } = render(<LiveAvatar ownerId="alice" ownerType="user" />);

    expect(publicProfileDoc).toHaveBeenCalledWith(expect.anything(), 'alice');
    const image = await findByTestId('avatar-image');
    await waitFor(() => expect(image.props.source).toEqual([{ uri: 'https://img/alice.jpg' }]));
  });

  it('reads images[0] for organization owners', () => {
    mockUseFirestoreDoc.mockReturnValue({
      data: { images: ['https://img/pena.jpg'] },
      loading: false,
      error: null,
    });

    const { getByTestId } = render(<LiveAvatar ownerId="pena1" ownerType="organization" />);

    expect(organizationDoc).toHaveBeenCalledWith(expect.anything(), 'pena1');
    expect(getByTestId('avatar-image').props.source).toEqual([{ uri: 'https://img/pena.jpg' }]);
  });

  it('uses the person doc for person owners', () => {
    render(<LiveAvatar ownerId="p1" ownerType="person" />);
    expect(personDoc).toHaveBeenCalledWith(expect.anything(), 'p1');
  });

  it('falls back to initials when the owner has no image', () => {
    mockUseFirestoreDoc.mockReturnValue({ data: { photoURL: null }, loading: false, error: null });

    const { getByText } = render(
      <LiveAvatar ownerId="alice" ownerType="user" initials="A" />,
    );

    expect(getByText('A')).toBeTruthy();
  });

  it('does not build a ref when ownerId is missing', () => {
    render(<LiveAvatar ownerId={null} ownerType="user" initials="?" />);
    expect(publicProfileDoc).not.toHaveBeenCalled();
    // ref stays null → hook is called with null (disabled)
    expect(mockUseFirestoreDoc).toHaveBeenCalledWith(null);
  });
});
