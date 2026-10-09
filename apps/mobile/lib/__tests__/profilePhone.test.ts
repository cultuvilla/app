import { patchUserProfile } from '@cultuvilla/shared/services/userService';
import { observability } from '@cultuvilla/shared';
import { DEFAULT_PHONE_COUNTRY } from '@cultuvilla/shared/utils';
import { initialPhone, rememberProfilePhone } from '../profilePhone';

jest.mock('@cultuvilla/shared/services/userService', () => ({ patchUserProfile: jest.fn() }));
jest.mock('@cultuvilla/shared', () => ({
  ...jest.requireActual('@cultuvilla/shared'),
  observability: { captureError: jest.fn() },
}));

const mockPatch = patchUserProfile as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('initialPhone', () => {
  it('starts empty on the default prefix when nothing is saved', () => {
    expect(initialPhone(null)).toEqual({ country: DEFAULT_PHONE_COUNTRY, national: '' });
    expect(initialPhone(undefined)).toEqual({ country: DEFAULT_PHONE_COUNTRY, national: '' });
  });

  it('splits a saved E.164 number into its prefix and national part', () => {
    const seed = initialPhone('+33612345678');
    expect(seed.country.dialCode).toBe('+33');
    expect(seed.national).toBe('612345678');
  });
});

describe('rememberProfilePhone', () => {
  it('saves a new phone to the profile and then reports it', async () => {
    mockPatch.mockResolvedValue(undefined);
    const onSaved = jest.fn();
    await rememberProfilePhone('u1', null, '+34600111222', onSaved);
    expect(mockPatch).toHaveBeenCalledWith('u1', { telephone: '+34600111222' });
    expect(onSaved).toHaveBeenCalled();
  });

  it('writes nothing when the phone is unchanged or was not asked for', async () => {
    await rememberProfilePhone('u1', '+34600111222', '+34600111222');
    await rememberProfilePhone('u1', '+34600111222', undefined);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('swallows a failed save so a confirmed sign-up never errors', async () => {
    mockPatch.mockRejectedValue(new Error('denied'));
    const onSaved = jest.fn();
    await expect(rememberProfilePhone('u1', null, '+34600111222', onSaved)).resolves.toBeUndefined();
    expect(onSaved).not.toHaveBeenCalled();
    expect(observability.captureError).toHaveBeenCalled();
  });
});
