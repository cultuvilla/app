import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import {
  VStack,
  HStack,
  Text,
  Escudo,
  Pressable,
  Button,
  BarrioPicker,
} from '../primitives';
import { useT } from '../../lib/i18n';

export interface JoinVillageModalProps {
  /** Null hides the modal; a municipality opens it for that village. */
  municipality: { id: string; name: string; escudoUrl: string | null; escudoFill?: boolean } | null;
  busy?: boolean;
  onCancel: () => void;
  /** Confirm the join. barrioId is the picked residence barrio, or null for whole village. */
  onConfirm: (barrioId: string | null) => void;
}

/**
 * Confirm-to-join dialog shared by every "unirte a un pueblo" surface
 * (discovery list + village home). Shows the village identity (escudo + name)
 * and, when the village has approved barrios, a picker to choose the resident's
 * barrio in one step. Replaces the per-surface Alert.alert / window.confirm path
 * (a no-op / picker-incapable on web).
 */
export function JoinVillageModal({ municipality, busy = false, onCancel, onConfirm }: JoinVillageModalProps) {
  const { t } = useT();
  const [barrioId, setBarrioId] = useState<string | null>(null);

  // Reset the chosen barrio whenever the target village changes, so a barrio
  // picked for one village can't leak into the next join.
  useEffect(() => {
    setBarrioId(null);
  }, [municipality?.id]);

  return (
    <Modal
      visible={municipality !== null}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <Pressable
        accessible={false}
        onPress={() => {
          if (!busy) onCancel();
        }}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        className="items-center justify-center px-8"
      >
        {/* Inner press-catcher: taps inside the card must not dismiss. */}
        <Pressable
          accessible={false}
          // Its backdrop is not an accessibility element, so VoiceOver closes the
          // sheet with the escape gesture instead.
          onAccessibilityEscape={() => {
            if (!busy) onCancel();
          }}
          onPress={() => {}}
          className="w-full rounded-lg bg-surface-elevated p-5 border border-subtle"
        >
          {municipality ? (
            <VStack gap={3}>
              <HStack gap={3} className="items-center">
                <View className="bg-surface rounded-full overflow-hidden p-1">
                  <Escudo
                    url={municipality.escudoUrl}
                    size={48}
                    fill={municipality.escudoFill ?? false}
                    fallbackInitial={municipality.name}
                  />
                </View>
                <Text variant="h3" className="flex-1">
                  {municipality.name}
                </Text>
              </HStack>
              <Text tone="muted">{t('village.joinConfirm.body')}</Text>
              <BarrioPicker
                label={t('village.joinConfirm.barrioLabel')}
                municipalityId={municipality.id}
                value={barrioId}
                onChange={setBarrioId}
                wholeVillageLabel={t('profile.personForm.wholeVillage')}
              />
              <HStack gap={3} className="justify-end items-center">
                <Button variant="ghost" onPress={onCancel} disabled={busy} testID="join-village-cancel">
                  {t('village.joinConfirm.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onPress={() => onConfirm(barrioId)}
                  loading={busy}
                  testID="join-village-confirm"
                >
                  {t('village.joinConfirm.confirm')}
                </Button>
              </HStack>
            </VStack>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
