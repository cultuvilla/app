import { classifyCallableError, observability } from '@cultuvilla/shared';
import { reportActionError } from '../reportActionError';

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

function report(operation: string, error: unknown) {
  reportActionError(operation, error, classifyCallableError(error));
}

describe('reportActionError', () => {
  beforeEach(() => captureError.mockClear());

  it('reports the storage refusal that broke every event cover (2026-10-07)', () => {
    const err = withCode('User does not have permission', 'storage/unauthorized');
    report('event:create', err);
    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError.mock.calls[0]).toEqual([err, { operation: 'event:create', surface: 'action' }]);
  });

  it('reports a Firestore rule refusal from either SDK', () => {
    report('event:create', withCode('Missing or insufficient permissions.', 'permission-denied'));
    report('event:create', withCode('[firestore/permission-denied] denied', 'firestore/permission-denied'));
    expect(captureError).toHaveBeenCalledTimes(2);
  });

  it('reports an error nothing recognises', () => {
    report('news:create', new Error('boom'));
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it('stays silent on outcomes the alert already explains', () => {
    report('event:register', withCode('El evento está lleno', 'resource-exhausted'));
    report('event:update', withCode('stale', 'failed-precondition'));
    report('event:create', withCode('offline', 'unavailable'));
    expect(captureError).not.toHaveBeenCalled();
  });
});
