// apps/mobile/components/feature/LocationPicker.tsx
import { useEffect, useReducer } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, Text, Input, Button, Pressable } from '../primitives';
import { useT } from '../../lib/i18n';
import { showAlert } from '../../lib/dialogs';
import {
  geocodeSearch,
  reverseGeocode,
  staticMapUrl,
  clampMapZoom,
  MAP_ZOOM_MIN,
  MAP_ZOOM_MAX,
  MAP_ZOOM_STEP,
} from '@cultuvilla/shared/services/mapsService';
import type { LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';
import { initialLocationState, locationReducer } from './locationPickerState';

const ACCENT = '#bb5d3a';

export function LocationPicker({
  value,
  valueLabel,
  onChange,
  zoom,
  onZoomChange,
  label,
  showUseMyLocation = true,
  showPreview = true,
  testID,
}: {
  value: LatLng | null;
  /** Saved name of `value`, shown in the field. Empty when the location has no
   *  name yet — the field then shows its placeholder, never the coordinates. */
  valueLabel: string;
  /** Fired with the picked coordinate and its name (empty string when cleared,
   *  or while a GPS pick is still resolving its address). */
  onChange: (c: LatLng | null, label: string) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  /** Heading shown above the search field. Defaults to the generic "Ubicación". */
  label?: string;
  /** Show the "use my current location" GPS button. Defaults to true. */
  showUseMyLocation?: boolean;
  /**
   * Show the static-map preview + zoom controls once a location is picked.
   * Defaults to true. Set false where the map framing isn't stored (e.g. the
   * event form only keeps the coordinates).
   */
  showPreview?: boolean;
  /** Names the search field; its clear, results and GPS button derive from it. */
  testID?: string;
}) {
  const { t } = useT();
  const [state, dispatch] = useReducer(
    locationReducer,
    { coords: value, label: valueLabel },
    initialLocationState,
  );

  // Push committed picks up to the parent form. Gated on `selected` so a
  // half-typed query never overwrites the saved name; `query` is in the deps so
  // an address that resolves after the coordinate (GPS) still propagates.
  useEffect(() => {
    if (!state.selected && state.coords) return;
    onChange(state.coords, state.selected ? state.query : '');
    // onChange identity is stable enough for this controlled-ish usage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.coords, state.selected, state.query]);

  // Debounced geocoding whenever the user is typing a (non-committed) query.
  useEffect(() => {
    const q = state.query.trim();
    if (q === '' || state.selected) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const results = await geocodeSearch(q);
        if (!cancelled) dispatch({ type: 'resultsLoaded', results });
      } catch {
        if (!cancelled) dispatch({ type: 'searchFailed' });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [state.query, state.selected]);

  async function useMyLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert(t('village.admin.community.locationPermissionDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      dispatch({ type: 'gpsResult', coords });
      const label = await reverseGeocode(coords.lat, coords.lng);
      if (label) dispatch({ type: 'resolvedAddress', label });
    } catch {
      showAlert(t('village.admin.community.locationGpsFailed'));
    }
  }

  return (
    <VStack gap={2}>
      <Text variant="h3">{label ?? t('village.admin.community.location')}</Text>
      <Input
        value={state.query}
        onChangeText={(query) => dispatch({ type: 'setQuery', query })}
        placeholder={t('village.admin.community.locationSearchPlaceholder')}
        testID={testID}
        rightAdornment={
          state.coords || state.query !== '' ? (
            <Pressable
              onPress={() => dispatch({ type: 'clear' })}
              accessibilityLabel={t('village.admin.community.removeLocation')}
              hitSlop={8}
              testID={testID ? `${testID}-clear` : undefined}
            >
              <Ionicons name="close-circle" size={20} color={ACCENT} />
            </Pressable>
          ) : null
        }
      />
      {state.status === 'searching' ? <ActivityIndicator color={ACCENT} /> : null}
      {state.status === 'error' ? (
        <Text tone="muted" variant="bodySm">{t('village.admin.community.locationSearchFailed')}</Text>
      ) : null}
      {state.results.map((place, i) => (
        <Pressable
          key={`${place.lat},${place.lng}`}
          testID={testID ? `${testID}-result-${i}` : undefined}
          onPress={() => dispatch({ type: 'pickResult', place })}
          className="py-2 border-b border-subtle flex-row items-center gap-2"
        >
          <Ionicons name="location-outline" size={16} color={ACCENT} />
          <Text variant="body" className="flex-1">{place.label}</Text>
        </Pressable>
      ))}
      {showUseMyLocation ? (
        <Button onPress={useMyLocation} testID={testID ? `${testID}-use-mine` : undefined}>{t('village.admin.community.useMyLocation')}</Button>
      ) : null}
      {showPreview && state.coords ? (
        <View className="gap-2">
          {/* Live preview — same framing (zoom + aspect) as the village screen. */}
          <Image
            source={{ uri: staticMapUrl(state.coords.lat, state.coords.lng, { zoom, w: 640, h: 256 }) }}
            style={{ width: '100%', aspectRatio: 2.5, borderRadius: 16 }}
            resizeMode="cover"
          />
          <HStack className="items-center justify-between">
            <Text variant="body">{t('village.location.zoomLabel')}</Text>
            <HStack gap={3} className="items-center">
              <Pressable
                onPress={() => onZoomChange(clampMapZoom(zoom - MAP_ZOOM_STEP))}
                disabled={zoom <= MAP_ZOOM_MIN}
                accessibilityLabel={t('village.location.zoomOut')}
              >
                <Ionicons
                  name="remove-circle-outline"
                  size={28}
                  color={zoom <= MAP_ZOOM_MIN ? '#cbd5e1' : ACCENT}
                />
              </Pressable>
              <Pressable
                onPress={() => onZoomChange(clampMapZoom(zoom + MAP_ZOOM_STEP))}
                disabled={zoom >= MAP_ZOOM_MAX}
                accessibilityLabel={t('village.location.zoomIn')}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={28}
                  color={zoom >= MAP_ZOOM_MAX ? '#cbd5e1' : ACCENT}
                />
              </Pressable>
            </HStack>
          </HStack>
        </View>
      ) : null}
    </VStack>
  );
}
