import { openVillage } from '../../lib/navigation/openVillage';
import { userHref, villageSectionHref } from '../../lib/navigation/routes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes, palette } from '@cultuvilla/shared/design-system';
import {
  Screen,
  VStack,
  HStack,
  Text,
  Button,
  Avatar,
  Pressable,
  ErrorDialog,
} from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { NotificationRow } from '../../components/feature/NotificationRow';
import { useT } from '../../lib/i18n';
import { useApproverStatus } from '../../lib/auth/useApproverStatus';
import { useAuth } from '../../lib/auth/useAuth';
import { respondToOrganizerRequest } from '@cultuvilla/shared/services/organizerRequestService';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { buildDisplayName } from '@cultuvilla/shared/models/person';
import { approveOrganization, rejectOrganization } from '@cultuvilla/shared/services/organizationService';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { getNotifications, markAllAsRead } from '@cultuvilla/shared/services/notificationService';
import { isOpenableNotification, openNotification } from '../../lib/notifications/openNotification';
import {
  actionableScope,
  buildActivityFeed,
  getActionableRequests,
  getMyPendingRequests,
} from '@cultuvilla/shared/services/inboxService';
import { watchCosaRequestsToAnswer, type CosaRequest } from '@cultuvilla/shared/services/cosatecaService';
import { CosaRequestRow } from '../../components/feature/groups/cosateca/CosaRows';
import { useWatch } from '../../lib/hooks/useWatch';
import { groupCosaRequestHref } from '../../lib/navigation/routes';
import { useMyGroups } from '../../lib/orgs/useMyGroups';
import { useInboxNames } from '../../lib/inbox/useInboxNames';
import {
  respondToOrgJoinRequest,
  type OrgJoinDecision,
} from '@cultuvilla/shared/services/orgJoinRequestService';
import type { OrgJoinRequestData } from '@cultuvilla/shared/models/organization/OrgJoinRequestDataModel';
import {
  OrgJoinRequestRow,
  resolveRequester,
} from '../../components/feature/OrgJoinRequests';
import type { ActivityItem } from '@cultuvilla/shared/services/inboxService';
import type { OrganizerRequestData } from '@cultuvilla/shared/models/municipality/OrganizerRequestDataModel';
import type { OrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';

type OrganizerRow = OrganizerRequestData & { id: string };
type OrgRow = OrganizationData & { id: string };
type ReportsRow = { municipalityId: string; name: string; slug: string; count: number };

export default function InboxScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const { loading, isSuperAdmin, adminVillageIds, adminOrgIds, canApprove } = useApproverStatus();
  const scope = useMemo(
    () => actionableScope({ isSuperAdmin, adminVillageIds, adminOrgIds }),
    [isSuperAdmin, adminVillageIds, adminOrgIds],
  );

  // ─── Actionable ("Necesita tu acción") state ────────────────────────────────
  const [organizerRows, setOrganizerRows] = useState<OrganizerRow[]>([]);
  const [orgRows, setOrgRows] = useState<OrgRow[]>([]);
  const [joinRows, setJoinRows] = useState<OrgJoinRequestData[]>([]);
  const [reportRows, setReportRows] = useState<ReportsRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // ─── Cosateca: requests waiting for this user's answer ───────────────────────
  // Not an approver's queue: anyone who offered something answers here, so it
  // renders whatever `canApprove` says.
  const cosaUid = user?.uid ?? null;
  const myGroups = useMyGroups(cosaUid);
  const groupsIAdmin = useMemo(
    () => myGroups.groups.filter((g) => g.role === 'admin').map((g) => g.org.id).sort(),
    [myGroups.groups],
  );
  const cosaReady = cosaUid !== null && myGroups.status === 'ready';
  const cosaToAnswer = useWatch<CosaRequest[]>(
    'cosateca:watchCosaRequestsToAnswer',
    cosaReady ? `${cosaUid}|${groupsIAdmin.join(',')}` : null,
    cosaReady ? (next, error) => watchCosaRequestsToAnswer(cosaUid, groupsIAdmin, next, error) : null,
  );
  const cosaRows = cosaToAnswer.data ?? [];

  // ─── Activity feed state ────────────────────────────────────────────────────
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Shared name maps (used by both the actionable cards and the activity feed's
  // pending-sent rows).
  const {
    municipalityNames,
    requesterByUid,
    orgNames,
    resolveMunicipalityNames,
    resolveRequesters,
    resolveOrgNames,
  } = useInboxNames();

  // Busy state keyed by `${type}-${id}`
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Error modal state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ─── Actionable load ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (loading) return;
    if (!canApprove) return; // non-approvers never have actionable items

    setDataLoading(true);
    try {
      // Reports load on focus, below.
      const { organizer, orgs, joins } = await getActionableRequests(scope, [
        'organizer',
        'orgs',
        'joins',
      ]);

      setOrganizerRows(organizer);
      setOrgRows(orgs);
      setJoinRows(joins);

      await resolveRequesters(
        joins.map((r) => r.userId),
        (uid) => resolveRequester(uid, uid),
      );
      await resolveOrgNames(joins.map((r) => r.orgId));

      // Best-effort: a requester with a private persona falls back to the uid.
      await resolveRequesters(
        organizer.map((r) => r.userId),
        async (uid) => {
          const p = await getPersonByUserId(uid).catch(() => null);
          return { name: p ? buildDisplayName(p) : uid, photoURL: p?.photoURL ?? null };
        },
      );

      await resolveMunicipalityNames([
        ...organizer.map((r) => r.municipalityId),
        ...orgs.map((r) => r.municipalityId),
      ]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setDataLoading(false);
    }
  }, [loading, canApprove, scope, resolveRequesters, resolveOrgNames, resolveMunicipalityNames]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ─── Open reports ────────────────────────────────────────────────────────────
  // On focus, not on mount: they are resolved on the pushed Denuncias screen, so
  // coming back here has to drop the ones just dealt with.
  useFocusEffect(
    useCallback(() => {
      if (loading || (scope.reports !== 'all' && scope.reports.length === 0)) return;
      let cancelled = false;

      void (async () => {
        try {
          const { reports } = await getActionableRequests(scope, ['reports']);

          const counts = new Map<string, number>();
          for (const r of reports) counts.set(r.municipalityId, (counts.get(r.municipalityId) ?? 0) + 1);

          const rows = await Promise.all(
            [...counts].map(async ([municipalityId, count]) => {
              const m = await getMunicipality(municipalityId).catch(() => null);
              return m ? { municipalityId, name: m.name, slug: m.slug, count } : null;
            }),
          );
          if (!cancelled) setReportRows(rows.filter((row) => row !== null));
        } catch (err) {
          if (!cancelled) setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [loading, scope]),
  );

  // ─── Activity load ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setActivityLoading(true);

    void (async () => {
      try {
        const [notifications, pendingSent] = await Promise.all([
          getNotifications(user.uid),
          getMyPendingRequests(user.uid),
        ]);
        if (cancelled) return;

        const feed = buildActivityFeed(notifications, pendingSent);
        setActivityItems(feed);

        // Resolve municipality names for pending-sent rows (organizer's
        // label is a municipalityId; org's label is already the org name —
        // see inboxService.getMyPendingRequests).
        const newMunicipalityIds = new Set<string>();
        const joinOrgIds: string[] = [];
        for (const item of feed) {
          if (item.kind !== 'pending-sent') continue;
          if (item.requestType === 'organizer') newMunicipalityIds.add(item.label);
          if (item.requestType === 'orgJoin') joinOrgIds.push(item.label);
        }
        await resolveOrgNames(joinOrgIds);
        await resolveMunicipalityNames(newMunicipalityIds);
        if (cancelled) return;

        // v1: mark everything read as soon as the Buzón is opened.
        await markAllAsRead(user.uid);
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, resolveOrgNames, resolveMunicipalityNames]);

  // ─── Actionable decision handlers ────────────────────────────────────────────
  async function handleOrganizerDecide(row: OrganizerRow, decision: 'approved' | 'rejected') {
    const key = `organizer-${row.id}`;
    setBusyKey(key);
    try {
      await respondToOrganizerRequest({ requestId: row.id, decision });
      setOrganizerRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleOrgDecide(row: OrgRow, decision: 'approved' | 'rejected') {
    const key = `org-${row.id}`;
    setBusyKey(key);
    try {
      if (decision === 'approved') {
        await approveOrganization(row.id);
      } else {
        await rejectOrganization(row.id);
      }
      setOrgRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleJoinDecide(row: OrgJoinRequestData, decision: OrgJoinDecision) {
    const key = `join-${row.orgId}-${row.userId}`;
    setBusyKey(key);
    try {
      await respondToOrgJoinRequest(row.orgId, row.userId, decision);
      setJoinRows((prev) =>
        prev.filter((r) => !(r.orgId === row.orgId && r.userId === row.userId)),
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  // ─── Render: actionable section ──────────────────────────────────────────────
  const hasActionable =
    organizerRows.length > 0 || orgRows.length > 0 || joinRows.length > 0 || reportRows.length > 0;

  function renderActionable() {
    if (dataLoading) {
      return (
        <View className="items-center justify-center py-6">
          <ActivityIndicator />
        </View>
      );
    }

    if (!hasActionable) return null;

    return (
      <VStack gap={4}>
        <Text variant="h2">{t('inbox.needsAction')}</Text>

        {/* Open reports, one row per village: they are resolved on its Denuncias screen */}
        {reportRows.length > 0 && (
          <VStack gap={2}>
            <Text variant="h3">{t('inbox.tab.reports')}</Text>
            {reportRows.map((row) => (
              <Pressable
                key={row.municipalityId}
                onPress={() => router.push(villageSectionHref(row.slug, 'denuncias'))}
                accessibilityRole="button"
                accessibilityLabel={`${row.name}: ${t('inbox.reportsCount', { count: row.count })}`}
                testID={`inbox-reports-${row.municipalityId}`}
                className="bg-surface border border-subtle rounded-xl p-3"
              >
                <HStack gap={2} className="items-center justify-between">
                  <VStack gap={0} className="flex-1">
                    <Text className="font-semibold">{row.name}</Text>
                    <Text tone="muted" variant="caption">
                      {t('inbox.reportsCount', { count: row.count })}
                    </Text>
                  </VStack>
                  <Ionicons name="chevron-forward" size={iconSizes.sm} color={palette.terracotta} />
                </HStack>
              </Pressable>
            ))}
          </VStack>
        )}

        {/* Organizer requests section */}
        {isSuperAdmin && organizerRows.length > 0 && (
          <VStack gap={2}>
            <Text variant="h3">{t('inbox.tab.organizer')}</Text>
            {organizerRows.map((row) => {
              const key = `organizer-${row.id}`;
              const municipalityName = municipalityNames[row.municipalityId] ?? row.municipalityId;
              const requester = requesterByUid[row.userId];
              const name = requester?.name ?? row.userId;
              return (
                // Not an accessibility element: on iOS one would swallow the
                // Aprobar/Rechazar buttons inside it, leaving VoiceOver users
                // (and XCUITest) unable to act on the request. The card's own
                // action — open the requester's profile — stays reachable
                // through the name, a button of its own below.
                <Pressable
                  key={row.id}
                  accessible={false}
                  onPress={() => router.push(userHref(row.userId))}
                  className="bg-surface border border-subtle rounded-xl p-3"
                >
                  <VStack gap={2}>
                    <HStack gap={2} className="items-center">
                      <Avatar
                        uri={requester?.photoURL ?? undefined}
                        size={40}
                        initials={name.charAt(0).toUpperCase()}
                      />
                      <VStack gap={0} className="flex-1">
                        <Pressable
                          onPress={() => router.push(userHref(row.userId))}
                          accessibilityRole="button"
                          accessibilityLabel={name}
                          testID={`organizer-requester-${row.id}`}
                        >
                          <Text className="font-semibold">{name}</Text>
                        </Pressable>
                        <HStack gap={1} className="items-center flex-wrap">
                          <Text tone="muted" variant="caption">
                            {t('inbox.wantsToAdminister')}
                          </Text>
                          {/* onStartShouldSetResponder claims the responder chain so
                              react-native-web stops the click from bubbling to the
                              outer card Pressable (RN's native responder system
                              already isolates this; the web DOM does not). */}
                          <View onStartShouldSetResponder={() => true}>
                            <Pressable
                              onPress={() =>
                                void openVillage(row.municipalityId)
                              }
                            >
                              <Text variant="caption" style={{ textDecorationLine: 'underline' }}>
                                {municipalityName}
                              </Text>
                            </Pressable>
                          </View>
                        </HStack>
                      </VStack>
                    </HStack>
                    {row.motivation && row.motivation.trim().length > 0 && (
                      <VStack gap={0}>
                        <Text tone="muted" variant="caption">
                          {t('inbox.motivation')}
                        </Text>
                        <Text className="italic text-sm">"{row.motivation}"</Text>
                      </VStack>
                    )}
                    <View onStartShouldSetResponder={() => true}>
                      <HStack gap={2}>
                        <Button
                          onPress={() => handleOrganizerDecide(row, 'approved')}
                          loading={busyKey === key}
                          testID={`approve-organizer-${row.id}`}
                        >
                          {t('inbox.approve')}
                        </Button>
                        <Button
                          variant="ghost"
                          onPress={() => handleOrganizerDecide(row, 'rejected')}
                          loading={busyKey === key}
                          testID={`reject-organizer-${row.id}`}
                        >
                          {t('inbox.reject')}
                        </Button>
                      </HStack>
                    </View>
                  </VStack>
                </Pressable>
              );
            })}
          </VStack>
        )}

        {/* Join requests for approval orgs this user administers */}
        {joinRows.length > 0 && (
          <VStack gap={2}>
            <Text variant="h3">{t('inbox.tab.orgJoin')}</Text>
            {joinRows.map((row) => (
              <OrgJoinRequestRow
                key={`${row.orgId}-${row.userId}`}
                request={row}
                requester={requesterByUid[row.userId] ?? { name: row.userId, photoURL: null }}
                subtitle={orgNames[row.orgId] ?? row.orgId}
                busy={busyKey === `join-${row.orgId}-${row.userId}`}
                onDecide={(decision) => void handleJoinDecide(row, decision)}
              />
            ))}
          </VStack>
        )}

        {/* Org-creation section */}
        {orgRows.length > 0 && (
          <VStack gap={2}>
            <Text variant="h3">{t('inbox.tab.org')}</Text>
            {orgRows.map((row) => {
              const key = `org-${row.id}`;
              const municipalityName = municipalityNames[row.municipalityId] ?? row.municipalityId;
              return (
                <VStack
                  key={row.id}
                  gap={2}
                  className="bg-surface border border-subtle rounded-xl p-3"
                >
                  <Text>{t('inbox.orgRow', { org: row.name, type: row.type })}</Text>
                  <Text tone="muted" variant="caption">
                    {municipalityName}
                  </Text>
                  <HStack gap={2}>
                    <Button
                      onPress={() => handleOrgDecide(row, 'approved')}
                      loading={busyKey === key}
                      testID={`approve-org-${row.id}`}
                    >
                      {t('inbox.approve')}
                    </Button>
                    <Button
                      variant="ghost"
                      onPress={() => handleOrgDecide(row, 'rejected')}
                      loading={busyKey === key}
                      testID={`reject-org-${row.id}`}
                    >
                      {t('inbox.reject')}
                    </Button>
                  </HStack>
                </VStack>
              );
            })}
          </VStack>
        )}
      </VStack>
    );
  }

  // ─── Render: activity section ────────────────────────────────────────────────
  function pendingSentLabel(item: Extract<ActivityItem, { kind: 'pending-sent' }>): string {
    if (item.requestType === 'organizer') {
      return t('inbox.pendingSent.organizer', {
        name: municipalityNames[item.label] ?? item.label,
      });
    }
    if (item.requestType === 'orgJoin') {
      return t('inbox.pendingSent.orgJoin', { name: orgNames[item.label] ?? item.label });
    }
    if (item.requestType === 'cosa') return t('inbox.pendingSent.cosa', { name: item.label });
    return t('inbox.pendingSent.org', { name: item.label });
  }

  function renderCosaRequests() {
    if (cosaRows.length === 0) return null;
    return (
      <VStack gap={2} testID="inbox-cosateca">
        {/* Under the approver's heading when it shows; its own otherwise. */}
        {canApprove && hasActionable && !dataLoading ? null : <Text variant="h2">{t('inbox.needsAction')}</Text>}
        <Text variant="h3">{t('groups.cosateca.inbox.title')}</Text>
        {cosaRows.map((row) => (
          <CosaRequestRow
            key={row.id}
            request={row}
            showRequester
            onPress={() => router.push(groupCosaRequestHref(row.orgId, row.id))}
          />
        ))}
      </VStack>
    );
  }

  function renderActivity() {
    if (activityLoading) {
      return (
        <View className="items-center justify-center py-6">
          <ActivityIndicator />
        </View>
      );
    }

    if (activityItems.length === 0) return null;

    return (
      <VStack gap={2}>
        <Text variant="h2">{t('inbox.activity')}</Text>
        <VStack gap={0}>
          {activityItems.map((item) =>
            item.kind === 'notification' ? (
              <NotificationRow
                key={item.id}
                title={item.notification.title}
                body={item.notification.body}
                read={item.notification.read}
                createdAt={item.notification.createdAt}
                onPress={
                  isOpenableNotification(item.notification)
                    ? () => void openNotification(item.notification)
                    : undefined
                }
              />
            ) : (
              <VStack key={item.id} gap={1} className="bg-surface border-b border-subtle px-4 py-3">
                <Text variant="bodySm" tone="muted">
                  {pendingSentLabel(item)}
                </Text>
                <Text variant="caption" tone="muted">
                  {t('inbox.pendingSent.waiting')}
                </Text>
              </VStack>
            ),
          )}
        </VStack>
      </VStack>
    );
  }

  // ─── Full-screen loading (approver status loading) ──────────────────────────
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator />
      </View>
    );
  }

  const isEmpty =
    !dataLoading &&
    !activityLoading &&
    !(canApprove && hasActionable) &&
    cosaRows.length === 0 &&
    activityItems.length === 0;

  return (
    <Screen padded={false}>
      <ScreenHeader title={t('inbox.title')} />

      <ErrorDialog message={errorMessage} onDismiss={() => setErrorMessage(null)} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
        {canApprove && renderActionable()}
        {renderCosaRequests()}
        {renderActivity()}
        {isEmpty && (
          <View className="p-4">
            <Text tone="muted">{t('inbox.empty')}</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
