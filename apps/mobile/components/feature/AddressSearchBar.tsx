import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from 'react-native';
import { TEXT_SCALING } from '../../lib/text/textScaling';
import { Ionicons } from '@expo/vector-icons';
import { colors, elevation } from '@cultuvilla/shared/design-system';
import { geocodeSearch, type GeocodePlace } from '@cultuvilla/shared/services/mapsService';
import { Pressable, Text } from '../primitives';
import { useT } from '../../lib/i18n';

/**
 * Short enough that a pause between words already feels like a search, long
 * enough not to fire a geocode per keystroke.
 */
const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

/**
 * What the dropdown is showing. `idle` is the only state that renders nothing:
 * every other outcome — including "the request failed" — is visible, so an
 * empty box never has to be guessed at.
 */
type SearchStatus = 'idle' | 'searching' | 'results' | 'empty' | 'error';

/**
 * The map picker's floating search field — a port of ordago-apps'
 * PlacesSearchBar over our server-side `geocodeSearch` proxy instead of a
 * client Places key.
 */
export function AddressSearchBar({
  placeholder,
  listViewDisplayed,
  onPlaceSelected,
  onFocus,
  onBlur,
}: {
  placeholder: string;
  /** The parent owns whether the suggestion list is allowed to show. */
  listViewDisplayed: boolean;
  onPlaceSelected: (place: GeocodePlace) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const { t } = useT();
  const [results, setResults] = useState<GeocodePlace[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  /** The text the visible results belong to, so "sin resultados" can name it. */
  const [searchedQuery, setSearchedQuery] = useState('');
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<TextInput>(null);
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSearchedRef = useRef('');
  /** Guards against a slow earlier request landing on top of a newer one. */
  const requestSeqRef = useRef(0);

  // Derived, not mirrored into state, so parent and child can never disagree.
  const showList = listViewDisplayed && status !== 'idle';

  const fetchResults = useCallback(async (query: string) => {
    const seq = ++requestSeqRef.current;
    setStatus('searching');
    setSearchedQuery(query);
    try {
      const found = await geocodeSearch(query);
      if (seq !== requestSeqRef.current) return;
      setResults(found);
      setStatus(found.length > 0 ? 'results' : 'empty');
    } catch {
      if (seq !== requestSeqRef.current) return;
      setResults([]);
      setStatus('error');
      // Let the same text be retried — the failure was the request, not the query.
      lastSearchedRef.current = '';
    }
  }, []);

  const triggerSearch = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setResults([]);
        setStatus('idle');
        lastSearchedRef.current = '';
        return;
      }
      if (trimmed === lastSearchedRef.current) return;
      lastSearchedRef.current = trimmed;
      void fetchResults(trimmed);
    },
    [fetchResults],
  );

  const handleTextChange = useCallback(
    (text: string) => {
      setInputValue(text);
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
      // Any edit retires the search in flight: its results answer a query the
      // field no longer holds, and must not land after this text is cleared.
      requestSeqRef.current++;
      lastSearchedRef.current = '';
      // "Buscando" from the first keystroke rather than after the debounce, so a
      // slow search never looks like a dead input.
      const trimmed = text.trim();
      if (trimmed.length >= MIN_QUERY_LENGTH && trimmed !== lastSearchedRef.current) {
        setStatus('searching');
      }
      stableTimerRef.current = setTimeout(() => triggerSearch(text), SEARCH_DEBOUNCE_MS);
    },
    [triggerSearch],
  );

  useEffect(() => {
    return () => {
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
    };
  }, []);

  const handleSelect = useCallback(
    (place: GeocodePlace) => {
      inputRef.current?.blur();
      setResults([]);
      setStatus('idle');
      onPlaceSelected(place);
    },
    [onPlaceSelected],
  );

  const handleBlur = useCallback(() => {
    // Delay hiding the list so a tap on a suggestion still lands.
    setTimeout(() => onBlur?.(), 200);
  }, [onBlur]);

  return (
    <View style={styles.container} testID="address-search-bar">
      <View style={styles.inputContainer}>
        <TextInput {...TEXT_SCALING.body}
          ref={inputRef}
          style={styles.input}
          placeholder={placeholder}
          value={inputValue}
          onChangeText={handleTextChange}
          onFocus={onFocus}
          onBlur={handleBlur}
          placeholderTextColor={colors.light.fg.quiet}
          testID="address-search-input"
        />
        <Pressable
          style={styles.searchButton}
          onPress={() => triggerSearch(inputValue)}
          accessibilityRole="button"
          accessibilityLabel={t('event.searchAddress')}
        >
          <Ionicons name="search" size={18} color={colors.light.fg.icon} />
        </Pressable>
        {status === 'searching' && !showList ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={ACCENT} />
          </View>
        ) : null}
      </View>

      {showList ? (
        <View style={styles.list} testID="address-search-dropdown">
          {status === 'searching' ? (
            <View style={styles.stateRow} testID="address-search-searching">
              <ActivityIndicator size="small" color={ACCENT} />
              <Text style={styles.stateText}>{t('event.searchingAddresses')}</Text>
            </View>
          ) : null}

          {status === 'empty' ? (
            <View style={styles.stateRow} testID="address-search-empty">
              <Ionicons name="search-outline" size={16} color={MUTED} />
              <Text style={styles.stateText} numberOfLines={2}>
                {t('event.noAddressResults', { query: searchedQuery })}
              </Text>
            </View>
          ) : null}

          {status === 'error' ? (
            <Pressable
              style={styles.stateRow}
              testID="address-search-error"
              onPress={() => triggerSearch(inputValue)}
            >
              <Ionicons name="alert-circle-outline" size={16} color={DANGER} />
              <Text style={[styles.stateText, styles.stateTextError]}>
                {t('event.addressSearchFailed')}
              </Text>
            </Pressable>
          ) : null}

          {status === 'results' ? (
            <FlatList
              data={results}
              keyExtractor={(item) => `${item.lat},${item.lng}`}
              style={{ maxHeight: Math.min(results.length * 52 + 8, 300) }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              renderItem={({ item }) => (
                <Pressable
                  style={styles.listItem}
                  onPress={() => handleSelect(item)}
                  testID="address-search-result"
                >
                  <Text style={styles.listItemText} numberOfLines={2}>
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const ACCENT = colors.light.fg.accent;
const MUTED = colors.light.fg.icon;
const DANGER = colors.light.fg.danger;

const styles = StyleSheet.create({
  // NO `flex: 1` here. It expands to `flexBasis: 0%`, and this view is a column
  // flex item, so its parent would size itself from that zero basis and collapse
  // to nothing — taking the in-flow dropdown's height with it.
  container: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 0,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  input: {
    flex: 1,
    height: 44,
    color: colors.light.fg.strong,
    fontSize: 16,
    backgroundColor: colors.light.bg.muted,
    borderRadius: 8,
    paddingLeft: 10,
    paddingRight: 40,
  },
  searchButton: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.light.bg.placeholder,
  },
  loadingContainer: {
    position: 'absolute',
    right: 46,
    top: 12,
  },
  // In normal flow, NOT absolutely positioned: on Android a child laid out
  // beyond its parent's bounds still draws but never receives touches. Keeping
  // the dropdown inside the search bar's own box keeps every suggestion tappable.
  list: {
    marginTop: 6,
    backgroundColor: 'white',
    borderRadius: 8,
    elevation: 5,
    shadowColor: elevation.md.rn.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  stateText: {
    flex: 1,
    fontSize: 13,
    color: MUTED,
  },
  stateTextError: {
    color: DANGER,
  },
  listItem: {
    padding: 12,
    minHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border.divider,
  },
  listItemText: {
    fontSize: 14,
    color: colors.light.fg.strong,
    fontWeight: '500',
  },
});
