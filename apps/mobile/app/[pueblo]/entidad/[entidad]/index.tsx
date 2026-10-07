import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Text } from '../../../../components/primitives/Text';
import { VStack } from '../../../../components/primitives/VStack';
import { NaturalImage } from '../../../../components/primitives/NaturalImage';
import { EntityDetailScaffold } from '../../../../components/feature/EntityDetailScaffold';
import type { EntityDetailAction } from '../../../../components/feature/EntityDetailHeader';
import { ENTITY_FALLBACK_ICON } from '../../../../lib/entities/registry';
import { useT } from '../../../../lib/i18n';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { useAuth } from '../../../../lib/auth/useAuth';
import { useRegisterGate } from '../../../../lib/auth/RegisterGateContext';
import { useOrgCapabilities } from '../../../../lib/auth/useOrgCapabilities';
import { EntityComments } from '../../../../components/feature/EntityComments';
import { OrgMembersList } from '../../../../components/feature/OrgMembersList';
import { OrgEventsSection } from '../../../../components/feature/OrgEventsSection';
import { useShareDeepLink } from '../../../../lib/deeplink/useShareDeepLink';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';
import { watchOrganization } from '@cultuvilla/shared/services/organizationService';
import { recordEntityView } from '@cultuvilla/shared/services/commentsService';
import { isOrgMember, addOrgMember, getOrgMembers } from '@cultuvilla/shared/services/orgMemberService';
import {
  cancelOrgJoinRequest,
  hasPendingOrgJoinRequest,
  requestToJoinOrganization,
} from '@cultuvilla/shared/services/orgJoinRequestService';
import { OrgJoinRequests } from '../../../../components/feature/OrgJoinRequests';
import { showConfirm } from '../../../../lib/dialogs';
import { getOrgViewLink } from '@cultuvilla/shared/services/deepLinkService';
import { parseEntityRef } from '@cultuvilla/shared/utils';
import { entityRefHref, orgEditHref } from '../../../../lib/navigation/routes';
import type { OrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import { canViewOrgRoster } from '@cultuvilla/shared/models/organization/OrganizationDataModel';

type Org = OrganizationData & { id: string };

export default function OrgDetailScreen() {
  const { pueblo, entidad, intent } = useLocalSearchParams<{ pueblo: string; entidad: string; intent?: string }>();
  const orgId = parseEntityRef(entidad ?? '') ?? '';
  const arrivedViaInvite = intent === 'join';
  const { t } = useT();
  const { user } = useAuth();
  const gate = useRegisterGate();
  const share = useShareDeepLink();
  const insets = useSafeAreaInsets();
  const { data: org = null, status } = useWatch<Org | null>(
    'orgDetail:watchOrganization',
    orgId || null,
    (next, error) => watchOrganization(orgId, next, error),
  );
  const [membersCount, setMembersCount] = useState<number | null>(null);
  const [isMember, setIsMember] = useState<boolean>(false);
  const [membershipLoaded, setMembershipLoaded] = useState(false);
  const [joining, setJoining] = useState(false);
  const [requested, setRequested] = useState(false);
  const { canManage } = useOrgCapabilities(orgId as string, org?.municipalityId);
  // Until the viewer's membership is known, a member would see the join FAB flash.
  const loading = status === 'loading' || (org !== null && !membershipLoaded);
  // Keyed on these rather than `org`, so a snapshot that changes something else
  // (the view counter, say) does not refetch the membership.
  const orgExists = org !== null;
  const joinPolicy = org?.joinPolicy;
  // An empty group shows neither the count nor the roster heading.
  const hasMembers = (membersCount ?? 0) > 0;

  const refresh = useCallback(async () => {
    if (!orgId || !orgExists) return;
    const members = await getOrgMembers(orgId as string);
    setMembersCount(members.length);
    if (user) {
      const member = await isOrgMember(orgId as string, user.uid);
      setIsMember(member);
      setRequested(
        !member && joinPolicy === 'approval'
          ? await hasPendingOrgJoinRequest(orgId as string, user.uid)
          : false,
      );
    }
    setMembershipLoaded(true);
  }, [orgId, user, orgExists, joinPolicy]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!org) return;
    void recordEntityView({ entityKind: 'organization', entityId: org.id, municipalityId: org.municipalityId });
    observability.trackEvent(OBSERVABILITY_EVENTS.CONTENT_DETAIL_VIEWED, {
      entityKind: 'organization',
      entityId: org.id,
      municipalityId: org.municipalityId,
    });
  }, [org?.id]);

  const onJoin = useCallback(async () => {
    if (!user) {
      gate.requireAuth(entityRefHref('organization', pueblo, entidad), t('guest.org'));
      return;
    }
    if (!orgId || !org) return;
    if (requested) {
      showConfirm(
        t('organization.cancelRequestTitle'),
        t('organization.cancelRequestBody', { name: org.name }),
        () => {
          void cancelOrgJoinRequest(orgId as string, user.uid).then(refresh);
        },
      );
      return;
    }
    setJoining(true);
    let succeeded = false;
    try {
      // An `approval` org takes a request its admins resolve; an open one is
      // joined on the spot.
      if (org.joinPolicy === 'approval') {
        await requestToJoinOrganization(orgId as string, org.municipalityId, user.uid);
      } else {
        await addOrgMember(orgId as string, user.uid);
      }
      succeeded = true;
      observability.trackEvent(OBSERVABILITY_EVENTS.ORG_JOIN_SUCCESS, {
        municipalityId: org.municipalityId,
        viaInvite: arrivedViaInvite,
      });
      await refresh();
    } catch (e) {
      if (!succeeded) {
        observability.trackEvent(OBSERVABILITY_EVENTS.ORG_JOIN_ERROR, {
          municipalityId: org.municipalityId,
          viaInvite: arrivedViaInvite,
        });
      }
      throw e;
    } finally {
      setJoining(false);
    }
  }, [user, orgId, org, requested, arrivedViaInvite, refresh, gate, t]);

  const actions: EntityDetailAction[] = org
    ? [
        ...(canManage
          ? [
              {
                icon: 'create-outline' as const,
                accessibilityLabel: t('common.edit'),
                onPress: () => router.push(orgEditHref({ id: org.id, name: org.name, villageSlug: org.villageSlug })),
              },
            ]
          : []),
        {
          icon: 'share-outline',
          accessibilityLabel: t('deeplink.shareViewLabel'),
          onPress: () => {
            observability.trackEvent(OBSERVABILITY_EVENTS.ORG_INVITE_SHARED, {
              municipalityId: org.municipalityId,
            });
            void share(getOrgViewLink({ id: org.id, title: org.name, villageSlug: org.villageSlug }), org.name);
          },
        },
      ]
    : [];
  const joinLabel = !user
    ? t('organization.signInToJoin')
    : requested
      ? t('organization.requestPending')
      : org?.joinPolicy === 'approval'
        ? t('organization.requestToJoin')
        : t(org?.type === 'peña' ? 'organization.joinPeña' : 'organization.join');

  return (
    <EntityDetailScaffold
      loading={loading}
      notFound={!loading && !org}
      imageUri={org?.images[0] ?? null}
      fallbackIcon={ENTITY_FALLBACK_ICON.organization}
      actions={actions}
      title={org?.name}
      onRefresh={refresh}
      scrollContentClassName="pb-28"
      fab={
        org && !isMember ? (
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 24, alignItems: 'center', zIndex: 20 }}
          >
            <Pressable
              onPress={onJoin}
              disabled={joining}
              testID="join-org-fab"
              accessibilityRole="button"
              accessibilityState={{ disabled: joining }}
              accessibilityLabel={joinLabel}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 10,
                paddingHorizontal: 22,
                borderRadius: 999,
                backgroundColor: requested ? '#8a7a70' : '#bb5d3a',
                opacity: joining ? 0.7 : 1,
                elevation: 6,
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 3 },
              }}
            >
              {joining ? (
                <ActivityIndicator color="#f9f0e8" style={{ marginRight: 8 }} />
              ) : requested ? null : (
                <RNText style={{ color: '#f9f0e8', fontSize: 18, lineHeight: 22, marginRight: 8 }}>+</RNText>
              )}
              <RNText style={{ color: '#f9f0e8', fontSize: 16, fontWeight: '700' }}>
                {joinLabel}
              </RNText>
            </Pressable>
          </View>
        ) : null
      }
    >
      {org ? (
        <>
          {/* First, so an invite link lands on it before the events and roster push it off screen. */}
          {arrivedViaInvite && !isMember ? (
            <Text tone="muted" variant="bodySm">
              {t('organization.invitedBanner')}
            </Text>
          ) : null}
          {org.description ? <Text>{org.description}</Text> : null}
          {org.images.length > 1 ? (
            <VStack gap={2} className="pt-2">
              {org.images.slice(1).map((uri) => (
                <NaturalImage key={uri} uri={uri} />
              ))}
            </VStack>
          ) : null}
          {/* Rules let only an approval org's members read its private events. */}
          <OrgEventsSection orgId={org.id} includePrivate={isMember && org.joinPolicy === 'approval'} />
          {canManage && org.joinPolicy === 'approval' ? (
            <OrgJoinRequests orgId={org.id} onResolved={refresh} />
          ) : null}
          {hasMembers ? (
            <Text tone="muted">{t('organization.membersCount', { count: membersCount ?? 0 })}</Text>
          ) : null}
          {hasMembers && canViewOrgRoster({ membersPublic: org.membersPublic, isMember }) ? (
            // Remount (re-fetch) when membership changes, so joining a public org
            // immediately shows yourself in the roster — the component self-fetches
            // once on mount and has no other refresh trigger.
            <OrgMembersList
              key={`${org.id}-${isMember}-${membersCount ?? 0}`}
              orgId={org.id}
              canManage={canManage}
              currentUserId={user?.uid ?? null}
            />
          ) : null}
          <EntityComments
            key={org.id}
            entityKind="organization"
            entityId={org.id}
            municipalityId={org.municipalityId}
            canModerate={canManage}
          />
        </>
      ) : null}
    </EntityDetailScaffold>
  );
}
