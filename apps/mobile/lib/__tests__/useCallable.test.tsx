import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { observability } from '@cultuvilla/shared';
import { useCallable } from '../useCallable';

jest.mock('@cultuvilla/shared', () => ({
  ...jest.requireActual('@cultuvilla/shared'),
  observability: { captureError: jest.fn() },
}));

const captureError = observability.captureError as jest.Mock;

function withCode(message: string, code: string): Error {
  const e = new Error(message) as Error & { code?: string };
  e.code = code;
  return e;
}

describe('useCallable error reporting', () => {
  beforeEach(() => {
    captureError.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('reports a refused action with its operation and still shows the alert', async () => {
    const err = withCode('User does not have permission', 'storage/unauthorized');
    const { result } = renderHook(() =>
      useCallable({ operation: 'event:create', callable: () => Promise.reject(err), swallow: true }),
    );
    await act(async () => {
      await result.current.fire();
    });
    expect(captureError).toHaveBeenCalledWith(err, { operation: 'event:create', surface: 'action' });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it('names an unlabelled action generically', async () => {
    const err = new Error('boom');
    const { result } = renderHook(() => useCallable({ callable: () => Promise.reject(err), swallow: true }));
    await act(async () => {
      await result.current.fire();
    });
    expect(captureError).toHaveBeenCalledWith(err, { operation: 'action', surface: 'action' });
  });

  it('lets errorOptions override the operation', async () => {
    const err = new Error('boom');
    const { result } = renderHook(() =>
      useCallable({
        operation: 'event:create',
        errorOptions: () => ({ operation: 'event:cover' }),
        callable: () => Promise.reject(err),
        swallow: true,
      }),
    );
    await act(async () => {
      await result.current.fire();
    });
    expect(captureError).toHaveBeenCalledWith(err, { operation: 'event:cover', surface: 'action' });
  });

  it('reports nothing when the action succeeds', async () => {
    const { result } = renderHook(() => useCallable({ operation: 'event:create', callable: () => Promise.resolve(1) }));
    await act(async () => {
      await result.current.fire();
    });
    expect(captureError).not.toHaveBeenCalled();
  });
});
