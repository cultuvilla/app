import {
  barrioHref,
  orgHref,
  discoverOrganizeHref,
  eventHref,
  festivalPosterHref,
  newsHref,
  placeHref,
  villageHref,
  villageSectionHref,
} from '../../lib/navigation/routes';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  Text,
  VStack,
  HStack,
  Escudo,
  Button,
  ActionPill,
  ScreenTitle,
  ErrorState,
} from '../primitives';
import { Section, EntityCard } from './VillageSections';
import type { BarrioKind, FiestaBlock } from '@cultuvilla/shared/models/municipality';

/** Stable, so the Wrapped prompt's movement check is not redone every render. */
const NO_FIESTAS: FiestaBlock[] = [];

// Order is the order they render. The seat sorts first inside its own section
// (the seed does that), so the municipal centre leads the list a villager reads.
const BARRIO_SECTIONS: { kind: BarrioKind; titleKey: string }[] = [
  { kind: 'parroquia', titleKey: 'village.admin.hub.parroquias' },
  { kind: 'aldea', titleKey: 'village.admin.hub.aldeas' },
  { kind: 'pedania', titleKey: 'village.admin.hub.localidades' },
  { kind: 'barrio', titleKey: 'village.admin.hub.barrios' },
];
import { AddContentSheet } from './AddContentSheet';
import { HistoryRail } from './history/HistoryRail';
import { WordOfTheDayCard } from './vocabulary/WordOfTheDayCard';
import { LocationMap } from './LocationMap';
import { JoinVillageModal } from './JoinVillageModal';
import { VillageWrappedStrip } from './wrapped/VillageWrappedStrip';
import { WrappedPrompt } from './wrapped/WrappedPrompt';
import { AmbassadorWelcomeSheet } from './AmbassadorWelcomeSheet';
import {
  hasSeenAmbassadorWelcome,
  markAmbassadorWelcomeSeen,
} from '../../lib/village/ambassadorWelcome';
import { StatsRow } from './StatsRow';
import { useAuth } from '../../lib/auth/useAuth';
import { useRegisterGate } from '../../lib/auth/RegisterGateContext';
import { useIsAppAdmin } from '../../lib/auth/useIsAppAdmin';
import { useShareDeepLink } from '../../lib/deeplink/useShareDeepLink';
import { useT } from '../../lib/i18n';
import { usePush } from '../../lib/push/PushProvider';
import { isProposalVisible } from '../../lib/proposals';
import {
  ensureVillageMembership,
  joinVillage,
} from '@cultuvilla/shared/services/villageMemberService';
import { getVillageViewLink } from '@cultuvilla/shared/services/deepLinkService';
import { MAP_ZOOM_DEFAULT } from '@cultuvilla/shared/services/mapsService';
import { newsImageDownloadURL } from '@cultuvilla/shared/services/imageService';
import type { NewsPostData } from '@cultuvilla/shared/models/news/NewsPostDataModel';
import { formatDate, formatFestivalPosterDates } from '@cultuvilla/shared/utils';
import {
  escudoFullUrl,
  hasManualEscudo,
} from '@cultuvilla/shared/models/municipality/MunicipalityDataModel';
import type { VillageHomeState } from '../../lib/useVillageHome';

export interface VillageHomeBodyProps {
  data: VillageHomeState;
  reload: () => Promise<void> | void;
}

/**
 * Presentational village home shared by the pueblo tab and the pushed
 * `/[pueblo]` detail. Takes data from `useVillageHome`; the host
 * supplies the header chrome (AppHeader vs ScreenHeader). The action row's first
 * button is "Unirme" (join) for non-members and "Añadir contenido" (opens the
 * add sheet) for members; `!data.isMember` is the single source of truth for
 * "offer to join". Editar (admins) and Compartir (everyone) follow it.
 */
