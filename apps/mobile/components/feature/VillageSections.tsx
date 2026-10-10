import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, FlatList, Image, ScrollView, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes, spacing } from '@cultuvilla/shared/design-system';
import { VStack, HStack, Text, Pressable, TopCropImage } from '../primitives';
import { useT } from '../../lib/i18n';
import { SectionTitle } from './SectionTitle';
import { RemoteImage } from '../primitives/RemoteImage';

/**
 * Presentational building blocks for the village overview on the shared
 * village tab ((tabs)/mi-pueblo.tsx). Creating content lives on the single
 * "Añadir contenido" sheet, so a section carries no add affordance of its own
 * and simply hides itself when it has no entities.
 */

export const ACCENT = '#bb5d3a';
const PLACEHOLDER_BG = '#dcab93'; // palette.peach — keeps the white scrim text legible over the fallback
const CREST_BG = '#f9f0e8'; // palette.cream — matches the screen's bg-surface so the crest card reads as an outline
const CARD_W = 175;
const CARD_H = 175; // square — same width and height
const CARD_RADIUS = 16; // matches the cards' rounded-2xl
const SKELETON_BG = '#e7dccf'; // muted cream — reads as an empty card on bg-surface

/** How a section's data is loading; drives skeleton vs content vs hidden. */
export type SectionStatus = 'loading' | 'ready' | 'error';

/**
 * Placeholder row shown while a section's own fetch is in flight. A gentle
 * shared opacity pulse animates the cards; per the NativeWind-on-web gotcha the
 * animated value drives `style.opacity`, never a className.
 */
function SkeletonRow({ count = 4 }: { count?: number }) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View
      testID="section-skeleton"
      style={{ flexDirection: 'row', paddingHorizontal: spacing[4], gap: spacing[3] }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View
          key={i}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: CARD_W,
            height: CARD_H,
            borderRadius: CARD_RADIUS,
            backgroundColor: SKELETON_BG,
            opacity: pulse,
          }}
        />
      ))}
    </View>
  );
}

/** A village-home section title with an optional trailing text link ("Gestionar", "Ver todo"). */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <HStack className="items-center justify-between px-4">
      <SectionTitle>{title}</SectionTitle>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityLabel={actionLabel}>
          <Text variant="bodySm" style={{ color: ACCENT }} className="font-medium">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </HStack>
  );
}

export function Section<T>({
  title,
  onManage,
  isEmpty,
  status = 'ready',
  children,
  data,
  renderItem,
  keyExtractor,
  testID,
}: {
  title: string;
  /** On the horizontal row, so an E2E flow can swipe it to an off-screen card. */
  testID?: string;
  /** When provided, renders the "Gestionar" link (admins only). */
  onManage?: () => void;
  isEmpty: boolean;
  /**
   * Load state of this section's own fetch. 'loading' shows a skeleton row,
   * 'error' hides the section (same as an empty one — the tab stays up), and
   * 'ready' renders the content. Defaults to 'ready' for eager callers.
   */
  status?: SectionStatus;
  /** Eager path: children are rendered in a plain horizontal ScrollView. */
  children?: ReactNode;
  /**
   * Virtualized path: when `data` + `renderItem` are given, the row is a
   * horizontal FlatList instead of a ScrollView, so it stays fast for
   * sections that can grow unbounded (e.g. events, which include past ones).
   */
  data?: readonly T[];
  renderItem?: ListRenderItem<T>;
  keyExtractor?: (item: T, index: number) => string;
}) {
  const { t } = useT();
  // A failed section hides itself rather than blanking the tab; an empty
  // (ready) section is likewise hidden — content is created from the single
  // "Añadir contenido" sheet, not from an in-scroll add card. While loading we
  // keep the header + a skeleton row so the user sees the section fill in.
  const showSkeleton = status === 'loading';
  if (status === 'error') return null;
  if (!showSkeleton && isEmpty) return null;
  return (
    <VStack gap={3} className="pt-4">
      <SectionHeader
        title={title}
        actionLabel={onManage ? t('village.admin.overview.manage') : undefined}
        onAction={onManage}
      />
      {showSkeleton ? (
        <SkeletonRow />
      ) : data && renderItem ? (
        <FlatList
          testID={testID}
          horizontal
          showsHorizontalScrollIndicator={false}
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingHorizontal: spacing[4], gap: spacing[3] }}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          removeClippedSubviews
        />
      ) : (
        <ScrollView
          testID={testID}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-4 gap-3"
        >
          {children}
        </ScrollView>
      )}
    </VStack>
  );
}

