import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { Text } from '../primitives/Text';
import { Avatar } from '../primitives/Avatar';
import { Button } from '../primitives/Button';
import { Pressable } from '../primitives/Pressable';
import { DetailSectionHeading } from './DetailSectionHeading';
import { userHref } from '../../lib/navigation/routes';
import { showAlert } from '../../lib/dialogs';
import { useT } from '../../lib/i18n';
import {
  getPendingOrgJoinRequests,
  respondToOrgJoinRequest,
  type OrgJoinDecision,
} from '@cultuvilla/shared/services/orgJoinRequestService';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { buildDisplayName } from '@cultuvilla/shared/models/person';
import type { OrgJoinRequestData } from '@cultuvilla/shared/models/organization/OrgJoinRequestDataModel';

export interface Requester {
  name: string;
  photoURL: string | null;
}

/** Name + photo for a requester. Best-effort: a private persona falls back. */
export async function resolveRequester(userId: string, fallback: string): Promise<Requester> {
  const person = await getPersonByUserId(userId).catch(() => null);
  const name = person ? buildDisplayName(person).trim() : '';
  return { name: name || fallback, photoURL: person?.photoURL ?? null };
}

/** One pending request with its accept / reject buttons. */
export function OrgJoinRequestRow({
  request,
  requester,
  subtitle,
  busy,
  onDecide,
}: {
  request: OrgJoinRequestData;
  requester: Requester;
  subtitle: string;
  busy: boolean;
  onDecide: (decision: OrgJoinDecision) => void;
}) {
  const { t } = useT();
  return (
    <VStack gap={2} className="bg-surface border border-subtle rounded-xl p-3">
      <Pressable onPress={() => router.push(userHref(request.userId))}>
        <HStack gap={2} className="items-center">
          <Avatar
            uri={requester.photoURL ?? undefined}
            size={40}
            initials={requester.name.charAt(0).toUpperCase()}
          />
          <VStack gap={0} className="flex-1">
            <Text className="font-semibold">{requester.name}</Text>
            <Text tone="muted" variant="caption">
              {subtitle}
            </Text>
          </VStack>
        </HStack>
      </Pressable>
      <HStack gap={2}>
        <Button
          onPress={() => onDecide('approved')}
          loading={busy}
          testID={`approve-join-${request.orgId}-${request.userId}`}
        >
          {t('organization.joinRequests.approve')}
        </Button>
        <Button
          variant="ghost"
          onPress={() => onDecide('rejected')}
          loading={busy}
          testID={`reject-join-${request.orgId}-${request.userId}`}
        >
          {t('organization.joinRequests.reject')}
        </Button>
      </HStack>
    </VStack>
  );
}

/**
 * The pending join requests of one `approval` org, for someone who manages it.
 * Renders nothing when there are none.
 */
export function OrgJoinRequests({ orgId, onResolved }: { orgId: string; onResolved?: () => void }) {
  const { t } = useT();
  const [requests, setRequests] = useState<OrgJoinRequestData[]>([]);
  const [requesters, setRequesters] = useState<Record<string, Requester>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const pending = await getPendingOrgJoinRequests(orgId).catch(() => []);
    setRequests(pending);
    const resolved = await Promise.all(
      pending.map(async (r) => [r.userId, await resolveRequester(r.userId, r.userId)] as const),
    );
    setRequesters(Object.fromEntries(resolved));
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = (request: OrgJoinRequestData, decision: OrgJoinDecision) => {
    setBusyUserId(request.userId);
    respondToOrgJoinRequest(request.orgId, request.userId, decision)
      .then(async () => {
        await load();
        onResolved?.();
      })
      .catch((e: unknown) => showAlert(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusyUserId(null));
  };

  if (requests.length === 0) return null;

  return (
    <VStack gap={2}>
      <DetailSectionHeading>{t('organization.joinRequests.title')}</DetailSectionHeading>
      {requests.map((r) => (
        <OrgJoinRequestRow
          key={r.userId}
          request={r}
          requester={requesters[r.userId] ?? { name: r.userId, photoURL: null }}
          subtitle={t('organization.joinRequests.wantsToJoin')}
          busy={busyUserId === r.userId}
          onDecide={(decision) => decide(r, decision)}
        />
      ))}
    </VStack>
  );
}