export function VillageHomeBody({ data, reload }: VillageHomeBodyProps) {
  const { user, refreshProfile } = useAuth();
  const { offerPush } = usePush();
  const gate = useRegisterGate();
  const { isAppAdmin } = useIsAppAdmin();
  const share = useShareDeepLink();
  const { t } = useT();
  const [joining, setJoining] = useState(false);
  const [pendingJoin, setPendingJoin] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const { coreLoading, coreError, village } = data;
  const uid = user?.uid ?? null;
  const villageIdForWelcome = village?.id ?? null;
  const isAmbassador = uid != null && village?.community?.organizerId === uid;

  // First visit after becoming Embajador: say it out loud, once per device.
  useEffect(() => {
    if (!isAmbassador || !uid || !villageIdForWelcome) return;
    let cancelled = false;
    void hasSeenAmbassadorWelcome(villageIdForWelcome, uid).then((seen) => {
      if (!cancelled && !seen) setWelcomeOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isAmbassador, uid, villageIdForWelcome]);

  const closeWelcome = () => {
    setWelcomeOpen(false);
    if (uid && villageIdForWelcome) void markAmbassadorWelcomeSeen(villageIdForWelcome, uid);
  };

  if (coreLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (coreError) {
    return <ErrorState error={coreError} onRetry={reload} />;
  }
  if (!village) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // Dormant municipality: no community yet, so there is nothing to show but an
  // invitation. Joining starts it (ensureVillageMembership); a guest goes through
  // the register gate, whose onboarding join takes the same path.
  if (!village.communityActive) {
    const joinDormant = async () => {
      if (!user) {
        gate.requireAuth(villageHref(village.slug), t('guest.village'), village.id);
        return;
      }
      setJoining(true);
      try {
        await ensureVillageMembership(village.id, user.uid);
        offerPush('village_join', { villageName: village.name });
        await refreshProfile();
        await reload();
      } finally {
        setJoining(false);
      }
    };
    return (
      <View className="flex-1 items-center justify-center px-8">
        <VStack gap={2} className="items-center">
          <Escudo
            url={escudoFullUrl(village)}
            size={96}
            fallbackInitial={village.name}
            zoomable
            accessibilityLabel={village.name}
          />
          <Text variant="h2" className="mt-2 text-center">
            {village.name}
          </Text>
          <Text tone="muted" variant="bodySm">
            {village.province}
          </Text>
          <Text className="text-center mt-4">
            {t('village.notRegistered.body', { name: village.name })}
          </Text>
          <Button
            className="mt-4"
            onPress={() => void joinDormant()}
            loading={joining}
            testID="village-join-dormant"
          >
            {user ? t('village.join') : t('village.signInToJoin')}
          </Button>
        </VStack>
      </View>
    );
  }

  const {
    villageAdmin,
    isMember,
    barrios,
    places,
    organizations,
    events,
    news,
    festivalPosters,
    peopleCount,
    pendingOrganizerRequest,
    sectionStatus,
  } = data;
  const canManage = isAppAdmin || villageAdmin;
  // Wiki phase: active but no organizer granted yet (community.organizerId null).
  const noOrganizer = village.community?.organizerId == null;
  const villageSlug = village.slug;

  const caps = { canManage, uid: user?.uid ?? null };
  // Barrios/places already come back active-only from useVillageHome (see
  // getBarrios/getPlaces) — the optimistic-visibility model means there's no
  // pending state left to filter here. Organizations keep the real
  // pending/approved/rejected review flow, so they still need the filter.
  const visibleOrgs = organizations.filter((o) => isProposalVisible(o.status, o.requestedBy, caps));
  const penas = visibleOrgs.filter((o) => o.type === 'peña');
  const agrupaciones = visibleOrgs.filter((o) => o.type !== 'peña');

  // Censo CTA label: "Editar censo" once every current question has a non-empty
  // answer; "Rellenar censo" otherwise. A newly-added (still-unanswered)
  // question therefore flips the label back to "Rellenar".
  const censoFields = village.community?.profileForm?.fields ?? [];
  const censoConfigured = censoFields.length > 0;
  const isAnswered = (v: unknown): boolean =>
    Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '';
  const censoFilled =
    censoConfigured && censoFields.every((f) => isAnswered(data.myCensoAnswers[f.key]));
  const censoFillLabel = censoFilled ? t('village.censo.edit') : t('village.censo.fill');

  const onJoin = () => {
    if (!user) {
      // Carry this village across auth: after the guest registers, onboarding
      // pre-selects it and joins them; an already-onboarded user resumes to it.
      gate.requireAuth(villageHref(villageSlug), t('guest.village'), village.id);
      return;
    }
    // Open the shared modal (escudo + name + barrio picker). Replaces the old
    // Alert.alert / window.confirm path, which is a no-op on web and could not
    // host the barrio picker.
    setPendingJoin(true);
  };

  const doJoin = async (barrioId: string | null) => {
    if (!user) return;
    setJoining(true);
    try {
      await joinVillage(village.id, user.uid, barrioId);
      setPendingJoin(false);
      // Joining earns the first ask: everything added to this village will now
      // reach them. The policy only lets a join have the FIRST ask.
      offerPush('village_join', { villageName: village.name });
      // joinVillage set this village as active; refresh the auth profile so the
      // Pueblo tab reflects it now, not only after an app restart.
      await refreshProfile();
      await reload();
    } finally {
      setJoining(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerClassName="pb-10">
        {/* ── Header (escudo + name) ───────────────────────────── */}
        <VStack gap={2} className="px-4 pt-4">
          <HStack gap={4} className="items-center">
            <View
              className={`bg-surface rounded-full overflow-hidden ${hasManualEscudo(village) ? '' : 'p-2'}`}
            >
              <Escudo
                url={escudoFullUrl(village)}
                size={88}
                fill={hasManualEscudo(village)}
                fallbackInitial={village.name}
                zoomable
                accessibilityLabel={village.name}
              />
            </View>
            <VStack gap={0} className="flex-1">
              <ScreenTitle>{village.name}</ScreenTitle>
              <Text tone="muted" variant="bodySm">
                {village.province}
              </Text>
            </VStack>
          </HStack>
        </VStack>

        {/* ── Stats ────────────────────────────────────────────── */}
        <View className="px-4 pt-4 pb-4">
          <StatsRow
            stats={[
              {
                label: t('village.admin.overview.people'),
                value: peopleCount,
                onPress: isMember
                  ? () => router.push(villageSectionHref(villageSlug, 'miembros'))
                  : undefined,
              },
              {
                label: t('village.hub.organizations'),
                value: sectionStatus.organizations === 'ready' ? visibleOrgs.length : null,
              },
              {
                label: t('village.admin.hub.places'),
                value: sectionStatus.places === 'ready' ? places.length : null,
              },
            ]}
          />
        </View>

        {/* ── slot 1: Unirme (non-members) / Añadir contenido (members)
            + Editar (admins) + Compartir (everyone) ─────────────── */}
        <HStack gap={3} className="px-4 pt-2 pb-2">
          {!isMember ? (
            <ActionPill
              label={user ? t('village.join') : t('village.signInToJoin')}
              onPress={onJoin}
              disabled={joining}
              testID="village-join-action"
            />
          ) : null}
          {isMember ? (
            <ActionPill
              label={t('village.addContent.button')}
              onPress={() => setAddOpen(true)}
              testID="village-add-content-action"
            />
          ) : null}
          <ActionPill
            label={t('village.share.title')}
            onPress={() => void share(getVillageViewLink(villageSlug), village.name)}
          />
        </HStack>

        {/* ── Admins: an invitation to sum up the fiestas, once the village
            has had movement worth summing up ─────────────────────── */}
        {canManage && sectionStatus.events === 'ready' ? (
          <WrappedPrompt
            municipalityId={village.id}
            villageSlug={villageSlug}
            events={events}
            fiestas={village.community?.fiestas ?? NO_FIESTAS}
          />
        ) : null}

        {/* ── No organizer yet (wiki phase) ─────────────────────── */}
        {noOrganizer ? (
          <VStack gap={2} className="px-4 pt-2">
            {pendingOrganizerRequest ? (
              <ActionPill
                grow={false}
                disabled
                label={t('village.noOrganizer.pending')}
                onPress={() => {}}
              />
            ) : (
              <ActionPill
                grow={false}
                label={t('village.noOrganizer.cta')}
                onPress={() => router.push(discoverOrganizeHref(village.id))}
              />
            )}
            <Text variant="bodySm" className="text-center">
              {t('village.noOrganizer.body')}
            </Text>
          </VStack>
        ) : null}

        {/* ── Ubicación: the map rectangle when coordinates are set. When
            missing, the slot is hidden entirely — location is set in the
            edit-village ("Detalles") step, not from here. ── */}
        {village.coordinates ? (
          <View className="px-4 pt-2">
            <LocationMap
              coordinates={village.coordinates}
              label={village.locationLabel}
              zoom={village.mapZoom ?? MAP_ZOOM_DEFAULT}
            />
          </View>
        ) : null}

        {/* ── Eventos ──────────────────────────────────────────── */}
        <Section
          title={t('village.events.label')}
          testID="village-events-row"
          isEmpty={events.length === 0}
          status={sectionStatus.events}
          data={events}
          keyExtractor={(e) => e.id}
          renderItem={({ item: e }) => (
            <EntityCard
              label={e.title}
              sub={formatDate(e.startDate, 'short')}
              icon="calendar-outline"
              imageUri={e.imageURL ?? e.villageCoverImage}
              statBadge={{
                icon: 'person-outline',
                count: e.confirmedCount,
                testID: 'entity-card-event-attendee-count',
              }}
              onPress={() => router.push(eventHref({ ...e, villageSlug }))}
            />
          )}
        />

        {/* ── Artículos ────────────────────────────────────────── */}
        <Section
          title={t('village.newsFeed.title')}
          isEmpty={news.length === 0}
          status={sectionStatus.news}
        >
          {news.map((n) => (
            <NewsEntityCard
              key={n.id}
              post={n}
              onPress={() => router.push(newsHref({ ...n, villageSlug }))}
            />
          ))}
        </Section>

        {/* ── Carteles de fiestas ──────────────────────────────── */}
        <Section
          title={t('village.festivalPosters.title')}
          isEmpty={festivalPosters.length === 0}
          status={sectionStatus.festivalPosters}
        >
          {festivalPosters.map((p) => (
            <EntityCard
              key={p.id}
              label={String(p.year)}
              sub={[p.title, formatFestivalPosterDates(p)].filter(Boolean).join(' · ') || undefined}
              icon="image-outline"
              imageUri={p.images[0] ?? null}
              commentCount={p.commentCount}
              onPress={() => router.push(festivalPosterHref({ ...p, villageSlug }))}
            />
          ))}
        </Section>

        {/* ── Subdivisiones, una sección por tipo ──────────────────
            Spain has no single word for "part of a municipality": a barrio is a
            neighbourhood within a settlement, a pedanía is a separate settlement
            kilometres away, and Galicia and Asturias group theirs into
            parroquias. One section per kind lets each village show the word its
            own region uses, and Section renders nothing when a kind is absent,
            so this costs no vertical space where it does not apply. */}
        {BARRIO_SECTIONS.map(({ kind, titleKey }) => {
          const rows = barrios.filter((b) => b.kind === kind);
          return (
            <Section
              key={kind}
              title={t(titleKey)}
              isEmpty={rows.length === 0}
              status={sectionStatus.barrios}
            >
              {rows.map((b) => (
                <EntityCard
                  key={b.id}
                  label={b.name}
                  sub={t('village.admin.barrios.residentCount', {
                    count: b.residentCount,
                  })}
                  icon="map-outline"
                  imageUri={b.images[0] ?? null}
                  commentCount={b.commentCount}
                  onPress={() => router.push(barrioHref(villageSlug, b))}
                />
              ))}
            </Section>
          );
        })}

        {/* ── Lugares ──────────────────────────────────────────── */}
        <Section
          title={t('village.admin.hub.places')}
          isEmpty={places.length === 0}
          status={sectionStatus.places}
        >
          {places.map((p) => (
            <EntityCard
              key={p.id}
              label={p.name}
              icon="location-outline"
              imageUri={p.images[0] ?? null}
              commentCount={p.kind === 'cemetery' ? undefined : p.commentCount}
              statBadge={
                p.kind === 'cemetery'
                  ? {
                      icon: 'person-outline',
                      count: p.burialCount,
                      testID: 'entity-card-burial-count',
                    }
                  : undefined
              }
              onPress={() => router.push(placeHref(villageSlug, p))}
            />
          ))}
        </Section>

        {/* ── Agrupaciones (ayuntamiento + asociación) ─────────── */}
        <Section
          title={t('village.hub.organizations')}
          isEmpty={agrupaciones.length === 0}
          status={sectionStatus.organizations}
        >
          {agrupaciones.map((o) => (
            <EntityCard
              key={o.id}
              label={o.name}
              sub={t('village.hub.memberCount', { count: o.memberCount })}
              icon="business-outline"
              imageUri={o.images[0] ?? null}
              commentCount={o.commentCount}
              onPress={() => router.push(orgHref({ ...o, villageSlug }))}
            />
          ))}
        </Section>

        {/* ── Peñas ────────────────────────────────────────────── */}
        <Section
          title={t('village.hub.penas')}
          isEmpty={penas.length === 0}
          status={sectionStatus.organizations}
        >
          {penas.map((o) => (
            <EntityCard
              key={o.id}
              label={o.name}
              sub={t('village.hub.memberCount', { count: o.memberCount })}
              icon="people-circle-outline"
              imageUri={o.images[0] ?? null}
              commentCount={o.commentCount}
              onPress={() => router.push(orgHref({ ...o, villageSlug }))}
            />
          ))}
        </Section>

        {/* ── Historia + Vocabulario: open to everyone, including non-members —
            a pueblo's past and its words are exactly what is worth not losing ─── */}
        {sectionStatus.history === 'ready' ? (
          <HistoryRail entries={data.history} villageSlug={villageSlug} />
        ) : null}
        {sectionStatus.vocabulary === 'ready' && data.wordOfTheDay ? (
          <WordOfTheDayCard
            word={data.wordOfTheDay}
            count={data.vocabularyCount}
            villageSlug={villageSlug}
            villageName={village.name}
          />
        ) : null}

        {/* ── Censo: only villagers of a configured village fill; admins also configure ─── */}
        {(isMember && censoConfigured) || canManage ? (
          <HStack gap={3} className="px-4 pt-8">
            {isMember && censoConfigured ? (
              <ActionPill
                label={censoFillLabel}
                onPress={() => router.push(villageSectionHref(villageSlug, 'censo', 'mode=fill'))}
              />
            ) : null}
            {canManage ? (
              <ActionPill
                label={t('village.censo.configure')}
                onPress={() => router.push(villageSectionHref(villageSlug, 'censo', 'mode=configure'))}
              />
            ) : null}
          </HStack>
        ) : null}

        {/* ── The latest published fiestas Wrapped, closing the page ── */}
        <VillageWrappedStrip municipalityId={village.id} villageSlug={villageSlug} />
      </ScrollView>
      <JoinVillageModal
        municipality={
          pendingJoin
            ? {
                id: village.id,
                name: village.name,
                escudoUrl: escudoFullUrl(village),
                escudoFill: hasManualEscudo(village),
              }
            : null
        }
        busy={joining}
        onCancel={() => setPendingJoin(false)}
        onConfirm={(barrioId) => void doJoin(barrioId)}
      />
      <AddContentSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        villageId={village.id}
        villageSlug={villageSlug}
        canManage={canManage}
      />
      <AmbassadorWelcomeSheet
        visible={welcomeOpen}
        villageName={village.name}
        sex={village.community?.organizerSex ?? null}
        onShare={() => {
          closeWelcome();
          void share(getVillageViewLink(villageSlug), village.name);
        }}
        onClose={closeWelcome}
      />
    </>
  );
}

/**
 * News card for the village-home horizontal scroll. News images are Storage
 * paths (not plain URLs like events), so resolve the first one asynchronously
 * before handing it to <EntityCard>; falls back to the newspaper icon.
 */
function NewsEntityCard({
  post,
  onPress,
}: {
  post: NewsPostData & { id: string };
  onPress: () => void;
}) {
  const { t } = useT();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const firstImagePath = post.coverImage?.storagePath ?? post.images[0]?.storagePath ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!firstImagePath) {
      setImageUri(null);
      return;
    }
    newsImageDownloadURL(firstImagePath)
      .then((url) => {
        if (!cancelled) setImageUri(url);
      })
      .catch(() => {
        if (!cancelled) setImageUri(null);
      });
    return () => {
      cancelled = true;
    };
  }, [firstImagePath]);

  return (
    <EntityCard
      label={post.title}
      sub={t(`news.compose.category.${post.category}`)}
      icon="newspaper-outline"
      imageUri={imageUri}
      onPress={onPress}
    />
  );
}