/**
 * The shared image-forward card used for every entry in the village overview
 * (inspired by ordago's frequent-partners scroll). A fully rectangular,
 * full-bleed image fills the whole card; the label + an optional secondary line
 * sit over a dark scrim pinned to the bottom (the same treatment as the news
 * `FeedCard`) so the picture stays as large as possible. `PersonCard` and
 * `EntityCard` are thin adapters over this one card so people, barrios, places,
 * organizations and peñas all share a single "big picture" style.
 */
/** A count pill in a card's top-right corner, and how VoiceOver says it. */
export interface StatBadge {
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  spoken: 'burials' | 'attendees';
  testID?: string;
}

function BigCard({
  label,
  imageUri,
  fallback,
  secondary,
  accent,
  crest,
  commentCount,
  statBadge,
  onPress,
}: {
  label: string;
  imageUri?: string | null;
  /** Shown in the image area when there's no `imageUri` (initials or an icon). */
  fallback: ReactNode;
  /** Optional second line under the label (a badge or a subtitle). */
  secondary?: string;
  /** Tint the border with ACCENT (used for the request badge). */
  accent?: boolean;
  /**
   * Crest treatment: the image (a village escudo) is small + `contain`ed and
   * centred on the cream screen background, with an ACCENT outline as the only
   * colour — so a low-res escudo no longer pixelates from being stretched
   * full-bleed. The label sits as plain dark text below it instead of over a
   * dark photo scrim.
   */
  crest?: boolean;
  /**
   * Comment count shown as a small pill in the photo's top-right corner, when
   * > 0. Only meaningful for the (non-crest) photo cards — villages (crest)
   * aren't a commentable entity.
   */
  commentCount?: number;
  /** Alternate top-right count badge, used when the count is not comments. */
  statBadge?: StatBadge;
  onPress?: () => void;
}) {
  const { t } = useT();
  const topRightBadge = statBadge && statBadge.count > 0
    ? statBadge
    : commentCount && commentCount > 0
      ? { icon: 'chatbubble-outline' as const, count: commentCount, spoken: 'comments' as const, testID: 'entity-card-comment-count' }
      : null;
  // The card is one accessibility element, so its badge and second line are
  // spoken only if they are in its label.
  const spokenCount = topRightBadge
    ? t(`entityCard.a11y.${topRightBadge.spoken}.${topRightBadge.count === 1 ? 'one' : 'other'}`, { count: topRightBadge.count })
    : null;
  const accessibilityLabel = [label, secondary, spokenCount].filter(Boolean).join(', ');

  const body = crest ? (
    <View
      className="rounded-2xl overflow-hidden"
      style={{
        width: CARD_W,
        height: CARD_H,
        backgroundColor: CREST_BG,
        borderWidth: accent ? 2 : 1,
        borderColor: ACCENT,
      }}
    >
      <View
        style={{
          flex: 1,
          alignSelf: 'stretch',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 14,
          paddingTop: 14,
          paddingBottom: 4,
        }}
      >
        {imageUri ? (
          <RemoteImage
            uri={imageUri}
            variant="card"
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
          />
        ) : (
          fallback
        )}
      </View>
      <View style={{ alignSelf: 'stretch', paddingHorizontal: 12, paddingBottom: 12 }}>
        <Text variant="body" className="font-medium" numberOfLines={2}>
          {label}
        </Text>
        {secondary ? (
          <Text variant="bodySm" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
            {secondary}
          </Text>
        ) : null}
      </View>
    </View>
  ) : (
    <View
      className="rounded-2xl overflow-hidden"
      style={{
        width: CARD_W,
        height: CARD_H,
        backgroundColor: PLACEHOLDER_BG,
        ...(accent ? { borderWidth: 1, borderColor: ACCENT } : {}),
      }}
    >
      {imageUri ? (
        <TopCropImage uri={imageUri} />
      ) : (
        <View className="w-full h-full items-center justify-center">{fallback}</View>
      )}

      {topRightBadge ? (
        <View
          testID={topRightBadge.testID}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.45)',
            borderRadius: 12,
            paddingHorizontal: 6,
            paddingVertical: 3,
          }}
        >
          <Ionicons name={topRightBadge.icon} size={iconSizes.sm} color="rgba(255,255,255,0.85)" />
          <Text
            variant="bodySm"
            numberOfLines={1}
            style={{ color: 'rgba(255,255,255,0.85)', marginLeft: 4 }}
          >
            {topRightBadge.count}
          </Text>
        </View>
      ) : null}

      {/* Bottom scrim keeps the overlaid text legible against any photo. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 10,
          backgroundColor: 'rgba(0,0,0,0.45)',
        }}
      >
        <Text variant="body" className="font-medium" numberOfLines={2} style={{ color: '#ffffff' }}>
          {label}
        </Text>
        {secondary ? (
          <Text
            variant="bodySm"
            numberOfLines={1}
            style={{ color: 'rgba(255,255,255,0.85)', marginTop: 2 }}
          >
            {secondary}
          </Text>
        ) : null}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityLabel={accessibilityLabel}>
      {body}
    </Pressable>
  );
}

export function PersonCard({
  name,
  photoURL,
  badge,
  subtitle,
  onPress,
}: {
  name: string;
  photoURL: string | null;
  /** Accent-tinted secondary line (e.g. a request badge). Takes precedence over `subtitle`. */
  badge?: string;
  /** Plain (muted) secondary line shown when there's no `badge`. */
  subtitle?: string;
  onPress?: () => void;
}) {
  const initials = name.slice(0, 1).toUpperCase();
  return (
    <BigCard
      label={name}
      imageUri={photoURL}
      fallback={
        <Text variant="h1" tone="muted">
          {initials}
        </Text>
      }
      secondary={badge ?? subtitle}
      accent={Boolean(badge)}
      onPress={onPress}
    />
  );
}

