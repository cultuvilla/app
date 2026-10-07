import { useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors } from '@cultuvilla/shared/design-system';
import {
  geocodeSearch,
  reverseGeocode,
  staticMapUrl,
  MAP_ZOOM_DEFAULT,
} from '@cultuvilla/shared/services/mapsService';
import type { LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';
import { Text, Button, Pressable, FieldLabel } from '../primitives';
import { useT } from '../../lib/i18n';
import { showAlert } from '../../lib/dialogs';
import { initialLocationState, locationReducer } from './locationPickerState';

const ACCENT = colors.light.fg.accent;
const MAP_ZOOM = MAP_ZOOM_DEFAULT ?? 15;

/**
 * Trigger + full-screen location picker used wherever an entity carries an
 * optional pin (events, places), modeled on the ordago-apps
 * LocationPicker: a full-bleed map with a fixed centre pin, a floating search
 * field and "my location" button, and a bottom panel with the resolved address
 * and a prominent "Confirmar ubicación" button. It opens already centred on the
 * user's current location (or the entity's saved one) so confirming is a single
 * tap. Web-safe: the server `geocodeSearch` proxy + a `staticMap` image stand in
 * for a client Google key and `react-native-maps` (no web build). Colors follow
 * the app accent.
 */
export function LocationField({
  value,
  displayName,
  onChange,
  onClear,
  label,
  required,
  testID,
}: {
  value: LatLng | null;
  displayName: string;
  /** Fired on confirm with the chosen coordinates and its address label. */
  onChange: (coords: LatLng, address: string) => void;
  /** Makes the pin removable: when set and a coordinate is stored, the trigger
   *  grows a clear button. Omit where the location is mandatory (events). */
  onClear?: () => void;
  label?: string;
  required?: boolean;
  /** Names the trigger. The picker's own controls keep fixed ids: only one is ever open. */
  testID?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [state, dispatch] = useReducer(
    locationReducer,
    { coords: value, label: displayName },
    initialLocationState,
  );
  const [locating, setLocating] = useState(false);
  const seededRef = useRef(false);

  async function locate(silent: boolean) {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!silent) showAlert(t('village.admin.community.locationPermissionDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      dispatch({ type: 'gpsResult', coords });
      const label = await reverseGeocode(coords.lat, coords.lng);
      if (label) dispatch({ type: 'resolvedAddress', label });
    } catch {
      if (!silent) showAlert(t('village.admin.community.locationGpsFailed'));
    } finally {
      setLocating(false);
    }
  }

  // On first open, centre the map on the saved location (showing its address)
  // or, failing that, silently drop the user on their current location so
  // "Confirmar" works immediately.
  useEffect(() => {
    if (!open || seededRef.current) return;
    seededRef.current = true;
    if (state.coords) {
      if (displayName) dispatch({ type: 'resolvedAddress', label: displayName });
      else {
        const { lat, lng } = state.coords;
        void reverseGeocode(lat, lng).then((l) => {
          if (l) dispatch({ type: 'resolvedAddress', label: l });
        });
      }
    } else {
      void locate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced geocoding while the user types a (non-committed) query.
  useEffect(() => {
    if (!open) return;
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
  }, [open, state.query, state.selected]);

  function confirm() {
    if (!state.coords) return;
    // An empty label is handed up as-is; the form falls back to the village
    // name. Never persist a coordinate pair as the location's name.
    onChange(state.coords, state.query.trim());
    setOpen(false);
  }

  const showResults = state.results.length > 0 || state.status === 'searching' || state.status === 'error';
  const addressText = state.coords
    ? (state.query || t('event.selectedLocation'))
    : locating
      ? t('common.loading')
      : t('event.noLocationYet');

  return (
    <View>
      <FieldLabel required={required}>{label ?? t('event.location')}</FieldLabel>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.trigger} testID={testID}>

        <View style={styles.triggerInner}>
          <Ionicons name="location-outline" size={18} color={ACCENT} />
          <Text numberOfLines={1} tone={displayName ? 'primary' : 'muted'} style={styles.triggerText}>
            {displayName || t('event.selectLocation')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#64748b" />
      </Pressable>
      {onClear && value ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={t('village.admin.community.removeLocation')}
          hitSlop={8}
          style={styles.clearRow}
          testID="location-clear"
        >
          <Ionicons name="close-circle-outline" size={16} color={ACCENT} />
          <Text variant="bodySm" tone="muted">
            {t('village.admin.community.removeLocation')}
          </Text>
        </Pressable>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          {/* Map layer (full-bleed background) */}
          <View style={StyleSheet.absoluteFill}>
            {state.coords ? (
              <Image
                source={{ uri: staticMapUrl(state.coords.lat, state.coords.lng, { zoom: MAP_ZOOM, w: 640, h: 1200 }) }}
                style={styles.mapImage}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={styles.mapEmpty}>
                {locating ? <ActivityIndicator color={ACCENT} /> : <Ionicons name="map-outline" size={48} color="#cbd5e1" />}
              </View>
            )}
          </View>
          {/* Fixed centre pin marking the selected coordinate */}
          {state.coords ? (
            <View style={styles.pinLayer} pointerEvents="none">
              <Ionicons name="location" size={44} color={ACCENT} style={styles.pinIcon} />
            </View>
          ) : null}

          <SafeAreaView style={styles.safe} edges={['top', 'bottom']} pointerEvents="box-none">
            {/* Top: back + search */}
            <View style={styles.topBar}>
              <Pressable onPress={() => setOpen(false)} accessibilityLabel={t('common.back')} hitSlop={8} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={22} color="#334155" />
              </Pressable>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color="#94a3b8" />
                <TextInput
                  value={state.query}
                  onChangeText={(query) => dispatch({ type: 'setQuery', query })}
                  placeholder={t('event.searchLocationPlaceholder')}
                  placeholderTextColor="#94a3b8"
                  style={styles.searchInput}
                  autoCapitalize="none"
                />
                {state.query !== '' ? (
                  <Pressable onPress={() => dispatch({ type: 'clearQuery' })} accessibilityLabel={t('village.admin.community.removeLocation')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={ACCENT} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Search results dropdown, overlaying the map */}
            {showResults ? (
              <View style={styles.resultsCard}>
                {state.status === 'searching' ? <ActivityIndicator color={ACCENT} style={styles.pad} /> : null}
                {state.status === 'error' ? (
                  <Text tone="muted" style={styles.pad}>{t('village.admin.community.locationSearchFailed')}</Text>
                ) : null}
                <FlatList
                  data={state.results}
                  keyExtractor={(p) => `${p.lat},${p.lng}`}
                  keyboardShouldPersistTaps="handled"
                  style={styles.resultsList}
                  renderItem={({ item }) => (
                    <Pressable onPress={() => dispatch({ type: 'pickResult', place: item })} style={styles.resultRow}>
                      <Ionicons name="location-outline" size={18} color={ACCENT} />
                      <Text style={styles.resultText} numberOfLines={2}>{item.label}</Text>
                    </Pressable>
                  )}
                />
              </View>
            ) : null}

            <View style={styles.flex} pointerEvents="none" />

            {/* Floating "my location" button, above the bottom panel */}
            <Pressable
              onPress={() => void locate(false)}
              accessibilityLabel={t('event.useMyLocation')}
              style={styles.locateBtn}
              testID="location-use-mine"
            >
              {locating ? <ActivityIndicator color={ACCENT} /> : <Ionicons name="locate" size={22} color={ACCENT} />}
            </Pressable>

            {/* Bottom confirmation panel */}
            <View style={styles.bottomPanel}>
              <Text variant="caption" tone="muted" style={styles.panelLabel}>{t('event.selectedLocation')}</Text>
              <Text numberOfLines={2} style={styles.panelAddress}>{addressText}</Text>
              <Button onPress={confirm} disabled={!state.coords} fullWidth testID="location-confirm">
                {t('event.confirmLocation')}
              </Button>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 4,
    backgroundColor: '#ffffff',
  },
  triggerInner: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, alignSelf: 'flex-start' },
  triggerText: { flexShrink: 1 },
  modal: { flex: 1, backgroundColor: '#eef2f7' },
  mapImage: { width: '100%', height: '100%' },
  mapEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pinLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // Lift the pin so its tip rests on the exact map centre.
  pinIcon: { marginBottom: 44 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 8 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#0f172a' },
  resultsCard: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  resultsList: { maxHeight: 240 },
  pad: { padding: 12 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  resultText: { flex: 1 },
  locateBtn: {
    alignSelf: 'flex-end',
    marginRight: 16,
    marginBottom: 12,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  bottomPanel: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 16,
    gap: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
  },
  panelLabel: { textTransform: 'uppercase' },
  panelAddress: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
});
