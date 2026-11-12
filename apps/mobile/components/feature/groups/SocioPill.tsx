import { View } from 'react-native';
import { Text } from '../../primitives';

export type SocioPillTone = 'ok' | 'pending' | 'late' | 'plain';

const BOX: Record<SocioPillTone, string> = {
  ok: 'bg-success-subtle',
  pending: 'bg-surface border border-accent',
  late: 'bg-danger-subtle',
  plain: 'bg-surface border border-subtle',
};

const INK: Record<SocioPillTone, 'success' | 'danger' | 'onSubtle' | 'primary'> = {
  ok: 'success',
  pending: 'primary',
  late: 'danger',
  plain: 'onSubtle',
};

/** A short status label on a socio: their cuota, "sin app", "baja". */
export function SocioPill({ label, tone, testID }: { label: string; tone: SocioPillTone; testID?: string }) {
  return (
    <View className={`rounded-full px-2 py-0.5 ${BOX[tone]}`} testID={testID}>
      <Text variant="caption" tone={INK[tone]} className="font-bold">
        {label}
      </Text>
    </View>
  );
}
