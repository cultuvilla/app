import { cardImages, MAX_SYNCED_VILLAGES, PREFETCH_PER_SECTION, syncVillage, villagesToSync } from '../villageSync';

type Listener = { name: string; args: unknown[]; onNext: (v: unknown) => void; onError: (e: Error) => void; closed: boolean };
const mockListeners: Listener[] = [];

function mockFactory(name: string) {
  return (...args: unknown[]) =>
    (onNext: (v: unknown) => void, onError: (e: Error) => void) => {
      const listener: Listener = { name, args, onNext, onError, closed: false };
      mockListeners.push(listener);
      return () => {
        listener.closed = true;
      };
    };
}

jest.mock('../../village/villageHomeWatchers', () => ({
  villageHomeWatchers: {
    municipality: mockFactory('municipality'),
    publicEvents: mockFactory('publicEvents'),
    privateEvents: mockFactory('privateEvents'),
    news: mockFactory('news'),
    festivalPosters: mockFactory('festivalPosters'),
    places: mockFactory('places'),
    barrios: mockFactory('barrios'),
    organizations: mockFactory('organizations'),
    history: mockFactory('history'),
    vocabularyTerms: mockFactory('vocabularyTerms'),
    vocabularyDefinitions: mockFactory('vocabularyDefinitions'),
  },
}));
const mockReportWatchError = jest.fn();
jest.mock('../../firestoreErrorLog', () => ({
  reportWatchError: (...args: unknown[]) => mockReportWatchError(...args),
}));
const mockPick = jest.fn();
jest.mock('@cultuvilla/shared/utils/wordOfTheDay', () => ({
  pickWordOfTheDay: (...args: unknown[]) => mockPick(...args),
}));

const open = (name: string) => mockListeners.filter((l) => l.name === name && !l.closed);
const one = (name: string) => {
  const [l] = open(name);
  if (!l) throw new Error(`${name} is not open`);
  return l;
};

const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/places%2Fp1%2Fphoto.jpg?alt=media&token=t';

beforeEach(() => {
  mockListeners.length = 0;
  mockReportWatchError.mockReset();
  mockPick.mockReset();
});

describe('villagesToSync', () => {
  it('puts the active village first and drops duplicates', () => {
    expect(villagesToSync('b', ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('syncs only member villages when nothing is active', () => {
    expect(villagesToSync(null, ['a'])).toEqual(['a']);
  });

  it('caps the villages kept in sync', () => {
    const many = Array.from({ length: 10 }, (_, i) => `v${i}`);
    expect(villagesToSync(null, many)).toHaveLength(MAX_SYNCED_VILLAGES);
  });
});

describe('cardImages', () => {
  it('asks for the card variant of the first rows only, skipping rows with no image', () => {
    const rows = Array.from({ length: PREFETCH_PER_SECTION + 3 }, (_, i) => ({ img: i === 0 ? null : STORAGE }));
    const urls = cardImages(rows, (r) => r.img);
    expect(urls).toHaveLength(PREFETCH_PER_SECTION - 1);
    expect(urls[0]).toContain('photo_card.webp');
  });

  it('leaves a non-Storage URL as it is', () => {
    expect(cardImages([{ img: 'https://example.com/a.png' }], (r) => r.img)).toEqual(['https://example.com/a.png']);
  });
});

describe('syncVillage', () => {
  it('opens every village-home listener for the village and closes them all', () => {
    const unwatch = syncVillage('m1', ['o1'], jest.fn());
    const names = mockListeners.map((l) => l.name);
    for (const name of [
      'municipality',
      'publicEvents',
      'privateEvents',
      'news',
      'festivalPosters',
      'places',
      'barrios',
      'organizations',
      'history',
      'vocabularyTerms',
    ]) {
      expect(names).toContain(name);
    }
    expect(one('privateEvents').args).toEqual(['m1', ['o1']]);
    expect(one('places').args).toEqual(['m1']);

    unwatch();
    expect(mockListeners.every((l) => l.closed)).toBe(true);
  });

  it('skips the private half when the viewer has no orgs', () => {
    syncVillage('m1', [], jest.fn());
    expect(open('privateEvents')).toHaveLength(0);
  });

  it('prefetches the card images of each scroll as rows arrive', () => {
    const prefetch = jest.fn();
    syncVillage('m1', [], prefetch);
    one('publicEvents').onNext([{ imageURL: null, villageCoverImage: 'https://example.com/cover.png' }]);
    one('history').onNext([{ images: [{ url: 'https://example.com/h.png' }] }]);
    expect(prefetch).toHaveBeenCalledWith(['https://example.com/cover.png']);
    expect(prefetch).toHaveBeenCalledWith(['https://example.com/h.png']);
  });

  it("watches the meanings of today's word only, following the pick", () => {
    syncVillage('m1', [], jest.fn());
    mockPick.mockReturnValue({ id: 't1' });
    one('vocabularyTerms').onNext([{ id: 't1' }]);
    expect(one('vocabularyDefinitions').args).toEqual(['t1']);

    // Same pick: the listener stays.
    one('vocabularyTerms').onNext([{ id: 't1' }, { id: 't2' }]);
    expect(open('vocabularyDefinitions')).toHaveLength(1);

    mockPick.mockReturnValue({ id: 't2' });
    one('vocabularyTerms').onNext([{ id: 't2' }]);
    expect(open('vocabularyDefinitions').map((l) => l.args)).toEqual([['t2']]);
  });

  it('reports a failing listener without touching the others', () => {
    syncVillage('m1', [], jest.fn());
    const error = new Error('boom');
    one('news').onError(error);
    expect(mockReportWatchError).toHaveBeenCalledWith('villageSync:news', error);
    expect(open('places')).toHaveLength(1);
  });
});
