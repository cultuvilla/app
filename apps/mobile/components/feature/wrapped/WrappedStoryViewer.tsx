import { useContext, useEffect, useState } from 'react';
import { Image, Pressable as RNPressable, Text as RNText, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { iconSizes, typography } from '@cultuvilla/shared/design-system';
import type { WrappedCard } from '@cultuvilla/shared/models';
import { Button, VStack } from '../../primitives';
import { barFill, startAt, step, tapDirection, tick } from '../../../lib/wrapped/storyProgress';
import { useT } from '../../../lib/i18n';

const TICK_MS = 50;
const CARD_ASPECT = 1920 / 1080;

export interface StoryCard {
  card: WrappedCard;
  url: string;
}

interface Props {
  cards: StoryCard[];
  /** "Fiestas 2026 · Matabuena" — heads the closing screen. */
  title: string;
  initialIndex?: number;
  onClose: () => void;
  /** Share the Wrapped's link. Absent on a draft, which is not the admin's to forward yet. */
  onShareLink?: () => void;
  /** Share the card on screen as an image. Absent where a card cannot be shared as a file. */
  onShareCard?: (card: StoryCard) => void;
  /** Leave for the village home, from the closing screen. */
  onOpenVillage?: () => void;
}

/**
 * The Wrapped as a story: one full-screen card at a time, a progress bar per
 * card, tap the right of the screen for the next and the left for the last,
 * hold to pause. After the last card comes a closing screen with the actions —
 * it does not run out on its own, so the reader is never hurried off it.
 *
 * Core RN only (no gesture-handler or reanimated): a Wrapped viewer that needs
 * a new store binary is one nobody has until it ships — an OTA update cannot
 * carry native code.
 */
export function WrappedStoryViewer({
  cards,
  title,
  initialIndex = 0,
  onClose,
  onShareLink,
  onShareCard,
  onOpenVillage,
}: Props) {
  const { t } = useT();
  const { width, height } = useWindowDimensions();
  // The context rather than `useSafeAreaInsets`, which throws without a
  // provider — the viewer also mounts inside a Modal on the admin screen.
  const insets = useContext(SafeAreaInsetsContext);
  const top = insets?.top ?? 0;
  const bottom = insets?.bottom ?? 0;

  const count = cards.length;
  const [state, setState] = useState(() => startAt(initialIndex, count));
  const [paused, setPaused] = useState(false);
  const closing = state.index >= count;
  const current = closing ? null : cards[state.index];

  useEffect(() => {
    if (paused || closing) return;
    const timer = setInterval(() => setState((s) => tick(s, TICK_MS, count)), TICK_MS);
    return () => clearInterval(timer);
  }, [paused, closing, count]);

  // Fetch the next card while this one is read, so the advance is not a blank frame.
  const nextUrl = cards[state.index + 1]?.url;
  useEffect(() => {
    if (nextUrl) void Image.prefetch(nextUrl).catch(() => undefined);
  }, [nextUrl]);

  // The card fits the screen whole: cutting the foot of a card cuts its address.
  const cardWidth = Math.min(width, height / CARD_ASPECT);

  return (
    <View style={styles.root} testID="wrapped-story">
      {current ? (
        <>
          <Image
            source={{ uri: current.url }}
            accessibilityLabel={t(`village.wrapped.card.${current.card}`)}
            testID={`wrapped-story-card-${current.card}`}
            style={{ width: cardWidth, height: cardWidth * CARD_ASPECT, alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto' }}
            resizeMode="contain"
          />
          <RNPressable
            style={StyleSheet.absoluteFill}
            testID="wrapped-story-tap"
            accessibilityRole="button"
            accessibilityLabel={t('village.wrapped.viewer.next')}
            onPress={(e) => {
              // Read now: RN releases the event once this handler returns,
              // before the updater runs.
              const direction = tapDirection(e.nativeEvent.locationX, width);
              setState((s) => step(s, direction, count));
            }}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            delayLongPress={200}
          />
        </>
      ) : (
        <VStack gap={3} className="flex-1 justify-center px-6" testID="wrapped-story-closing">
          {/* RN Text, not the primitive: its tone classes follow the theme,
              and this screen is dark in both. */}
          <RNText style={styles.title}>{title}</RNText>
          <RNText style={styles.dim}>{t('village.wrapped.viewer.closingBody')}</RNText>
          {onShareLink ? (
            <Button onPress={onShareLink} fullWidth testID="wrapped-share-link">
              {t('village.wrapped.viewer.shareLink')}
            </Button>
          ) : null}
          {onOpenVillage ? (
            <Button variant="secondary" onPress={onOpenVillage} fullWidth testID="wrapped-open-village">
              {t('village.wrapped.viewer.openVillage')}
            </Button>
          ) : null}
          <Button variant="secondary" onPress={() => setState(startAt(0, count))} fullWidth testID="wrapped-replay">
            {t('village.wrapped.viewer.replay')}
          </Button>
        </VStack>
      )}

      <View style={[styles.top, { paddingTop: top + 8 }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {cards.map((c, i) => (
            <View key={c.card} style={styles.bar}>
              <View style={[styles.barFill, { width: `${barFill(state, i) * 100}%` }]} />
            </View>
          ))}
        </View>
        <View style={styles.actions} pointerEvents="box-none">
          {current && onShareCard ? (
            <RNPressable
              onPress={() => onShareCard(current)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('village.wrapped.viewer.shareCard')}
              testID="wrapped-share-card"
              style={styles.iconButton}
            >
              <Ionicons name="share-outline" size={iconSizes.md} color="#ffffff" />
            </RNPressable>
          ) : null}
          <RNPressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('village.wrapped.viewer.close')}
            testID="wrapped-story-close"
            style={styles.iconButton}
          >
            <Ionicons name="close" size={iconSizes.md} color="#ffffff" />
          </RNPressable>
        </View>
      </View>
      <View style={{ height: bottom }} />
    </View>
  );
}

// Fixed colours, not theme tokens: the cards are drawn on a dark ground in both
// themes, so the frame around them is dark in both too.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  title: { ...typography.h2, color: '#ffffff' },
  dim: { ...typography.body, color: 'rgba(255,255,255,0.75)', marginBottom: 8 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 12 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: '#ffffff' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  iconButton: { padding: 6, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)' },
});
