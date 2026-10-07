import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../primitives/Screen';
import { VStack } from '../primitives/VStack';
import { Text } from '../primitives/Text';
import { DetailHeroImage } from './DetailHeroImage';
import { EntityDetailHeader, type EntityDetailAction } from './EntityDetailHeader';
import { DetailScrollProvider } from '../../lib/keyboard/DetailScrollContext';
import { useT } from '../../lib/i18n';

/**
 * Shared scaffold for every ENTITY detail screen. An "entity" is a
 * village-scoped object shown in a horizontal Section scroll (as a BigCard)
 * that opens a hero-image detail screen: event, festival-poster (cartel),
 * place, barrio, organization, news. (person + village are NOT entities — they
 * open into forms.) The scaffold owns the chrome — solid static header bar,
 * full-bleed flyer, title, loading / not-found states, and pull-to-refresh — so
 * each screen is a thin body: fetch data, pass `actions`, render `{children}`
 * and an optional `fab`.
 */
export type EntityDetailScaffoldProps = {
  loading: boolean;
  notFound?: boolean;
  imageUri: string | null;
  fallbackImageUri?: string | null;
  fallbackIcon: keyof typeof Ionicons.glyphMap;
  onBack?: () => void;
  actions?: EntityDetailAction[];
  title?: string;
  children?: ReactNode;
  /** Absolutely-positioned bottom affordance (register / join). Styles must
   * live on `style`, not `className`, to render on RN-Web. */
  fab?: ReactNode;
  scrollContentClassName?: string;
  /** Refetch the screen's data. When provided, the scaffold wires pull-to-refresh:
   * native `RefreshControl` on iOS/Android, the web gesture on the Hosting build. */
  onRefresh?: () => Promise<unknown> | void;
};

export function EntityDetailScaffold({
  loading,
  notFound = false,
  imageUri,
  fallbackImageUri = null,
  fallbackIcon,
  onBack,
  actions = [],
  title,
  children,
  fab,
  scrollContentClassName = 'pb-10',
  onRefresh,
}: EntityDetailScaffoldProps) {
  const { t } = useT();
  const busy = loading || notFound;

  const scrollRef = useRef<ScrollView>(null);
  const [nativeRefreshing, setNativeRefreshing] = useState(false);
  const runRefresh = async () => {
    if (!onRefresh) return;
    setNativeRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setNativeRefreshing(false);
    }
  };

  return (
    <Screen padded={false} topInset={false}>
      <EntityDetailHeader onBack={onBack} actions={busy ? [] : actions} />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : notFound ? (
        <View className="flex-1 items-center justify-center">
          <Text testID="entity-not-found">{t('common.notFound')}</Text>
        </View>
      ) : (
        <>
          {/* Screen avoids the keyboard; the composer scrolls itself into
              view via DetailScrollProvider. */}
          <View style={{ flex: 1 }}>
            <ScrollView
              ref={scrollRef}
              contentContainerClassName={scrollContentClassName}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                onRefresh ? (
                  <RefreshControl refreshing={nativeRefreshing} onRefresh={runRefresh} />
                ) : undefined
              }
            >
              <DetailHeroImage
                imageUri={imageUri}
                fallbackImageUri={fallbackImageUri}
                fallbackIcon={fallbackIcon}
                accessibilityLabel={title}
              />
              <VStack gap={3} className="p-4">
                {title ? <Text variant="h1">{title}</Text> : null}
                <DetailScrollProvider scrollRef={scrollRef}>{children}</DetailScrollProvider>
              </VStack>
            </ScrollView>
          </View>
          {fab}
        </>
      )}
    </Screen>
  );
}
