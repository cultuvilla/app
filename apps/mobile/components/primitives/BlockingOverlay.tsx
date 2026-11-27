import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Animated, BackHandler, StyleSheet } from 'react-native';
import { colors } from '@cultuvilla/shared/design-system';
import { Text } from './Text';
import { VStack } from './VStack';

export interface BlockingOverlayProps {
  /** When true, the overlay covers the screen and blocks interaction. */
  visible: boolean;
  /** Localized wait message, e.g. "Eliminando evento…". */
  label: string;
}

/**
 * The overlay is painted by a `BlockingOverlayHost`, an in-tree view, and never
 * by a native `<Modal>`: on iOS a Modal presented while another is presenting
 * (a sheet, the confirm `Alert` that precedes a delete) can leave a view
 * controller stuck and freeze the app. Órdago hit it twice; see its
 * docs/decisions/blocking-overlay-no-native-modal.md.
 *
 * An in-tree view cannot paint above a native Modal it is not inside, so a host
 * sits at the app root and inside each modal primitive (`BottomSheet`,
 * `FormModal`), and only the most recently mounted host — the topmost layer —
 * paints. Callers stay where they are and just render `<BlockingOverlay>`.
 */
type State = { label: string | null; hostId: number | null };

let nextId = 1;
const requests = new Map<number, string>();
const hosts: number[] = [];
const listeners = new Set<() => void>();
let state: State = { label: null, hostId: null };

function publish() {
  const label = [...requests.values()].at(-1) ?? null;
  const hostId = hosts.at(-1) ?? null;
  if (label === state.label && hostId === state.hostId) return;
  state = { label, hostId };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;

/** True while any blocking overlay is up — a modal uses it to ignore Android's back. */
export function useBlockingOverlayActive(): boolean {
  return useSyncExternalStore(subscribe, getState).label !== null;
}

/**
 * Non-dismissible full-screen busy overlay for irreversible async actions
 * (delete). Dims the whole screen behind a spinner + label so the user knows a
 * write is in flight and to wait — not to tap again or leave.
 */
export function BlockingOverlay({ visible, label }: BlockingOverlayProps) {
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = nextId++;

  useEffect(() => {
    if (!visible) return;
    const id = idRef.current;
    requests.set(id, label);
    publish();
    return () => {
      requests.delete(id);
      publish();
    };
  }, [visible, label]);

  return null;
}

/** Mount once at the app root and once inside every modal primitive. */
export function BlockingOverlayHost() {
  const [id] = useState(() => nextId++);
  const { label, hostId } = useSyncExternalStore(subscribe, getState);
  const showing = label !== null && hostId === id;

  useEffect(() => {
    hosts.push(id);
    publish();
    return () => {
      hosts.splice(hosts.indexOf(id), 1);
      publish();
    };
  }, [id]);

  // A native Modal swallowed Android's back; an in-tree view has to. Inside a
  // modal, its own `onRequestClose` gets the press instead (see BottomSheet).
  useEffect(() => {
    if (!showing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [showing]);

  // The fade a native Modal's `animationType="fade"` gave. On `style`, never
  // `className`: NativeWind drops className on an Animated.View.
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!showing) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [showing, opacity]);

  if (!showing) return null;
  return (
    <Animated.View
      testID="blocking-overlay"
      style={[styles.backdrop, { opacity }]}
      // Claiming the responder keeps every touch from reaching what is beneath.
      onStartShouldSetResponder={() => true}
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
    >
      <VStack gap={3} className="items-center">
        <ActivityIndicator size="large" color={colors.light.fg['on-accent']} />
        <Text tone="onAccent">{label}</Text>
      </VStack>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1000,
    elevation: 1000,
  },
});
