import { ScrollView } from 'react-native';
import { BottomSheet, Button, Checkbox, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { TASK_FILTERS, type TaskFilter } from '../../../lib/orgs/taskBoard';

/** Every filter of the Tareas screen, ticked on or off; they combine, and the sheet stays open while you pick. */
export function TaskFilterSheet({
  visible,
  value,
  onToggle,
  onClear,
  onClose,
}: {
  visible: boolean;
  value: ReadonlySet<TaskFilter>;
  onToggle: (filter: TaskFilter) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('groups.tasks.filter.sheetTitle')}
      closeLabel={t('common.close')}
      testID="task-filter-sheet"
      footer={
        <VStack className="px-5 pt-3">
          <Button variant="secondary" onPress={onClear} disabled={value.size === 0} fullWidth testID="task-filter-clear">
            {t('groups.tasks.filter.clear')}
          </Button>
        </VStack>
      }
    >
      <ScrollView style={{ flexShrink: 1 }}>
        <VStack gap={4} className="px-5 pb-4">
          {TASK_FILTERS.map((f) => (
            <Checkbox
              key={f}
              value={value.has(f)}
              onValueChange={() => onToggle(f)}
              label={t(`groups.tasks.filter.${f}`)}
              testID={`task-filter-option-${f}`}
            />
          ))}
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
