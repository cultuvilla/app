import { useEffect } from 'react';
import { act, render, waitFor, fireEvent } from '@testing-library/react-native';
import { Linking, Text as RNText } from 'react-native';
import { AppVersionGate } from '../AppVersionGate';

type Config = typeof CONFIG;
interface Listener {
  onNext: (config: Config | null) => void;
  onError: (error: Error) => void;
  unwatch: jest.Mock;
}

const listeners: Listener[] = [];
const mockCaptureError = jest.fn();

jest.mock('@cultuvilla/shared', () => {
  const versionGate = jest.requireActual('@cultuvilla/shared/utils/versionGate');
  return {
    watchAppVersionConfig: (onNext: Listener['onNext'], onError: Listener['onError']) => {
      const unwatch = jest.fn();
      listeners.push({ onNext, onError, unwatch });
      return unwatch;
    },
    observability: {
      captureError: (...args: unknown[]) => mockCaptureError(...args),
    },
    // The real decision and cooldown, not stubs: these tests are only worth
    // something if they run the same functions the app runs.
    resolveVersionGate: versionGate.resolveVersionGate,
    shouldPromptUpdate: versionGate.shouldPromptUpdate,
    wallToRemember: versionGate.wallToRemember,
    isBehindRememberedWall: versionGate.isBehindRememberedWall,
  };
});
jest.mock('../../lib/appVersion', () => ({
  getRunningVersion: () => '1.0.0',
  getGatePlatform: () => 'ios',
}));
jest.mock('../../lib/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
const mockMarkAppReady = jest.fn();
jest.mock('../intro/IntroHost', () => ({ useMarkAppReady: () => mockMarkAppReady }));

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStore[k] = v;
    }),
  },
}));

const STORE = {
  ios: 'https://apps.apple.com/app/id1',
  android: 'https://play.example',
};
const config = (minSupported: string, latest: string) => ({
  ios: { minSupported, latest },
  android: { minSupported, latest },
  storeUrl: STORE,
});
const CONFIG = config('0.0.0', '1.0.0');
const UP_TO_DATE = CONFIG;
const NEWER = config('1.0.0', '2.0.0');
const WALL = config('2.0.0', '2.0.0');

const latestListener = () => {
  const l = listeners[listeners.length - 1];
  if (!l) throw new Error('the gate never subscribed to config/appVersion');
  return l;
};
const emit = (c: Config | null) => act(() => latestListener().onNext(c));

