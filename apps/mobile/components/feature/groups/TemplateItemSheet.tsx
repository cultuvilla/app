import { useEffect, useState } from 'react';
import { MAX_SHIFT_SLOTS, MAX_TEMPLATE_OFFSET_DAYS, type TaskTemplateItem } from '@cultuvilla/shared/models/organization';
import { BottomSheet, Button, Input, Text, VStack } from '../../primitives';
import { SegmentedToggle } from '../SegmentedToggle';
import { useT } from '../../../lib/i18n';
import { parseIntIn } from '../../../lib/orgs/tasks';

type When = 'before' | 'same' | 'after';

const whenOf = (offsetDays: number): When => (offsetDays < 0 ? 'before' : offsetDays > 0 ? 'after' : 'same');

/**
 * One task of a template, written on its own: what to do, and when — before,
 * on or after the date the template is applied to, so nobody has to think in
 * negative numbers. Notes and time are kept from the item being edited.
 */
export function TemplateItemSheet({
  visible,
  item,
  onSave,
  onRemove,
  onClose,
}: {
  visible: boolean;
  /** null = a new task. */
  item: TaskTemplateItem | null;
  onSave: (item: TaskTemplateItem) => void;
  /** Present when editing an existing task. */
  onRemove: (() => void) | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<When>('same');
  const [days, setDays] = useState('');
  const [slots, setSlots] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(item?.title ?? '');
    setWhen(whenOf(item?.offsetDays ?? 0));
    setDays(item && item.offsetDays !== 0 ? String(Math.abs(item.offsetDays)) : '');
    setSlots(item?.slots ? String(item.slots) : '');
    setError(null);
  }, [visible, item]);

  const save = () => {
    if (!title.trim()) return setError(t('groups.tasks.templates.itemTitleRequired'));
    let offsetDays = 0;
    if (when !== 'same') {
      const n = parseIntIn(days, 1, MAX_TEMPLATE_OFFSET_DAYS);
      if (n === null) return setError(t('groups.tasks.templates.daysInvalid'));
      offsetDays = when === 'before' ? -n : n;
    }
    const slotCount = slots.trim() ? parseIntIn(slots, 1, MAX_SHIFT_SLOTS) : null;
    if (slots.trim() && slotCount === null) return setError(t('groups.tasks.form.slotsInvalid'));
    onSave({ title: title.trim(), notes: item?.notes ?? null, offsetDays, time: item?.time ?? null, slots: slotCount });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t(item ? 'groups.tasks.templates.itemTitleEdit' : 'groups.tasks.templates.itemTitleNew')}
      closeLabel={t('common.close')}
      testID="template-item-sheet"
      footer={
        <VStack gap={2} className="px-5 pt-3">
          {error ? (
            <Text variant="bodySm" tone="danger" testID="template-item-error">
              {error}
            </Text>
          ) : null}
          <Button onPress={save} fullWidth testID="template-item-done">
            {t(item ? 'groups.tasks.templates.itemSave' : 'groups.tasks.templates.itemAdd')}
          </Button>
          {onRemove ? (
            <Button variant="ghost" onPress={onRemove} fullWidth testID="template-item-remove">
              {t('groups.tasks.templates.removeItem')}
            </Button>
          ) : null}
        </VStack>
      }
    >
      <VStack gap={4} className="px-5 pt-2 pb-4">
        <Input
          label={t('groups.tasks.templates.itemWhat')}
          value={title}
          onChangeText={setTitle}
          autoFocus={!item}
          testID="template-item-title"
        />
        <VStack gap={2}>
          <Text variant="bodySm" className="font-bold">
            {t('groups.tasks.templates.when')}
          </Text>
          <SegmentedToggle
            testID="template-item-when"
            value={when}
            options={[
              { value: 'before', label: t('groups.tasks.templates.whenBefore') },
              { value: 'same', label: t('groups.tasks.templates.whenSame') },
              { value: 'after', label: t('groups.tasks.templates.whenAfter') },
            ]}
            onChange={setWhen}
          />
          {when !== 'same' ? (
            <Input
              label={t(when === 'before' ? 'groups.tasks.templates.daysBefore' : 'groups.tasks.templates.daysAfter')}
              value={days}
              onChangeText={setDays}
              keyboardType="number-pad"
              testID="template-item-days"
            />
          ) : null}
        </VStack>
        <Input
          label={t('groups.tasks.templates.slots')}
          value={slots}
          onChangeText={setSlots}
          keyboardType="number-pad"
          testID="template-item-slots"
        />
      </VStack>
    </BottomSheet>
  );
}
