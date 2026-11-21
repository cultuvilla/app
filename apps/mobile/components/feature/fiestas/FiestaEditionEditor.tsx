import { useState } from 'react';
import { fiestaEditionProblem, type FiestaBlock } from '@cultuvilla/shared/models';
import { deleteFiestaEdition, saveFiestaEdition } from '@cultuvilla/shared/services/fiestaEditionService';
import { Button, DateRangeField, HStack, Text, VStack } from '../../primitives';
import type { DayRange } from '../../../lib/date/dayRange';
import { showConfirm } from '../../../lib/dialogs';
import { useCallable } from '../../../lib/useCallable';
import { useT } from '../../../lib/i18n';
import type { NamedEdition } from '../../../lib/fiestas/villageFiestas';

interface Props {
  municipalityId: string;
  block: FiestaBlock;
  year: number;
  /** The edition being corrected, or null to propose one. */
  edition: NamedEdition | null;
  uid: string;
  /** The proposer and the village's admins may take an edition down (firestore.rules). */
  canDelete: boolean;
  onDone: () => void;
}

/**
 * Pick the days one block runs in one year. Opens on the block's month, and
 * checks the range with the same rule the model states, so Guardar is never
 * enabled for days that are not an edition of that year.
 */
export function FiestaEditionEditor({ municipalityId, block, year, edition, uid, canDelete, onDone }: Props) {
  const { t } = useT();
  const [range, setRange] = useState<DayRange | null>(edition ? { startDay: edition.startDay, endDay: edition.endDay } : null);
  const problem = range ? fiestaEditionProblem(year, range.startDay, range.endDay) : null;

  const save = useCallable({
    operation: 'fiestas:saveEdition',
    callable: (r: DayRange) => saveFiestaEdition({ municipalityId, blockId: block.id, year, startDay: r.startDay, endDay: r.endDay, uid }),
    onSuccess: onDone,
    swallow: true,
  });
  const remove = useCallable({
    operation: 'fiestas:deleteEdition',
    callable: (id: string) => deleteFiestaEdition(id),
    onSuccess: onDone,
    swallow: true,
  });

  return (
    <VStack gap={3} className="rounded-md border border-subtle bg-surface-elevated p-4" testID={`fiesta-edition-editor-${block.id}`}>
      <DateRangeField
        label={t('village.fiestas.programme.datesLabel', { name: block.name, year: String(year) })}
        value={range}
        onChange={setRange}
        initialMonth={new Date(year, block.month - 1, 1)}
        minDay={`${String(year)}-01-01`}
        maxDay={`${String(year + 1)}-01-31`}
        placeholder={t('village.fiestas.programme.datesPlaceholder')}
        testID={`fiesta-edition-range-${block.id}`}
      />
      {problem ? (
        <Text tone="danger" variant="bodySm" testID="fiesta-edition-problem">
          {t(`village.fiestas.programme.problem.${problem}`, { year: String(year) })}
        </Text>
      ) : null}
      <HStack gap={2}>
        <Button variant="secondary" onPress={onDone} className="flex-1" testID="fiesta-edition-cancel">
          {t('common.cancel')}
        </Button>
        <Button
          onPress={() => {
            if (range && !problem) void save.fire(range);
          }}
          disabled={!range || problem !== null || save.isPending}
          loading={save.isPending}
          className="flex-1"
          testID="fiesta-edition-save"
        >
          {t('common.save')}
        </Button>
      </HStack>
      {edition && canDelete ? (
        <Button
          variant="ghost"
          onPress={() =>
            showConfirm(
              t('village.fiestas.programme.removeTitle'),
              t('village.fiestas.programme.removeMessage'),
              () => {
                void remove.fire(edition.id);
              },
              { confirmText: t('village.fiestas.programme.remove'), cancelText: t('common.cancel') },
            )
          }
          disabled={remove.isPending}
          testID="fiesta-edition-remove"
        >
          {t('village.fiestas.programme.remove')}
        </Button>
      ) : null}
    </VStack>
  );
}
