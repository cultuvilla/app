import { render, waitFor } from '@testing-library/react-native';

const mockGetInitialURL = jest.fn();
const mockAddEventListener = jest.fn();
const mockRemove = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-linking', () => ({
  __esModule: true,
  getInitialURL: () => mockGetInitialURL(),
  addEventListener: (event: string, handler: (e: { url: string }) => void) => {
    mockAddEventListener(event, handler);
    return { remove: mockRemove };
  },
}));

jest.mock('expo-router', () => ({
  router: { replace: (path: string) => mockReplace(path) },
}));

const mockTrackEvent = jest.fn();
jest.mock('@cultuvilla/shared', () => ({
  ...jest.requireActual('@cultuvilla/shared'),
  observability: { trackEvent: (...args: unknown[]) => mockTrackEvent(...args) },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { deepLinkHost: 'example.test.app' } } },
}));

import { useDeepLinkRouter } from '../useDeepLinkRouter';

function Probe(): null {
  useDeepLinkRouter();
  return null;
}

describe('useDeepLinkRouter', () => {
  beforeEach(() => {
    mockGetInitialURL.mockReset();
    mockAddEventListener.mockReset();
    mockRemove.mockReset();
    mockReplace.mockReset();
    mockTrackEvent.mockReset();
  });

  it('records a cold-start link open with what it points at', async () => {
    mockGetInitialURL.mockResolvedValueOnce('https://example.test.app/villa/evento/fiesta_evt_1');
    render(<Probe />);
    await waitFor(() =>
      expect(mockTrackEvent).toHaveBeenCalledWith('app.link.opened', {
        entityKind: 'event',
        viaInvite: false,
        surface: 'cold_start',
      }),
    );
  });

  it('records a link opened while running, flagging invites', async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    render(<Probe />);
    await waitFor(() => expect(mockAddEventListener).toHaveBeenCalled());
    const handler = mockAddEventListener.mock.calls[0][1] as (e: { url: string }) => void;
    handler({ url: 'https://example.test.app/villa/entidad/pena_org_5/unirse' });
    expect(mockTrackEvent).toHaveBeenCalledWith('app.link.opened', {
      entityKind: 'organization',
      viaInvite: true,
      surface: 'running',
    });
  });

  it('does not record a link it does not route', async () => {
    mockGetInitialURL.mockResolvedValueOnce('https://example.test.app/villa/unknown/x');
    render(<Probe />);
    await waitFor(() => expect(mockAddEventListener).toHaveBeenCalled());
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('routes the initial URL when present (event)', async () => {
    mockGetInitialURL.mockResolvedValueOnce('https://example.test.app/villa/evento/fiesta_evt_1');
    render(<Probe />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/villa/evento/fiesta_evt_1'));
  });

  it('routes an organization URL to its village-scoped entidad route', async () => {
    mockGetInitialURL.mockResolvedValueOnce('https://example.test.app/villa/entidad/pena_org_1');
    render(<Probe />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/villa/entidad/pena_org_1'));
  });

  it('routes a cultuvilla:// scheme link the same as its https form', async () => {
    mockGetInitialURL.mockResolvedValueOnce('cultuvilla://villa/noticia/bando_n_1');
    render(<Probe />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/villa/noticia/bando_n_1'));
  });

  it('routes a seat-claim URL to its event plaza route without an intent query', async () => {
    mockGetInitialURL.mockResolvedValueOnce(
      'https://example.test.app/villa/evento/fiesta_evt_1/plaza/tok_1',
    );
    render(<Probe />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/villa/evento/fiesta_evt_1/plaza/tok_1'),
    );
  });

  it('routes a user profile URL', async () => {
    mockGetInitialURL.mockResolvedValueOnce('https://example.test.app/usuario/u_1');
    render(<Probe />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/usuario/u_1'));
  });

  it('routes a runtime URL event', async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    render(<Probe />);
    await waitFor(() => expect(mockAddEventListener).toHaveBeenCalled());
    const handler = mockAddEventListener.mock.calls[0][1] as (e: { url: string }) => void;
    handler({ url: 'https://example.test.app/matabuena' });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/matabuena'));
  });

  it('routes a nested place URL to its village-scoped route', async () => {
    mockGetInitialURL.mockResolvedValueOnce(
      'https://example.test.app/villa/lugar/ermita_place_2',
    );
    render(<Probe />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/villa/lugar/ermita_place_2'),
    );
  });

  it('routes a nested barrio URL to its village-scoped route', async () => {
    mockGetInitialURL.mockResolvedValueOnce(
      'https://example.test.app/villa/barrio/arriba_barrio_2',
    );
    render(<Probe />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/villa/barrio/arriba_barrio_2'),
    );
  });

  it('ignores unknown URLs', async () => {
    mockGetInitialURL.mockResolvedValueOnce('https://example.test.app/villa/unknown/x');
    render(<Probe />);
    await waitFor(() => expect(mockAddEventListener).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // The `/unirse` route adds the join intent itself; the router only replays the path.
  it('routes an org invite URL to its /unirse route', async () => {
    mockGetInitialURL.mockResolvedValueOnce('https://example.test.app/villa/entidad/pena_org_5/unirse');
    render(<Probe />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/villa/entidad/pena_org_5/unirse'),
    );
  });

  it('unsubscribes on unmount', async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    const { unmount } = render(<Probe />);
    await waitFor(() => expect(mockAddEventListener).toHaveBeenCalled());
    unmount();
    expect(mockRemove).toHaveBeenCalled();
  });
});
