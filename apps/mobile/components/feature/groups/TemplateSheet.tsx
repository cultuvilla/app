import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import {
  MAX_SHIFT_SLOTS,
  MAX_TEMPLATE_ITEMS,
  MAX_TEMPLATE_OFFSET_DAYS,
  type TaskTemplateItem,
} from '@cultuvilla/shared/models/organization';
import { deleteTaskTemplate, saveTaskTemplate, type TaskTemplate } from '@cultuvilla/shared/services/groupTaskService';
import { BottomSheet, Button, Card, Input, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { parseIntIn } from '../../../lib/orgs/tasks';

interface Draft {
  key: number;
  title: string;
  offset: string;
  slots: string;
  /** Kept from the saved item: the form edits title, offset and slots only. */
  notes: string | null;
  time: string | null;
}

let draftKey = 0;
const draftOf = (item?: TaskTemplateItem): Draft => ({
  key: ++draftKey,
  title: item?.title ?? '',
  offset: item ? String(item.offsetDays) : '0',
  slots: item?.slots ? String(item.slots) : '',
  notes: item?.notes ?? null,
  time: item?.time ?? null,
});

/**
 * Admin: write or edit a checklist template — a name and its tasks, each dated
 * by days before (negative) or after the date it is applied to.
 */
export function TemplateSheet({
  visible,
  orgId,
  uid,
  template,
  initial = null,
  onClose,
}: {
  visible: boolean;
  orgId: string;
  uid: string;
  /** null = a new template. */
  template: TaskTemplate | null;
  /** A new template's starting point — an event's checklist being saved. */
  initial?: { name: string; items: TaskTemplateItem[] } | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const start = template ?? initial;
    setName(start?.name ?? '');
    setDrafts(start && start.items.length > 0 ? start.items.map(draftOf) : [draftOf()]);
    setError(null);
  }, [visible, template, initial]);

  const patch = (key: number, change: Partial<Draft>) => setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...change } : d)));

  const save = () => {
    if (!name.trim()) return setError(t('groups.tasks.templates.nameRequired'));
    const filled = drafts.filter((d) => d.title.trim());
    if (filled.length === 0) return setError(t('groups.tasks.templates.itemsRequired'));
    const items: TaskTemplateItem[] = [];
    for (const d of filled) {
      const offsetDays = parseIntIn(d.offset, -MAX_TEMPLATE_OFFSET_DAYS, MAX_TEMPLATE_OFFSET_DAYS);
      if (offsetDays === null) return setError(t('groups.tasks.templates.offsetInvalid'));
      const slots = d.slots.trim() ? parseIntIn(d.slots, 1, MAX_SHIFT_SLOTS) : null;
      if (d.slots.trim() && slots === null) return setError(t('groups.tasks.form.slotsInvalid'));
      items.push({ title: d.title, notes: d.notes, offsetDays, time: d.time, slots });
    }
    setError(null);
    setSaving(true);
    saveTaskTemplate(orgId, template?.id ?? null, { name, items }, uid)
      .then(onClose)
      .catch(() => showAlert(t('groups.tasks.error')))
      .finally(() => setSaving(false));
  };

  const remove = () => {
    if (!template) return;
    showConfirm(
      t('groups.tasks.templates.delete'),
      t('groups.tasks.templates.deleteConfirm'),
      () => {
        deleteTaskTemplate(orgId, template.id)
          .then(onClose)
          .catch(() => showAlert(t('groups.tasks.error')));
      },
      { confirmText: t('common.delete'), cancelText: t('common.cancel') },
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t(template ? 'groups.tasks.templates.titleEdit' : 'groups.tasks.templates.titleNew')}
      closeLabel={t('common.close')}
      testID="template-sheet"
      footer={
        <VStack gap={2} className="px-5 pt-3">
          {error ? (
            <Text variant="bodySm" tone="danger" testID="template-error">
              {error}
            </Text>
          ) : null}
          <Button onPress={save} loading={saving} fullWidth testID="template-save">
            {t('groups.tasks.templates.save')}
          </Button>
          {template ? (
            <Button variant="ghost" onPress={remove} fullWidth testID="template-delete">
              {t('groups.tasks.templates.delete')}
            </Button>
          ) : null}
        </VStack>
      }
    >
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
        <VStack gap={3} className="px-5 pb-4">
          <Input label={t('groups.tasks.templates.name')} value={name} onChangeText={setName} testID="template-name" />
          {drafts.map((d, i) => (
            <Card key={d.key} testID={`template-item-${String(i)}`}>
              <VStack gap={2}>
                <Input label={t('groups.tasks.templates.item')} value={d.title} onChangeText={(v) => patch(d.key, { title: v })} testID={`template-item-title-${String(i)}`} />
                <Input
                  label={t('groups.tasks.templates.offset')}
                  value={d.offset}
                  onChangeText={(v) => patch(d.key, { offset: v })}
                  keyboardType="numbers-and-punctuation"
                  testID={`template-item-offset-${String(i)}`}
                />
                <Input
                  label={t('groups.tasks.templates.slots')}
                  value={d.slots}
                  onChangeText={(v) => patch(d.key, { slots: v })}
                  keyboardType="number-pad"
                  testID={`template-item-slots-${String(i)}`}
                />
                <Button variant="ghost" onPress={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))} testID={`template-item-remove-${String(i)}`}>
                  {t('groups.tasks.templates.removeItem')}
                </Button>
              </VStack>
            </Card>
          ))}
          {drafts.length < MAX_TEMPLATE_ITEMS ? (
            <Button variant="secondary" onPress={() => setDrafts((prev) => [...prev, draftOf()])} testID="template-add-item">
              {t('groups.tasks.templates.addItem')}
            </Button>
          ) : null}
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
