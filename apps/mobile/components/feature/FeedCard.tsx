import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { TopCropImage } from '../primitives/TopCropImage';
import { CornerRibbon, type CornerRibbonProps } from './CornerRibbon';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';

/**
 * Image-forward feed card shared by EventCard and NewsCard. The image fills
 * the whole card (full-bleed, no padding) at a fixed aspect ratio; the title
 * and meta sit over a dark scrim pinned to the bottom so the picture stays as
 * large as possible. When the item has no image of its own we fall back to the
 * village's cover photo (`fallbackImageUri`), then to a tinted placeholder with
 * `fallbackIcon`.
 */

// Width:height. Taller than 16:9 so the picture dominates the card.
const ASPECT_RATIO = 4 / 3;
const PLACEHOLDER_BG = colors.light.bg.subtle;
const BADGE_BG = colors.light.bg.accent;

export type FeedCardProps = {
  imageUri: string | null;
  /** Village cover photo, shown when the item has no image of its own. */
  fallbackImageUri?: string | null;
  title: string;
  metaLeft: string | null;
  metaRight: string;
  fallbackIcon: keyof typeof Ionicons.glyphMap;
  /** Optional pill shown over the top-left of the image (e.g. "En curso"). */
  badge?: string | null;
  /**
   * Optional diagonal band across the top-left corner, marking the viewer's own
   * relationship to the item (e.g. "Apuntado"). It occupies the same corner as
   * `badge`, so a card should not carry both.
   */
  cornerRibbon?: CornerRibbonProps | null;
  /** Optional icon + count pill shown in the image's top-right corner. */
  statBadge?: {
    icon: keyof typeof Ionicons.glyphMap;
    count: number;
    testID?: string;
  };
  /**
   * When > 0, a chat-icon + count takes the right side of the meta row *in place
   * of* `metaRight`. Cards that shouldn't surface comments omit it (they keep
   * `metaRight`); cards that show comments instead of their meta text pass an
   * empty `metaRight`, so the slot is blank when the count is 0.
   */
  commentCount?: number;
  onPress: () => void;
  testID?: string;
};

export function FeedCard({
  imageUri,
  fallbackImageUri = null,
  title,
  metaLeft,
  metaRight,
  fallbackIcon,
  badge = null,
  cornerRibbon = null,
  statBadge,
  commentCount,
  onPress,
  testID,
}: FeedCardProps) {
  const displayUri = imageUri ?? fallbackImageUri;
  return (
    <Pressable onPress={onPress} testID={testID}>
      <View className="rounded-lg overflow-hidden bg-surface border border-subtle">
        <View style={{ width: '100%', aspectRatio: ASPECT_RATIO }}>
          {displayUri ? (
            <TopCropImage uri={displayUri} />
          ) : (
            <View
              className="items-center justify-center"
              style={{ width: '100%', height: '100%', backgroundColor: PLACEHOLDER_BG }}
            >
              <Ionicons name={fallbackIcon} size={64} color={colors.light.fg['on-media']} />
            </View>
          )}

          {cornerRibbon ? <CornerRibbon {...cornerRibbon} /> : null}

          {/* Bottom scrim keeps the overlaid text legible against any photo. */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 14,
              backgroundColor: 'rgba(0,0,0,0.6)',
            }}
          >
            <Text variant="h1" numberOfLines={1} style={{ color: colors.light.fg['on-media'], fontSize: 22 }}>
              {title}
            </Text>
            {/* Meta row: location takes the slack and ellipsises. The right side is
                the comment count (chat icon + number) when > 0, otherwise the
                `metaRight` text (e.g. the date). */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Text
                variant="body"
                numberOfLines={1}
                style={{ color: 'rgba(255,255,255,0.85)', flex: 1, marginRight: 8 }}
              >
                {metaLeft}
              </Text>
              {commentCount && commentCount > 0 ? (
                <View
                  testID="feed-card-comment-count"
                  style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}
                >
                  <Ionicons name="chatbubble-outline" size={iconSizes.sm} color="rgba(255,255,255,0.85)" />
                  <Text
                    variant="body"
                    numberOfLines={1}
                    style={{ color: 'rgba(255,255,255,0.85)', marginLeft: 4 }}
                  >
                    {commentCount}
                  </Text>
                </View>
              ) : (
                <Text
                  variant="body"
                  numberOfLines={1}
                  style={{ color: 'rgba(255,255,255,0.85)', flexShrink: 0 }}
                >
                  {metaRight}
                </Text>
              )}
            </View>
          </View>

          {badge ? (
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 9999,
                backgroundColor: BADGE_BG,
              }}
            >
              <Text variant="bodySm" style={{ color: colors.light.fg['on-media'] }} numberOfLines={1}>
                {badge}
              </Text>
            </View>
          ) : null}

          {statBadge && statBadge.count > 0 ? (
            <View
              testID={statBadge.testID}
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
              <Ionicons name={statBadge.icon} size={iconSizes.sm} color="rgba(255,255,255,0.85)" />
              <Text
                variant="bodySm"
                numberOfLines={1}
                style={{ color: 'rgba(255,255,255,0.85)', marginLeft: 4 }}
              >
                {statBadge.count}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
