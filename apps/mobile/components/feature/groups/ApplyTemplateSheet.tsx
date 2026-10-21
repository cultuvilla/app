import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import { applyTaskTemplate, type TaskTemplate } from '@cultuvilla/shared/services/groupTaskService';
import { formatDate } from '@cultuvilla/shared/utils';
import { BottomSheet, Button, DateField, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { dayKeyOfPickedDate, pickedDateOfDayKey, todayKey } from '../../../lib/orgs/cuota';
import { ChoiceRow } from './ChoiceRow';

export interface ChecklistEvent {
  id: string;
  title: string;
  startDate: Date;
}

type Target = 'event' | 'date';

/**
 * Admin: generate a template's tasks, dated from an anchor — one of the
 * group's upcoming events (its start day in Madrid) or a bare day. Opened with
 * a template (pick where) or from an event (pick which template).
 */
export function ApplyTemplateSheet({
  visible,
  orgId,
  uid,
  template,
  event,
  templates,
  events,
  onClose,
}: {
  visible: boolean;
  orgId: string;
  uid: string;
  /** null = pick one of `templates`. */
  template: TaskTemplate | null;
  /** Set = apply to this event. */
  event: ChecklistEvent | null;
  templates: TaskTemplate[];
  events: ChecklistEvent[];
  onClose: () => void;
}) {
  const { t } = useT();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>('event');
  const [eventId, setEventId] = useState<string | null>(null);
  const [day, setDay] = useState(todayKey());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTemplateId(template?.id ?? null);
    setTarget(event || events.length > 0 ? 'event' : 'date');
    setEventId(event?.id ?? null);
    setDay(todayKey());
  }, [visible, template, event, events.length]);

  const chosen = template ?? templates.find((x) => x.id === templateId) ?? null;
  const anchorEvent = event ?? events.find((e) => e.id === eventId) ?? null;
  const ready = chosen !== null && (target === 'date' || anchorEvent !== null);

  const apply = () => {
    if (!chosen) return;
    const anchorOn = target === 'event' && anchorEvent ? madridDayKey(anchorEvent.startDate) : day;
    setSaving(true);
    applyTaskTemplate(orgId, chosen, anchorOn, target === 'event' ? (anchorEvent?.id ?? null) : null, uid)
      .then((ids) => {
        showAlert(t('groups.tasks.templates.applied', { count: ids.length }));
        onClose();
      })
      .catch(() => showAlert(t('groups.tasks.error')))
      .finally(() => setSaving(false));
  };

  const pickRow = (key: string, label: string, sub: string | null, selected: boolean, onPress: () => void, testID: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      className={`px-3 py-2 rounded-md border ${selected ? 'border-accent bg-subtle' : 'border-subtle'}`}
    >
      <Text className={selected ? 'font-bold' : ''}>{label}</Text>
      {sub ? (
        <Text variant="bodySm" tone="muted">
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={chosen ? t('groups.tasks.templates.applyTitle', { name: chosen.name }) : t('groups.tasks.checklists.applyTemplate')}
      closeLabel={t('common.close')}
      testID="apply-template-sheet"
      footer={
        <VStack className="px-5 pt-3">
          <Button onPress={apply} loading={saving} disabled={!ready} fullWidth testID="apply-template-save">
            {t('groups.tasks.templates.apply')}
          </Button>
        </VStack>
      }
    >
      <ScrollView style={{ flexShrink: 1 }}>
        <VStack gap={2} className="px-5 pb-4">
          {template ? null : templates.length === 0 ? (
            <Text tone="muted">{t('groups.tasks.templates.none')}</Text>
          ) : (
            templates.map((x) =>
              pickRow(x.id, x.name, t('groups.tasks.templates.items', { count: x.items.length }), x.id === templateId, () => setTemplateId(x.id), `apply-template-pick-${x.id}`),
            )
          )}
          {event ? null : (
            <>
              <ChoiceRow
                testID="apply-template-target"
                value={target}
                options={[
                  { value: 'event', label: t('groups.tasks.templates.applyToEvent') },
                  { value: 'date', label: t('groups.tasks.templates.applyToDate') },
                ]}
                onChange={setTarget}
              />
              {target === 'event' ? (
                events.length === 0 ? (
                  <Text tone="muted">{t('groups.tasks.templates.noEvents')}</Text>
                ) : (
                  events.map((e) =>
                    pickRow(e.id, e.title, formatDate(e.startDate, 'short'), e.id === eventId, () => setEventId(e.id), `apply-template-event-${e.id}`),
                  )
                )
              ) : (
                <DateField
                  label={t('groups.tasks.templates.date')}
                  value={pickedDateOfDayKey(day)}
                  onChange={(d) => setDay(d ? dayKeyOfPickedDate(d) : todayKey())}
                  testID="apply-template-date"
                />
              )}
            </>
          )}
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
