import { useEffect, useState } from 'react';
import { Modal, Pressable as RNPressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PartialDate } from '@cultuvilla/shared/models/person';
import { Button } from '../primitives/Button';
import { Text } from '../primitives/Text';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { PartialDateField } from '../primitives/PartialDateField';
import { useT } from '../../lib/i18n';

export interface BuriedPersonaOption {
  id: string;
  name: string;
  buriedHere: boolean;
}

export interface BuriedSheetProps {
  visible: boolean;
  personas: BuriedPersonaOption[];
  busy: boolean;
  autoSelectId?: string;
  onClose: () => void;
  onCreateNew: () => void;
  onConfirm: (personId: string, deathDate: PartialDate | null) => void;
}

/**
 * Two-phase difunto picker for a cemetery. Phase 1 lists the caller's personas a
 * cargo (marking any already buried here) plus a create-new row. Phase 2 shows a
 * condolence line and an optional approximate death date, then confirms.
 *
 * Follows AttendeeSheet's RN-Web-safe Modal pattern (styles on style/className,
 * insets.bottom padding).
 */
export function BuriedSheet({
  visible,
  personas,
  busy,
  autoSelectId,
  onClose,
  onCreateNew,
  onConfirm,
}: BuriedSheetProps) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [deathDate, setDeathDate] = useState<PartialDate | null>(null);

  // Reset on each open; auto-advance to the date phase when a persona was just
  // created (autoSelectId) and is present in the list.
  useEffect(() => {
    if (!visible) return;
    const auto = autoSelectId && personas.some((p) => p.id === autoSelectId) ? autoSelectId : null;
    setSelected(auto);
    setDeathDate(null);
    // personas identity intentionally excluded — re-seed only on open / autoSelect change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, autoSelectId]);

  const inDatePhase = selected != null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <RNPressable
        accessible={false}
        onPress={() => {
          if (!busy) onClose();
        }}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
        className="justify-end"
      >
        <RNPressable
          accessible={false}
          // Its backdrop is not an accessibility element, so VoiceOver closes the
          // sheet with the escape gesture instead.
          onAccessibilityEscape={() => {
            if (!busy) onClose();
          }}
          onPress={() => {}}
          className="rounded-t-2xl bg-surface-elevated p-5 border-t border-subtle"
          style={{ paddingBottom: insets.bottom + 20 }}
        >
          {inDatePhase ? (
            <VStack gap={3}>
              <Text variant="h3">{t('village.placeDetail.condolence')}</Text>
              <PartialDateField
                label={t('village.placeDetail.deathDatePrompt')}
                value={deathDate}
                onChange={setDeathDate}
                showClearAction={false}
                testID="buried-death-date"
              />
              <Button
                onPress={() => selected && onConfirm(selected, deathDate)}
                loading={busy}
                fullWidth
                testID="buried-confirm"
              >
                {t('village.placeDetail.addAction')}
              </Button>
            </VStack>
          ) : (
            <VStack gap={3}>
              <Text variant="h3">{t('village.placeDetail.addDifunto')}</Text>
              <ScrollView style={{ maxHeight: 320 }}>
                <VStack gap={2}>
                  {personas.map((p) => (
                    <RNPressable
                      key={p.id}
                      testID={`buried-persona-${p.id}`}
                      onPress={() => {
                        if (!p.buriedHere) setSelected(p.id);
                      }}
                      disabled={p.buriedHere}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: p.buriedHere }}
                      className={`flex-row items-center justify-between rounded-lg border p-3 ${
                        p.buriedHere ? 'border-subtle opacity-60' : 'border-subtle'
                      }`}
                    >
                      <Text className="flex-1">{p.name}</Text>
                      {p.buriedHere ? (
                        <Text tone="muted" variant="caption">
                          {t('village.placeDetail.alreadyBuried')}
                        </Text>
                      ) : null}
                    </RNPressable>
                  ))}
                  <RNPressable
                    onPress={onCreateNew}
                    testID="buried-create"
                    accessibilityRole="button"
                    className="flex-row items-center rounded-lg border border-dashed border-subtle p-3"
                  >
                    <HStack gap={3} className="items-center flex-1">
                      <Text tone="muted" style={{ fontSize: 18 }}>
                        ＋
                      </Text>
                      <Text tone="muted" className="flex-1">
                        {t('village.placeDetail.createPersona')}
                      </Text>
                    </HStack>
                  </RNPressable>
                </VStack>
              </ScrollView>
            </VStack>
          )}
        </RNPressable>
      </RNPressable>
    </Modal>
  );
}