beforeEach(() => {
  jest.clearAllMocks();
  listeners.length = 0;
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

const renderGate = () =>
  render(
    <AppVersionGate>
      <RNText>child</RNText>
    </AppVersionGate>,
  );

it('renders children and no modal while the client is up to date', async () => {
  const { getByText, queryByTestId } = renderGate();
  emit(UP_TO_DATE);
  await waitFor(() => expect(getByText('child')).toBeTruthy());
  expect(queryByTestId('app-update-modal')).toBeNull();
});

it('shows a non-dismissible modal when the client is below minSupported', async () => {
  const { getByText, queryByTestId } = renderGate();
  emit(WALL);
  await waitFor(() => expect(getByText('appUpdate.blockTitle')).toBeTruthy());
  // No "later" escape hatch on the hard block.
  expect(queryByTestId('app-update-dismiss')).toBeNull();
  fireEvent.press(getByText('appUpdate.cta'));
  expect(Linking.openURL).toHaveBeenCalledWith(STORE.ios);
});

it('shows a dismissible modal when a newer version is available', async () => {
  const { getByText, getByTestId, queryByText } = renderGate();
  emit(NEWER);
  await waitFor(() => expect(getByText('appUpdate.nudgeTitle')).toBeTruthy());
  expect(getByTestId('app-update-dismiss')).toBeTruthy();
  fireEvent.press(getByText('appUpdate.later'));
  await waitFor(() => expect(queryByText('appUpdate.nudgeTitle')).toBeNull());
});

it('stays quiet on the next launch, inside the cooldown for the same version', async () => {
  const first = renderGate();
  emit(NEWER);
  await waitFor(() => expect(first.getByText('appUpdate.nudgeTitle')).toBeTruthy());
  first.unmount();

  const second = renderGate();
  emit(NEWER);
  await waitFor(() => expect(second.getByText('child')).toBeTruthy());
  expect(second.queryByText('appUpdate.nudgeTitle')).toBeNull();
});

// 1.5.0 read the config once, at launch; its JS SDK timed out on that first
// read and the gate failed open for the whole session. A wall raised while the
// app is open, or answered only after a slow start, must still land.
describe('raises the wall whenever the config arrives, not only at launch', () => {
  it('blocks a session that started up to date once minSupported is raised', async () => {
    const { getByText, queryByText } = renderGate();
    emit(UP_TO_DATE);
    await waitFor(() => expect(getByText('child')).toBeTruthy());
    expect(queryByText('appUpdate.blockTitle')).toBeNull();

    emit(WALL);
    await waitFor(() => expect(getByText('appUpdate.blockTitle')).toBeTruthy());
  });

  it('keeps the nudge cooldown when the same nudge comes back mid-session', async () => {
    const { getByText, queryByText } = renderGate();
    emit(NEWER);
    await waitFor(() => expect(getByText('appUpdate.nudgeTitle')).toBeTruthy());
    emit(UP_TO_DATE);
    await waitFor(() => expect(queryByText('appUpdate.nudgeTitle')).toBeNull());
    emit(NEWER);
    await act(async () => {});
    expect(queryByText('appUpdate.nudgeTitle')).toBeNull();
  });

  it('shows nothing until the first answer, then blocks on it', async () => {
    const { getByText, queryByTestId } = renderGate();
    expect(queryByTestId('app-update-modal')).toBeNull();
    emit(WALL);
    await waitFor(() => expect(getByText('appUpdate.blockTitle')).toBeTruthy());
  });

  it('stops listening on unmount', () => {
    const { unmount } = renderGate();
    unmount();
    expect(latestListener().unwatch).toHaveBeenCalledTimes(1);
  });
});

describe('a gate that cannot read its config says so', () => {
  it('reports the read error instead of failing open silently', async () => {
    const { getByText } = renderGate();
    const error = new Error('unavailable');
    act(() => latestListener().onError(error));
    await waitFor(() => expect(getByText('child')).toBeTruthy());
    expect(mockCaptureError).toHaveBeenCalledWith(error, {
      operation: 'appVersionGate:watch',
    });
  });

  it('keeps a wall it already raised when the listener then fails', async () => {
    const { getByText } = renderGate();
    emit(WALL);
    await waitFor(() => expect(getByText('appUpdate.blockTitle')).toBeTruthy());
    act(() => latestListener().onError(new Error('permission-denied')));
    expect(getByText('appUpdate.blockTitle')).toBeTruthy();
  });

  it('reports a missing config doc', async () => {
    renderGate();
    emit(null);
    await waitFor(() =>
      expect(mockCaptureError).toHaveBeenCalledWith(expect.any(Error), {
        operation: 'appVersionGate:missing',
      }),
    );
  });
});

// Órdago 2026-10-02: walled clients kept crashing because the navigator stayed
// mounted under the blocker, so a notification tap still reached a screen. A
// hard wall must leave no route, provider or listener of the app running.
describe('a hard wall replaces the app tree', () => {
  const attach = jest.fn();
  const detach = jest.fn();
  function Listener() {
    useEffect(() => {
      attach();
      return detach;
    }, []);
    return <RNText>child</RNText>;
  }
  const renderWithListener = () =>
    render(
      <AppVersionGate>
        <Listener />
      </AppVersionGate>,
    );

  it('mounts nothing of the app when the first answer is a wall', async () => {
    attach.mockClear();
    detach.mockClear();
    const { getByText, queryByText, getByTestId } = renderWithListener();
    emit(WALL);
    await waitFor(() => expect(getByText('appUpdate.blockTitle')).toBeTruthy());
    expect(queryByText('child')).toBeNull();
    expect(getByTestId('app-update-modal')).toBeTruthy();
    // Mounted only for the load window, then torn down with its listener.
    expect(detach).toHaveBeenCalledTimes(attach.mock.calls.length);
  });

  it('unmounts the running app, listeners included, when a wall is raised mid-session', async () => {
    attach.mockClear();
    detach.mockClear();
    const { getByText, queryByText } = renderWithListener();
    emit(UP_TO_DATE);
    await waitFor(() => expect(getByText('child')).toBeTruthy());
    expect(attach).toHaveBeenCalledTimes(1);
    expect(detach).not.toHaveBeenCalled();

    emit(WALL);
    await waitFor(() => expect(getByText('appUpdate.blockTitle')).toBeTruthy());
    expect(queryByText('child')).toBeNull();
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('remounts the app when the wall is lowered', async () => {
    const { getByText, queryByText } = renderWithListener();
    emit(WALL);
    await waitFor(() => expect(getByText('appUpdate.blockTitle')).toBeTruthy());
    emit(UP_TO_DATE);
    await waitFor(() => expect(getByText('child')).toBeTruthy());
    expect(queryByText('appUpdate.blockTitle')).toBeNull();
  });

  it('hands the intro over to the blocker, since no route will mark the app ready', async () => {
    const { getByText } = renderGate();
    emit(WALL);
    await waitFor(() => expect(getByText('appUpdate.blockTitle')).toBeTruthy());
    expect(mockMarkAppReady).toHaveBeenCalled();
  });

  it('keeps the app mounted under the soft nudge', async () => {
    const { getByText } = renderGate();
    emit(NEWER);
    await waitFor(() => expect(getByText('appUpdate.nudgeTitle')).toBeTruthy());
    expect(getByText('child')).toBeTruthy();
    expect(mockMarkAppReady).not.toHaveBeenCalled();
  });
});

// Órdago e29141a99: the wall was decided from the network alone, so a walled
// binary ran until the config read landed — and forever offline, or once
// sign-out had wiped Firestore's cache. The last wall is remembered on device.
describe('remembers the last wall across launches', () => {
  const WALL_KEY = 'cultuvilla:appUpdate:wall';
  const remember = (minSupported: string) => {
    mockStore[WALL_KEY] = JSON.stringify({ minSupported, storeUrl: STORE.ios });
  };

  it('blocks at cold start from the remembered wall before the config answers', async () => {
    remember('2.0.0');
    const { getByText, queryByText } = renderGate();
    await waitFor(() => expect(getByText('appUpdate.blockTitle')).toBeTruthy());
    expect(queryByText('child')).toBeNull();
    fireEvent.press(getByText('appUpdate.cta'));
    expect(Linking.openURL).toHaveBeenCalledWith(STORE.ios);
  });

  it('never mounts the app before the remembered wall is read', () => {
    remember('2.0.0');
    const { queryByText } = renderGate();
    expect(queryByText('child')).toBeNull();
  });

  it('keeps blocking when the config doc is missing or the listener fails', async () => {
    remember('2.0.0');
    const missing = renderGate();
    emit(null);
    await waitFor(() => expect(missing.getByText('appUpdate.blockTitle')).toBeTruthy());
    missing.unmount();

    const failed = renderGate();
    act(() => latestListener().onError(new Error('unavailable')));
    await waitFor(() => expect(failed.getByText('appUpdate.blockTitle')).toBeTruthy());
  });

  it('lets a fresh answer lower the wall, and forgets it', async () => {
    remember('2.0.0');
    const { getByText } = renderGate();
    await waitFor(() => expect(getByText('appUpdate.blockTitle')).toBeTruthy());
    emit(UP_TO_DATE);
    await waitFor(() => expect(getByText('child')).toBeTruthy());
    expect(JSON.parse(mockStore[WALL_KEY] ?? 'null')).toEqual({
      minSupported: '0.0.0',
      storeUrl: STORE.ios,
    });
  });

  it('remembers a wall the config raises', async () => {
    const { getByText } = renderGate();
    emit(WALL);
    await waitFor(() => expect(getByText('appUpdate.blockTitle')).toBeTruthy());
    expect(JSON.parse(mockStore[WALL_KEY] ?? 'null')).toEqual({
      minSupported: '2.0.0',
      storeUrl: STORE.ios,
    });
  });

  it('runs the app when the remembered wall is below the running version', async () => {
    remember('0.5.0');
    const { getByText } = renderGate();
    await waitFor(() => expect(getByText('child')).toBeTruthy());
  });

  it('ignores a corrupt record', async () => {
    mockStore[WALL_KEY] = '{not json';
    const { getByText } = renderGate();
    await waitFor(() => expect(getByText('child')).toBeTruthy());
  });
});
