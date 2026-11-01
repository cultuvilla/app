import { useMemo } from 'react';
import { fairShareCounts } from '@cultuvilla/shared/models/organization';
import type { GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { HStack, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import type { GroupMember } from '../../../lib/orgs/useOrgMembers';

/**
 * Admin only: tasks done per member this year, most first — who is carrying
 * the group. Members never see it (a public ranking reads as shaming).
 */
export function FairShare({ doneTasks, members, year }: { doneTasks: GroupTask[]; members: GroupMember[]; year: string }) {
  const { t } = useT();
  const rows = useMemo(
    () => fairShareCounts(doneTasks, members.map((m) => m.uid), year),
    [doneTasks, members, year],
  );
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.name ?? '—';

  return (
    <VStack gap={1} testID="fair-share">
      <Text className="font-bold">{t('groups.tasks.fairShare.title', { year })}</Text>
      <Text variant="bodySm" tone="muted">
        {t('groups.tasks.fairShare.hint')}
      </Text>
      {rows.map((r) => (
        <HStack key={r.uid} justify="between" className="py-1" testID={`fair-share-${r.uid}`}>
          <Text>{nameOf(r.uid)}</Text>
          <Text tone={r.count === 0 ? 'muted' : 'primary'} className="font-bold">
            {t('groups.tasks.fairShare.count', { count: r.count })}
          </Text>
        </HStack>
      ))}
    </VStack>
  );
}
