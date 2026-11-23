import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { asambleaTaskInput, isAsambleaTask } from '@cultuvilla/shared/models/organization';
import { createGroupTask, type GroupTask, type TaskTemplate } from '@cultuvilla/shared/services/groupTaskService';
import { Button, Card, HStack, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { offsetLabel } from '../../../lib/orgs/tasks';

/**
 * The admins' part of the group's Tareas screen, above the leaderboard that closes it: the templates (open
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

      <Card testID="templates-section">
        <VStack gap={3}>
          <HStack justify="between" align="center">
            <HStack gap={2} align="center" className="flex-1">
              <Ionicons name="copy-outline" size={iconSizes.md} color={colors.light.fg.primary} />
              <Text className="font-bold">{t('groups.tasks.templates.title')}</Text>
            </HStack>
            <Button size="md" variant="secondary" onPress={() => onOpenTemplate(null)} testID="templates-new">
              {t('groups.tasks.templates.new')}
            </Button>
          </HStack>
          {templates.length === 0 ? (
            <Text variant="bodySm" tone="muted">
              {t('groups.tasks.templates.none')}
            </Text>
          ) : (
            templates.map((tpl) => (
              <HStack key={tpl.id} gap={3} align="center" className="pt-3 border-t border-subtle" testID={`template-${tpl.id}`}>
                <Pressable className="flex-1" accessibilityRole="button" onPress={() => onOpenTemplate(tpl)} testID={`template-open-${tpl.id}`}>
                  <Text className="font-bold">{tpl.name}</Text>
                  <Text variant="bodySm" tone="muted">
                    {[t('groups.tasks.templates.items', { count: tpl.items.length }), ...tpl.items.slice(0, 2).map((i) => `${i.title} (${offsetLabel(t, i.offsetDays)})`)].join(' · ')}
                  </Text>
                </Pressable>
                <Button size="md" onPress={() => onApplyTemplate(tpl)} testID={`template-apply-${tpl.id}`}>
                  {t('groups.tasks.templates.apply')}
                </Button>
              </HStack>
            ))
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