export function EntityCard({
  label,
  sub,
  icon,
  imageUri,
  accent,
  crest,
  commentCount,
  statBadge,
  onPress,
}: {
  label: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  imageUri?: string | null;
  accent?: boolean;
  /** Render the image as a small, centred escudo on the cream bg (villages). */
  crest?: boolean;
  /** Comment count shown as a pill over the photo, when > 0. */
  commentCount?: number;
  /** Alternate top-right count badge, used when the count is not comments. */
  statBadge?: StatBadge;
  onPress?: () => void;
}) {
  return (
    <BigCard
      label={label}
      imageUri={imageUri}
      fallback={<Ionicons name={icon} size={44} color={ACCENT} />}
      secondary={sub}
      accent={accent}
      crest={crest}
      commentCount={commentCount}
      statBadge={statBadge}
      onPress={onPress}
    />
  );
}

export function AddCard({ label, onPress }: { label: string; onPress: () => void }) {
  // Matches BigCard's rectangular footprint (CARD_W × CARD_H) so it lines up
  // with the image-forward cards it sits beside in the horizontal scroll.
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      className="rounded-2xl overflow-hidden border border-dashed border-subtle items-center justify-center gap-2"
      style={{ width: CARD_W, height: CARD_H }}
    >
      <Ionicons name="add" size={44} color={ACCENT} />
      <Text variant="bodySm" className="font-medium text-center px-3" numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SettingsLink({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-surface border border-subtle rounded-xl p-3"
    >
      <Ionicons name={icon} size={20} color="#0f172a" />
      <Text className="ml-3 flex-1">{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );
}
