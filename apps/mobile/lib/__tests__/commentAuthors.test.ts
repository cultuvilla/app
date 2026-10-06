import { resolveCommentAuthor } from '../comments/commentAuthors';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';

jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonByUserId: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/userService', () => ({
  getPublicProfile: jest.fn(),
}));
jest.mock('../firestoreErrorLog', () => ({
  withFirestoreErrorLog: (_label: string, op: () => Promise<unknown>) => op(),
}));

const getPersonByUserIdMock = getPersonByUserId as jest.Mock;
const getPublicProfileMock = getPublicProfile as jest.Mock;

const LABELS = { deleted: 'Usuario eliminado', fallback: 'Usuario' };

const PERSON = {
  id: 'p-1',
  givenName: 'Ana',
  middleNames: [],
  firstSurname: 'Gil',
  secondSurname: null,
  photoURL: 'https://cdn.test/ana.jpg',
};

describe('resolveCommentAuthor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPersonByUserIdMock.mockResolvedValue(null);
    getPublicProfileMock.mockResolvedValue(null);
  });

  it('prefers the live person name and photo', async () => {
    getPersonByUserIdMock.mockResolvedValue(PERSON);
    getPublicProfileMock.mockResolvedValue({ id: 'uid-2', displayName: 'Nombre viejo' });

    expect(await resolveCommentAuthor('uid-2', LABELS)).toEqual({
      name: 'Ana Gil',
      photoURL: 'https://cdn.test/ana.jpg',
    });
  });

  it('falls back to the denormalized users/{uid} name when the persons query is denied', async () => {
    // The persons read rule is per-document, so one private persona matching
    // `userId == uid` denies the whole query for this viewer.
    getPersonByUserIdMock.mockRejectedValue(
      Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      }),
    );
    getPublicProfileMock.mockResolvedValue({ id: 'uid-2', displayName: 'Bea Ruiz' });

    expect(await resolveCommentAuthor('uid-2', LABELS)).toEqual({
      name: 'Bea Ruiz',
      photoURL: null,
    });
  });

  it('keeps the person name and photo when only the user profile read fails', async () => {
    getPersonByUserIdMock.mockResolvedValue(PERSON);
    getPublicProfileMock.mockRejectedValue(new Error('offline'));

    expect(await resolveCommentAuthor('uid-2', LABELS)).toEqual({
      name: 'Ana Gil',
      photoURL: 'https://cdn.test/ana.jpg',
    });
  });

  it('ignores a person whose name fields are all blank', async () => {
    getPersonByUserIdMock.mockResolvedValue({
      ...PERSON,
      givenName: '',
      firstSurname: '',
      photoURL: null,
    });
    getPublicProfileMock.mockResolvedValue({ id: 'uid-2', displayName: 'Bea Ruiz' });

    expect((await resolveCommentAuthor('uid-2', LABELS)).name).toBe('Bea Ruiz');
  });

  it('ignores a blank denormalized display name', async () => {
    getPublicProfileMock.mockResolvedValue({ id: 'uid-2', displayName: '  ' });

    expect((await resolveCommentAuthor('uid-2', LABELS)).name).toBe('Usuario');
  });

  it('never rejects, even when both sources fail', async () => {
    getPersonByUserIdMock.mockRejectedValue(new Error('boom'));
    getPublicProfileMock.mockRejectedValue(new Error('boom'));

    expect(await resolveCommentAuthor('uid-2', LABELS)).toEqual({
      name: 'Usuario',
      photoURL: null,
    });
  });

  it('names a deleted account without touching Firestore', async () => {
    expect(await resolveCommentAuthor('deleted-user', LABELS)).toEqual({
      name: 'Usuario eliminado',
      photoURL: null,
    });
    expect(getPersonByUserIdMock).not.toHaveBeenCalled();
    expect(getPublicProfileMock).not.toHaveBeenCalled();
  });
});
