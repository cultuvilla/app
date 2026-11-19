import type { GroupPoll } from '@cultuvilla/shared/models/organization';
import { HStack, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';

/** A poll's results: votes per option, never who cast them. */
export function PollResults({ poll, tally, testID }: { poll: GroupPoll; tally: readonly number[]; testID?: string }) {
  const { t } = useT();
  const total = tally.reduce((sum, n) => sum + n, 0);
  return (
    <VStack gap={1} testID={testID}>
      <Text variant="caption" tone="muted" className="font-bold">
        {t('groups.transparency.avisos.results')}
      </Text>
      {total === 0 ? (
        <Text variant="caption" tone="muted">
          {t('groups.transparency.avisos.noVotes')}
        </Text>
      ) : (
        poll.options.map((option, i) => (
          <HStack key={i} justify="between" align="center">
            <Text variant="bodySm" className="flex-1">
              {option}
            </Text>
            <Text variant="bodySm" className="font-bold">
              {t('groups.transparency.avisos.votes', { count: tally[i] ?? 0 })}
            </Text>
          </HStack>
        ))
      )}
    </VStack>
  );
}
