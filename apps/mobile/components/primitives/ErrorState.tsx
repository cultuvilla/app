import { View } from 'react-native';
import { colors } from '@cultuvilla/shared/design-system';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { VStack } from './VStack';
import { Button } from './Button';
import { useT } from '../../lib/i18n';
import { errorKind, type ErrorKind } from '../../lib/errorKind';

const ICON: Record<ErrorKind, keyof typeof Ionicons.glyphMap> = {
  network: 'cloud-offline-outline',
  data: 'alert-circle-outline',
  unknown: 'alert-circle-outline',
};

export interface ErrorStateProps {
  /**
   * The caught error. Used to tailor the message — an offline read reads
   * differently from a data problem. Pass the raw thrown value (or its message
   * string); leave undefined for a generic message.
   */
  error?: unknown;
  /** Optional heading. Omitted (no red banner) unless a caller supplies one. */
  title?: string;
  /** Overrides the auto-classified body message. */
  message?: string;
  /** When provided, renders a "Reintentar" button wired to this callback. */
  onRetry?: () => void | Promise<void>;
}

/**
 * Friendly, localized full-area error/empty state. Use in place of dumping a raw
 * exception into the UI: the technical error is still logged to the console for
 * devs, while the user sees an illustration + a message they can act on. The
 * message is chosen from the error kind (connection vs. data) unless `message`
 * overrides it. Pass `onRetry` (e.g. a hook's `reload`) to surface a retry.
 */
export function ErrorState({ error, title, message, onRetry }: ErrorStateProps) {
  const { t } = useT();
  const kind = errorKind(error);
  return (
    <View className="flex-1 items-center justify-center px-8">
      <VStack gap={2} className="items-center">
        {/* Terracotta accent (colors.ts light.bg.accent), not the default blue. */}
        <Ionicons name={ICON[kind]} size={48} color={colors.light.fg.accent} />
        {title ? (
          <Text variant="h3" className="text-center">
            {title}
          </Text>
        ) : null}
        <Text tone="muted" className="text-center">
          {message ?? t(`common.error.${kind}`)}
        </Text>
        {/* "Inténtalo de nuevo más tarde." on its own line — only for the
            auto-classified states, not custom messages like event-not-found. */}
        {message == null ? (
          <Text tone="muted" className="text-center">
            {t('common.error.retryLater')}
          </Text>
        ) : null}
        {onRetry ? (
          <Button variant="secondary" className="mt-2" onPress={() => void onRetry()}>
            {t('common.error.retry')}
          </Button>
        ) : null}
      </VStack>
    </View>
  );
}
