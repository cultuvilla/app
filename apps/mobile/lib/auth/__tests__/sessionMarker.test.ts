import AsyncStorage from '@react-native-async-storage/async-storage';
import { observability } from '@cultuvilla/shared';
import { clearSessionMarker, markSessionOpen, reportIfSessionLost } from '../sessionMarker';

describe('sessionMarker', () => {
  let capture: jest.SpyInstance;

  beforeEach(async () => {
    await AsyncStorage.clear();
    capture = jest.spyOn(observability, 'captureError').mockImplementation(() => undefined);
  });
  afterEach(() => capture.mockRestore());

  it('reports a session that ended without a sign-out, once', async () => {
    await markSessionOpen(['google.com']);

    await reportIfSessionLost();
    await reportIfSessionLost();

    expect(capture).toHaveBeenCalledTimes(1);
    const [error, context] = capture.mock.calls[0];
    expect(error.name).toBe('SessionLost');
    expect(error.message).toContain('google.com');
    expect(context).toEqual({ operation: 'auth:sessionLost' });
  });

  it('stays quiet after a deliberate sign-out', async () => {
    await markSessionOpen(['google.com']);
    await clearSessionMarker();

    await reportIfSessionLost();

    expect(capture).not.toHaveBeenCalled();
  });

  it('stays quiet for someone who was never signed in', async () => {
    await reportIfSessionLost();

    expect(capture).not.toHaveBeenCalled();
  });
});
