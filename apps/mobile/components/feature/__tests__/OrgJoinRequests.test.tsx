import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { buildOrgJoinRequestData } from '@cultuvilla/shared/models/organization/OrgJoinRequestDataModel';
import { OrgJoinRequests } from '../OrgJoinRequests';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockGetPending = jest.fn();
const mockRespond = jest.fn();
jest.mock('@cultuvilla/shared/services/orgJoinRequestService', () => ({
  getPendingOrgJoinRequests: (...a: unknown[]) => mockGetPending(...a),
  respondToOrgJoinRequest: (...a: unknown[]) => mockRespond(...a),
}));

const mockGetPerson = jest.fn();
jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonByUserId: (...a: unknown[]) => mockGetPerson(...a),
}));

const mockShowAlert = jest.fn();
jest.mock('../../../lib/dialogs', () => ({
  showAlert: (...a: unknown[]) => mockShowAlert(...a),
}));

jest.mock('../../../lib/i18n', () => ({
  useT: () => ({
    t: (key: string) =>
      ({
        'organization.joinRequests.title': 'Solicitudes para unirse',
        'organization.joinRequests.wantsToJoin': 'quiere unirse',
        'organization.joinRequests.approve': 'Aceptar',
        'organization.joinRequests.reject': 'Rechazar',
      })[key] ?? key,
  }),
}));

const ORG = 'org-1';
const request = (userId: string) => buildOrgJoinRequestData({ userId, orgId: ORG, municipalityId: 'm1' });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPerson.mockResolvedValue(null);
});

// The org-side half of the `approval` join policy (docs/decisions/org-join-policy.md):
// an admin sees who is waiting and admits or turns them away through the
// audited callable — never by writing the member doc.
describe('OrgJoinRequests', () => {
  it('renders nothing when nobody is waiting', async () => {
    mockGetPending.mockResolvedValue([]);
    render(<OrgJoinRequests orgId={ORG} />);
    await waitFor(() => expect(mockGetPending).toHaveBeenCalledWith(ORG));
    expect(screen.queryByText('Solicitudes para unirse')).toBeNull();
  });

  it('lists each requester by their persona name, falling back to the uid for a private one', async () => {
    mockGetPending.mockResolvedValue([request('u-ana'), request('u-hidden')]);
    mockGetPerson.mockImplementation((uid: string) =>
      Promise.resolve(uid === 'u-ana' ? { givenName: 'Ana', middleNames: [], firstSurname: 'Ruiz', secondSurname: null, photoURL: null } : null),
    );
    render(<OrgJoinRequests orgId={ORG} />);
    expect(await screen.findByText('Solicitudes para unirse')).toBeTruthy();
    expect(await screen.findByText('Ana Ruiz')).toBeTruthy();
    expect(screen.getByText('u-hidden')).toBeTruthy();
  });

  it('admits through the callable, then reloads and tells the screen', async () => {
    mockGetPending.mockResolvedValueOnce([request('u-ana')]).mockResolvedValueOnce([]);
    mockRespond.mockResolvedValue(undefined);
    const onResolved = jest.fn();
    render(<OrgJoinRequests orgId={ORG} onResolved={onResolved} />);

    fireEvent.press(await screen.findByTestId(`approve-join-${ORG}-u-ana`));

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(mockRespond).toHaveBeenCalledWith(ORG, 'u-ana', 'approved');
    expect(screen.queryByText('Solicitudes para unirse')).toBeNull();
  });

  it('turns a requester away with the rejected decision', async () => {
    mockGetPending.mockResolvedValueOnce([request('u-ana')]).mockResolvedValueOnce([]);
    mockRespond.mockResolvedValue(undefined);
    render(<OrgJoinRequests orgId={ORG} />);

    fireEvent.press(await screen.findByText('Rechazar'));

    await waitFor(() => expect(mockRespond).toHaveBeenCalledWith(ORG, 'u-ana', 'rejected'));
  });

  it('keeps the request listed and says why when the callable refuses', async () => {
    mockGetPending.mockResolvedValue([request('u-ana')]);
    mockRespond.mockRejectedValue(new Error('Ya no administras esta entidad.'));
    const onResolved = jest.fn();
    render(<OrgJoinRequests orgId={ORG} onResolved={onResolved} />);

    fireEvent.press(await screen.findByTestId(`approve-join-${ORG}-u-ana`));

    await waitFor(() => expect(mockShowAlert).toHaveBeenCalledWith('Ya no administras esta entidad.'));
    expect(onResolved).not.toHaveBeenCalled();
    expect(screen.getByTestId(`approve-join-${ORG}-u-ana`)).toBeTruthy();
  });
});
