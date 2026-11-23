import { useMemo, type ReactNode } from 'react';
import type { TransparentAviso } from '@cultuvilla/shared/models/organization';
import { fetchTransparentAvisos } from '@cultuvilla/shared/services/groupTransparencyService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Card, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { useGroupNotices } from '../../../lib/orgs/useGroupNotices';
import { useGroupTransparency } from '../../../lib/orgs/useGroupTransparency';
import { GroupNotices } from './GroupNotices';
import { PollResults } from './PollResults';

function audienceLabel(t: ReturnType<typeof useT>['t'], aviso: TransparentAviso): string {
  return aviso.audienceKind === 'event'
    ? t('groups.transparency.avisos.audience.event', { event: aviso.eventTitle ?? '' })
    : t(`groups.transparency.avisos.audience.${aviso.audienceKind}`);
}

/**
 * The avisos screen while the junta has "Avisos públicos" on: the member's own
 * notices as always (with their polls' results), then every other aviso the
 * junta sent, whoever it went to. Who read each one stays the junta's.
 */
export function TransparentAvisos({ orgId, uid, empty }: { orgId: string; uid: string; empty?: ReactNode }) {
  const { t } = useT();
  const mine = useGroupNotices(orgId, uid);
  const all = useGroupTransparency(`avisos|${orgId}`, () => fetchTransparentAvisos(orgId));
  const avisos = useMemo(() => (all.status === 'ready' ? all.data.avisos : []), [all]);
  const tallies = useMemo(() => new Map(avisos.flatMap((a) => (a.tally ? [[a.id, a.tally] as const] : []))), [avisos]);
  const mineIds = useMemo(() => new Set(mine.notices.map((m) => m.id)), [mine.notices]);
  const others = avisos.filter((a) => !mineIds.has(a.id));

  const settled = mine.status === 'ready' && (all.status === 'ready' || all.status === 'error');
  if (settled && mine.notices.length === 0 && others.length === 0 && all.status !== 'error') return empty ? <>{empty}</> : null;

  return (
    <VStack gap={4} testID="transparent-avisos">
      <GroupNotices orgId={orgId} uid={uid} tallies={tallies} />
      {all.status === 'error' ? (
        <Text tone="muted" variant="bodySm" testID="transparent-avisos-error">
          {t('groups.transparency.error')}
        </Text>
      ) : null}
      {others.length > 0 ? (
        <VStack gap={2}>
          <Text className="font-bold">{t('groups.transparency.avisos.title')}</Text>
          {others.map((a) => (
            <Card key={a.id} testID={`transparent-aviso-${a.id}`}>
              <VStack gap={1}>
                <Text className="font-bold">{a.title}</Text>
                <Text>{a.body}</Text>
                <Text variant="caption" tone="muted">
                  {[formatDate(new Date(a.sentAt), 'dayMonthShort'), audienceLabel(t, a), a.signerName].join(' · ')}
                </Text>
                {a.poll && a.tally ? (
                  <VStack gap={1} className="pt-2">
                    <Text className="font-bold">{a.poll.question}</Text>
                    <PollResults poll={a.poll} tally={a.tally} testID={`transparent-aviso-results-${a.id}`} />
                  </VStack>
                ) : null}
              </VStack>
            </Card>
          ))}
        </VStack>
      ) : null}
    </VStack>
  );
}
