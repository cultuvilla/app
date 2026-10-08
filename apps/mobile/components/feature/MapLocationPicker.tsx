import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors } from '@cultuvilla/shared/design-system';
import { reverseGeocode, type GeocodePlace } from '@cultuvilla/shared/services/mapsService';
import type { LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';
import { Pressable, Text } from '../primitives';
import { useT } from '../../lib/i18n';
import { showAlert } from '../../lib/dialogs';
import { AddressSearchBar } from './AddressSearchBar';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.005;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;
const SEARCH_VERTICAL_OFFSET = 20;
const BOTTOM_PANEL_OFFSET = 40;
const MY_LOCATION_BUTTON_BOTTOM = 275;

/** Where the camera sits until the user's own position arrives. */
const MADRID = { lat: 40.416775, lng: -3.70379 };

const CAMERA_MOVE_MS = 1000;
/** How long region events keep arriving after a move visually lands. */
const CAMERA_SETTLE_MS = 400;
const ADDRESS_DEBOUNCE_MS = 300;
/** ~10m: below this a region change is the map settling, not the user choosing. */
const MIN_DISTANCE_THRESHOLD = 0.0001;

const ACCENT = colors.light.fg.accent;
const ON_ACCENT = colors.light.fg['on-accent'];

function regionAround(lat: number, lng: number): Region {
  return { latitude: lat, longitude: lng, latitudeDelta: LATITUDE_DELTA, longitudeDelta: LONGITUDE_DELTA };
}

async function currentPosition(): Promise<LatLng | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const pos = await Location.getCurrentPositionAsync({});
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

/**
 * Full-screen draggable location picker — a port of ordago-apps' LocationPicker
 * in Cultuvilla's colours. The map is the input: a fixed centre pin marks the
 * spot, dragging the map moves it, and the address below follows. It opens on
 * the saved location, or on the user's position when there is none.
 */
export function MapLocationPicker({
  initialCoords,
  initialLabel,
  onConfirm,
  onClose,
}: {
  initialCoords: LatLng | null;
  initialLabel: string;
  /** Fired once with the confirmed pin. `label` is '' when the spot has no
   *  name — the caller picks its fallback; a coordinate pair is never a name. */
  onConfirm: (coords: LatLng, label: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const mapRef = useRef<MapView>(null);
  const startRegion = useRef(
    regionAround(initialCoords?.lat ?? MADRID.lat, initialCoords?.lng ?? MADRID.lng),
  ).current;

  // The map is uncontrolled (`initialRegion`, no `region` prop), so the camera
  // itself is the source of truth for where the pin is. This ref mirrors it for
  // the confirm button; it is never state, because re-rendering a MapView on
  // every pan is what makes a picker like this stutter.
  const currentRegionRef = useRef<Region>(startRegion);

  /**
   * True while `moveCameraTo` owns the camera. Region events produced by our
   * own animation must not be read as the user picking a spot — that would
   * overwrite a searched place's name with a reverse-geocoded street address.
   */
  const isProgrammaticMoveRef = useRef(false);
  const programmaticReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regionChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Coordinates whose address is already shown, so settling events are skipped. */
  const lastGeocodedRef = useRef<{ lat: number; lng: number } | null>(
    initialCoords ? { lat: initialCoords.lat, lng: initialCoords.lng } : null,
  );
  /** Bumped by every lookup; only the latest may write the address. */
  const addressLookupRef = useRef(0);

  /**
   * Null until a pin has been chosen — the saved location, the device's
   * position, a drag or a search. Only a chosen pin can be confirmed: the
   * camera's fallback starting point is a default, not a place anyone picked.
   * '' means chosen but unnamed.
   */
  const [currentAddress, setCurrentAddress] = useState<string | null>(
    initialCoords ? initialLabel : null,
  );
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(initialCoords == null);
  const [showAutocompleteList, setShowAutocompleteList] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [pendingInitialRegion, setPendingInitialRegion] = useState<Region | null>(null);

  useEffect(() => {
    return () => {
      if (regionChangeTimeoutRef.current) clearTimeout(regionChangeTimeoutRef.current);
      if (programmaticReleaseTimerRef.current) clearTimeout(programmaticReleaseTimerRef.current);
    };
  }, []);

  /**
   * Moves the camera and holds the programmatic guard for the move plus the
   * settle that follows it. Every camera move in this screen goes through here.
   */
  const moveCameraTo = useCallback((target: Region) => {
    const map = mapRef.current;
    if (!map) return;
    isProgrammaticMoveRef.current = true;
    currentRegionRef.current = target;
    if (programmaticReleaseTimerRef.current) clearTimeout(programmaticReleaseTimerRef.current);
    map.animateToRegion(target, CAMERA_MOVE_MS);
    programmaticReleaseTimerRef.current = setTimeout(() => {
      isProgrammaticMoveRef.current = false;
      programmaticReleaseTimerRef.current = null;
    }, CAMERA_MOVE_MS + CAMERA_SETTLE_MS);
  }, []);

  const updateAddress = useCallback(async (lat: number, lng: number) => {
    const lookup = ++addressLookupRef.current;
    setIsLoadingAddress(true);
    const label = await reverseGeocode(lat, lng);
    if (lookup !== addressLookupRef.current) return;
    // The coordinates are known either way: a missing address means the spot
    // has no name, not that the location failed.
    setCurrentAddress(label ?? '');
    lastGeocodedRef.current = { lat, lng };
    setIsLoadingAddress(false);
  }, []);

  // A saved pin without a saved name gets one looked up.
  useEffect(() => {
    if (initialCoords && !initialLabel) void updateAddress(initialCoords.lat, initialCoords.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No saved pin: start on the user's position so confirming is a single tap.
  useEffect(() => {
    if (initialCoords) return;
    let cancelled = false;
    void (async () => {
      try {
        const position = await currentPosition();
        if (cancelled || !position) return;
        const target = regionAround(position.lat, position.lng);
        currentRegionRef.current = target;
        // The camera can only move once the map exists; the effect below picks
        // this up whenever `mapReady` lands, in either order.
        setPendingInitialRegion(target);
        void updateAddress(position.lat, position.lng);
      } catch {
        if (!cancelled) showAlert(t('event.locationInitialFailed'));
      } finally {
        if (!cancelled) setIsLocatingUser(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapReady || !pendingInitialRegion) return;
    moveCameraTo(pendingInitialRegion);
    setPendingInitialRegion(null);
  }, [mapReady, pendingInitialRegion, moveCameraTo]);

  const handleRegionChangeComplete = useCallback(
    (newRegion: Region) => {
      if (isProgrammaticMoveRef.current) return;
      if (regionChangeTimeoutRef.current) clearTimeout(regionChangeTimeoutRef.current);
      currentRegionRef.current = newRegion;

      const last = lastGeocodedRef.current;
      if (last) {
        const latDiff = Math.abs(newRegion.latitude - last.lat);
        const lngDiff = Math.abs(newRegion.longitude - last.lng);
        if (Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) < MIN_DISTANCE_THRESHOLD * 2) return;
      }

      // The shown address now belongs to a pin that is no longer there: drop
      // any lookup in flight and hold confirm until this one resolves, or a
      // slow answer for the previous spot would be saved with these coordinates.
      addressLookupRef.current++;
      setIsLoadingAddress(true);
      regionChangeTimeoutRef.current = setTimeout(() => {
        void updateAddress(newRegion.latitude, newRegion.longitude);
        regionChangeTimeoutRef.current = null;
      }, ADDRESS_DEBOUNCE_MS);
    },
    [updateAddress],
  );

  const handlePlaceSelected = useCallback(
    (place: GeocodePlace) => {
      // The picked name beats anything reverse geocoding returns for these
      // coordinates: drop any lookup in flight and claim the geocode slot, so a
      // settling region event after the guard releases is skipped by the
      // distance check instead of replacing the name with a street address.
      addressLookupRef.current++;
      setIsLoadingAddress(false);
      setCurrentAddress(place.label);
      setShowAutocompleteList(false);
      lastGeocodedRef.current = { lat: place.lat, lng: place.lng };
      moveCameraTo(regionAround(place.lat, place.lng));
    },
    [moveCameraTo],
  );

  const handleGoToUserLocation = useCallback(async () => {
    let position: LatLng | null = null;
    try {
      position = await currentPosition();
    } catch {
      position = null;
    }
    if (!position) {
      showAlert(t('event.locationCurrentFailed'));
      return;
    }
    moveCameraTo(regionAround(position.lat, position.lng));
    void updateAddress(position.lat, position.lng);
  }, [moveCameraTo, updateAddress, t]);

  const handleConfirm = useCallback(() => {
    if (currentAddress === null) return;
    const { latitude, longitude } = currentRegionRef.current;
    onConfirm({ lat: latitude, lng: longitude }, currentAddress.trim());
    onClose();
  }, [currentAddress, onConfirm, onClose]);

  const canConfirm = currentAddress !== null && !isLocatingUser && !isLoadingAddress;
  const addressText =
    currentAddress === null
      ? isLocatingUser
        ? t('event.gettingLocation')
        : t('event.moveMapOrSearch')
      : currentAddress || t('event.addressUnavailable');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={startRegion}
        showsUserLocation
        showsMyLocationButton={false}
        scrollEnabled
        zoomEnabled
        rotateEnabled={false}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        loadingEnabled
        mapType="standard"
        toolbarEnabled={Platform.OS === 'android' ? false : undefined}
        cacheEnabled={false}
        moveOnMarkerPress={false}
        pitchEnabled={false}
        showsCompass={false}
        onRegionChangeComplete={handleRegionChangeComplete}
        onMapReady={() => setMapReady(true)}
        testID="location-map"
      />

      {/* Fixed centre pin */}
      <View style={styles.centerMarkerContainer} pointerEvents="none">
        <View style={styles.markerWrapper}>
          <Ionicons name="location" size={40} color={ACCENT} style={styles.markerIcon} />
          <View style={styles.markerShadow} />
        </View>
      </View>

      {/* Header with search */}
      <SafeAreaView style={styles.headerContainer} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable
            onPress={onClose}
            accessibilityLabel={t('common.back')}
            style={styles.backButton}
            testID="location-back"
          >
            <Ionicons name="chevron-back" size={24} color="#333" />
          </Pressable>

          <View style={styles.searchContainer} pointerEvents="auto">
            <AddressSearchBar
              placeholder={t('event.searchLocationPlaceholder')}
              listViewDisplayed={showAutocompleteList}
              onPlaceSelected={handlePlaceSelected}
              onFocus={() => setShowAutocompleteList(true)}
              onBlur={() => setTimeout(() => setShowAutocompleteList(false), 100)}
            />
          </View>
        </View>
      </SafeAreaView>

      {/* My location */}
      <Pressable
        style={styles.myLocationButton}
        onPress={() => void handleGoToUserLocation()}
        accessibilityLabel={t('event.useMyLocation')}
        testID="location-use-mine"
      >
        <Ionicons name="locate" size={24} color={ACCENT} />
      </Pressable>

      {/* Confirmation panel */}
      <View style={styles.bottomPanel}>
        <View style={styles.addressInfoContainer}>
          <Text style={styles.addressLabel}>{t('event.selectedLocation')}</Text>
          <View style={styles.addressRow}>
            <Text style={styles.addressText} numberOfLines={2} testID="location-address">
              {addressText}
            </Text>
            {isLoadingAddress ? (
              <ActivityIndicator size="small" color={ACCENT} style={styles.addressLoader} />
            ) : null}
          </View>
        </View>

        <Pressable
          testID="location-confirm"
          style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={!canConfirm}
          accessibilityRole="button"
        >
          <Text style={styles.confirmButtonText}>
            {isLocatingUser || isLoadingAddress ? t('event.gettingAddress') : t('event.confirmLocation')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  // Spans the screen so the search dropdown is always laid out inside it:
  // Android never dispatches a touch to a child outside its parent's bounds.
  // `pointerEvents="box-none"` is what keeps the map draggable underneath.
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 15,
    paddingTop: 10 + SEARCH_VERTICAL_OFFSET,
    paddingBottom: 10,
  },
  backButton: {
    marginRight: 10,
    marginTop: 4, // optically centres the 36px button against the 44px input
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  searchContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 0,
  },
  centerMarkerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  markerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  markerIcon: {
    marginBottom: -5,
  },
  markerShadow: {
    width: 10,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 5,
    marginTop: 2,
  },
  myLocationButton: {
    position: 'absolute',
    bottom: MY_LOCATION_BUTTON_BOTTOM,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 10,
  },
  bottomPanel: {
    position: 'absolute',
    bottom: BOTTOM_PANEL_OFFSET,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 35 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
    zIndex: 10,
  },
  addressInfoContainer: {
    marginBottom: 20,
  },
  addressLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  addressLoader: {
    marginLeft: 8,
  },
  confirmButton: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: ON_ACCENT,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
