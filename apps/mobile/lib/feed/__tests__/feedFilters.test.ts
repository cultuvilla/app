import { hasActiveFeedFilter, type FeedFilterState } from '../feedFilters';

const none: FeedFilterState = { search: '', villageId: null, date: null, category: null };

describe('hasActiveFeedFilter', () => {
  it('is false with nothing set, on either tab', () => {
    expect(hasActiveFeedFilter('eventos', none)).toBe(false);
    expect(hasActiveFeedFilter('noticias', none)).toBe(false);
  });

  it('ignores a search of only spaces', () => {
    expect(hasActiveFeedFilter('eventos', { ...none, search: '   ' })).toBe(false);
  });

  it('counts the search and the village on both tabs', () => {
    expect(hasActiveFeedFilter('eventos', { ...none, search: 'fiesta' })).toBe(true);
    expect(hasActiveFeedFilter('noticias', { ...none, search: 'fiesta' })).toBe(true);
    expect(hasActiveFeedFilter('eventos', { ...none, villageId: 'mun1' })).toBe(true);
    expect(hasActiveFeedFilter('noticias', { ...none, villageId: 'mun1' })).toBe(true);
  });

  it('counts the date only on events, and the category only on news', () => {
    expect(hasActiveFeedFilter('eventos', { ...none, date: 'hoy' })).toBe(true);
    expect(hasActiveFeedFilter('noticias', { ...none, date: 'hoy' })).toBe(false);
    expect(hasActiveFeedFilter('noticias', { ...none, category: 'fiesta' })).toBe(true);
    expect(hasActiveFeedFilter('eventos', { ...none, category: 'fiesta' })).toBe(false);
  });
});
