import { useState } from 'react';
import { asambleaTaskInput, isAsambleaTask } from '@cultuvilla/shared/models/organization';
import { createGroupTask, type GroupTask, type TaskTemplate } from '@cultuvilla/shared/services/groupTaskService';
import { Button, Card, HStack, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { offsetLabel } from '../../../lib/orgs/tasks';

/**
 * What closes the group's Tareas screen for its admins: the templates (open
 * one, apply one, write a new one) and, for a group with a socio roster that
 * tracks no asamblea, the offer of a yearly one — never created for it.
 */
export function GroupTasks({
  orgId,
  uid,
  today,
  tasks,
  tasksReady,
  templates,
  suggestAsamblea,
  onOpenTemplate,
  onApplyTemplate,
}: {
  orgId: string;
  uid: string;
  today: string;
  /** Every open task and those done this year, to tell whether an asamblea is tracked. */
  tasks: readonly GroupTask[];
  tasksReady: boolean;
  templates: readonly TaskTemplate[];
  suggestAsamblea: boolean;
  /** null = a new template. */
  onOpenTemplate: (template: TaskTemplate | null) => void;
  onApplyTemplate: (template: TaskTemplate) => void;
}) {
  const { t } = useT();
  const [creatingAsamblea, setCreatingAsamblea] = useState(false);
  const showAsamblea = suggestAsamblea && tasksReady && !tasks.some(isAsambleaTask);
  const createAsamblea = () => {
    setCreatingAsamblea(true);
    createGroupTask(orgId, asambleaTaskInput(today, { title: t('groups.tasks.asamblea.title'), agenda: t('groups.tasks.asamblea.agenda') }), uid)
      .catch(() => showAlert(t('groups.tasks.error')))
      .finally(() => setCreatingAsamblea(false));
  };

  return (
    <VStack gap={3} testID="group-tasks">
      {showAsamblea ? (
        <Card testID="asamblea-suggestion">
          <VStack gap={2}>
            <Text className="font-bold">{t('groups.tasks.asamblea.suggestionTitle')}</Text>
            <Text variant="bodySm" tone="muted">
              {t('groups.tasks.asamblea.suggestionBody')}
            </Text>
            <HStack>
              <Button size="md" onPress={createAsamblea} loading={creatingAsamblea} testID="asamblea-create">
                {t('groups.tasks.asamblea.create')}
              </Button>
            </HStack>
          </VStack>
        </Card>
      ) : null}

      <HStack justify="between" align="center" className="pt-2">
        <Text className="font-bold">{t('groups.tasks.templates.title')}</Text>
        <Button size="md" variant="ghost" onPress={() => onOpenTemplate(null)} testID="templates-new">
          {t('groups.tasks.templates.new')}
        </Button>
      </HStack>
      {templates.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          {t('groups.tasks.templates.none')}
        </Text>
      ) : (
        templates.map((tpl) => (
          <HStack key={tpl.id} gap={3} align="center" className="py-1" testID={`template-${tpl.id}`}>
            <Pressable className="flex-1" accessibilityRole="button" onPress={() => onOpenTemplate(tpl)} testID={`template-open-${tpl.id}`}>
              <Text className="font-bold">{tpl.name}</Text>
              <Text variant="bodySm" tone="muted">
                {[t('groups.tasks.templates.items', { count: tpl.items.length }), ...tpl.items.slice(0, 2).map((i) => `${i.title} (${offsetLabel(t, i.offsetDays)})`)].join(' · ')}
              </Text>
            </Pressable>
            <Button size="md" variant="secondary" onPress={() => onApplyTemplate(tpl)} testID={`template-apply-${tpl.id}`}>
              {t('groups.tasks.templates.apply')}
            </Button>
          </HStack>
        ))
      )}
    </VStack>
  );
}
