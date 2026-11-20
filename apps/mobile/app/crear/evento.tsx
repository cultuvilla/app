import { eventHref } from '../../lib/navigation/routes';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  View,
} from 'react-native';
import { router, useLocalSearchParams, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { Screen, Text, Input, DateField, DateTimeField, FieldLabel, InfoTooltip, Toggle, HStack, VStack, Pressable, ErrorState } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { EventCoverPicker } from '../../components/feature/EventCoverPicker';
import { LocationField } from '../../components/feature/LocationField';
import { MyVillagePicker, type VillageOption } from '../../components/feature/MyVillagePicker';
import { OrganizerPicker } from '../../components/feature/OrganizerPicker';
import { SignupQuestionsEditor } from '../../components/feature/signup/SignupQuestionsEditor';
import { OptionsSheet } from '../../components/feature/groups/OptionsSheet';
import { SelectField } from '../../components/feature/groups/SelectField';
import {
  EventTasksEditor,
  blankEventTask,
  eventTasksMissingMonth,
  type EventTaskDraft,
} from '../../components/feature/EventTasksEditor';
import { useMyGroups } from '../../lib/orgs/useMyGroups';
import { createGroupTasks } from '@cultuvilla/shared/services/groupTaskService';
import { yearlyEventTask } from '@cultuvilla/shared/models/organization';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import { useCallable } from '../../lib/useCallable';
import { withFirestoreErrorLog } from '../../lib/firestoreErrorLog';
import { showConfirm } from '../../lib/dialogs';
import { pickImageAsBlob } from '../../lib/images';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { escudoThumbDisplayUrl } from '@cultuvilla/shared/models/municipality';
import { getUserMemberships } from '@cultuvilla/shared/services/villageMemberService';
import { haversineKm } from '@cultuvilla/shared/services/feedService';
import {
  cancelSeriesFrom,
  createEvent,
  createEventSeries,
  getEvent,
  setEventsImage,
  updateEvent,
  updateEventStatus,
} from '@cultuvilla/shared/services/eventService';
import { useEntityCapabilities } from '../../lib/auth/useEntityCapabilities';
import { uploadEventImage } from '@cultuvilla/shared/services/imageService';
import type { UploadableImage } from '@cultuvilla/shared/services/imageService';
import type { LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';
import { Stepper, type StepConfig } from '../../components/feature/Stepper';
import { DeleteHeaderButton } from '../../components/feature/DeleteHeaderButton';
import { roundUpToMinuteStep } from '../../lib/date/clockGrid';
import {
  MAX_EVENT_BIRTH_YEAR,
  MAX_SIGNUP_GROUP_SIZE,
  MIN_EVENT_BIRTH_YEAR,
  madridDayKey,
} from '@cultuvilla/shared/models/event/EventDataModel';
import { isoWeekday } from '@cultuvilla/shared/models/event/EventSeriesModel';
import {
  blankEventDraft,
  buildEventCreateInput,
  buildEventUpdate,
  deriveEventDraft,
  draftFromEvent,
  loadedFromEvent,
  type EventDraft,
  type LoadedEvent,
  type Recurrence,
} from '../../lib/events/eventDraft';
import { noteConsentPromptAction } from '../../lib/observability/analyticsConsentPrompt';

/** Every real group size — parejas, tríos, grupos de cuatro. Size 1 isn't a
 *  choice here: it's what the "inscripción por grupos" toggle being off means. */
const GROUP_SIZE_CHOICES = Array.from({ length: MAX_SIGNUP_GROUP_SIZE - 1 }, (_, i) => i + 2);

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

const RECURRENCES: readonly Recurrence[] = ['weekly', 'monthly', 'yearly'];
const DATE_MODES = ['fixed', 'varying'] as const;

/** Nearest joined village to a coordinate (by great-circle distance), or null. */
function nearestVillage(c: LatLng, villages: VillageOption[]): VillageOption | null {
  let best: VillageOption | null = null;
  let bestKm = Infinity;
  for (const v of villages) {
    if (!v.coordinates) continue;
    const km = haversineKm(c, v.coordinates);
    if (km < bestKm) {
      bestKm = km;
      best = v;
    }
  }
  return best;
}

function stepBody(children: React.ReactNode) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/**
 * A yes/no field, laid out exactly like `Input`: `FieldLabel` on its own line,
 * control underneath (see the primitive's `VStack gap={1}`). Every control in
 * the form reads the same way down the left edge, rather than switches being
 * right-aligned rows and text fields being stacked ones.
 *
 * The field's explanation lives behind an "ⓘ" instead of a paragraph under the
 * control — the Detalles step is a list of decisions, and spelling each one out
 * inline pushed the controls themselves below the fold.
 */
/** The label on the left, the current choice on the right; tapping it opens the options. */
function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
  testID,
}: {
  label: string;
  value: T;
  options: readonly { key: T; label: string; description: string }[];
  onChange: (next: T) => void;
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value)?.label ?? '';
  return (
    <>
      <HStack gap={2} className="items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${current}`}
          testID={`${testID}-trigger`}
          className="flex-row items-center py-1"
        >
          <Text className="mr-1 font-semibold">{current}</Text>
          <Ionicons name="chevron-down" size={iconSizes.sm} color={colors.light.fg.accent} />
        </Pressable>
      </HStack>
      <OptionsSheet
        visible={open}
        title={label}
        options={options.map((o) => ({ ...o, selected: o.key === value }))}
        onPick={(key) => {
          onChange(key as T);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        testID={testID}
      />
    </>
  );
}

function ToggleField({
  label,
  help,
  value,
  onValueChange,
  disabled,
  testID,
}: {
  label: string;
  help?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  testID: string;
}) {
  const { t } = useT();
  return (
    <VStack gap={1}>
      <HStack gap={1} className="items-center">
        <FieldLabel>{label}</FieldLabel>
        {help ? <InfoTooltip title={label} text={help} testID={`${testID}-info`} /> : null}
      </HStack>
      <HStack gap={2} className="items-center">
        <Toggle
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          testID={testID}
        />
        <Text tone="muted">{value ? t('common.yes') : t('common.no')}</Text>
      </HStack>
    </VStack>
  );
}

export default function NewEventScreen() {
  const { user, profile } = useAuth();
  const { t } = useT();
  // An `eventId` param puts the stepper in edit mode: it loads that event,
  // prefills every field, and saves via updateEvent. Otherwise it creates a new
  // event. A `villageId` param (e.g. from a village's "Próximos eventos" add
  // card) targets that village; otherwise fall back to the user's active one.
  // A `copyFrom` param (a repeating event's "Repetir el año que viene") creates a
  // new event prefilled from that one, its dates moved a year.
  // An `organizerOrgId` param (a group's "Crear evento") starts with that group organizing.
  const { villageId, eventId, copyFrom, organizerOrgId } = useLocalSearchParams<{
    villageId?: string;
    eventId?: string;
    copyFrom?: string;
    organizerOrgId?: string;
  }>();
  const editMode = !!eventId;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Village selection. The event's `municipalityId` must be a village the user
  // has joined (enforced by the create rule), so the dropdown is limited to
  // those. It auto-selects the nearest joined village to the picked location,
  // unless the user overrides it. In edit mode the municipality is immutable,
  // so we show the event's own village read-only.
  const [joinedVillages, setJoinedVillages] = useState<VillageOption[]>([]);
  const [selectedVillageId, setSelectedVillageId] = useState<string | null>(null);
  const [editVillageSlug, setEditVillageSlug] = useState('');
  const [villageManuallyPicked, setVillageManuallyPicked] = useState(false);
  const [editMunicipalityId, setEditMunicipalityId] = useState<string | null>(null);
  const [editVillage, setEditVillage] = useState<VillageOption | null>(null);

  const municipalityId = editMode ? editMunicipalityId : selectedVillageId;
  const selectedVillage = editMode
    ? editVillage
    : (joinedVillages.find((v) => v.id === selectedVillageId) ?? null);
  const municipalityName = selectedVillage?.name ?? '';
  // The pueblo slug the new (or edited) event's URL is built from.
  const villageSlug = editMode ? editVillageSlug : (selectedVillage?.slug ?? '');
  const municipalityCoordinates = selectedVillage?.coordinates ?? null;

  // Every form field, prefilled in one go in edit and copy mode. Fields,
  // prefill, derived rules and payloads live in lib/events/eventDraft.
  const [draft, setDraft] = useState<EventDraft>(() =>
    blankEventDraft(roundUpToMinuteStep(new Date(), 5), organizerOrgId),
  );
  const set = <K extends keyof EventDraft>(key: K) => (value: EventDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const {
    title,
    description,
    startDate,
    endDate,
    recurring,
    recurrence,
    dateVaries,
    repeatWeekdays,
    repeatUntil,
    coords,
    locationName,
    maxAttendees,
    telephoneRequired,
    requiresPayment,
    signupGroupSize,
    birthYearLimited,
    minBirthYear,
    maxBirthYear,
    signupEnabled,
    signupInfo,
    attendeesPublic,
    privateToOrg,
    formEnabled,
    signupFields,
    organizerUserIds,
    organizerOrgIds,
    existingImageURL,
  } = draft;
  // Edit mode: the event as loaded — its locks, the series notice, and
  // cancelling "este y los siguientes" from the date it had before any edit.
  const [loadedEvent, setLoadedEvent] = useState<LoadedEvent | null>(null);
  const lockedFieldCount = loadedEvent?.lockedFieldCount ?? 0;
  const groupSizeLocked = loadedEvent?.groupSizeLocked ?? false;
  const existingSignupCount = loadedEvent?.existingSignupCount ?? 0;
  const createdBy = loadedEvent?.createdBy ?? null;
  const [cover, setCover] = useState<UploadableImage | null>(null);
  // The organizing group's checklist (create only, for a group the creator
  // belongs to).
  const [tasksEnabled, setTasksEnabled] = useState(false);
  const [taskRows, setTaskRows] = useState<EventTaskDraft[]>(() => [blankEventTask()]);
  const [taskOrgId, setTaskOrgId] = useState<string | null>(null);
  const [copyLoading, setCopyLoading] = useState(!!copyFrom && !eventId);

  // Picking a location auto-selects the nearest joined village (create mode,
  // until the user manually overrides the dropdown).
  function handleLocationChange(c: LatLng, address: string) {
    setDraft((prev) => ({ ...prev, coords: c, locationName: address }));
    if (!editMode && !villageManuallyPicked) {
      const nearest = nearestVillage(c, joinedVillages);
      if (nearest) setSelectedVillageId(nearest.id);
    }
  }

  const derived = deriveEventDraft(draft, loadedEvent);
  const {
    visibilityOrgId,
    varyingDate,
    seriesFrequency,
    isSeries,
    weekly,
    repeatsYearly,
    seriesEndInvalid,
    seriesUntilInvalid,
    birthYearOutOfBounds,
    birthYearRangeInvalid,
    signupsWouldBeWiped,
  } = derived;

  // The organizing groups the creator belongs to: any member writes its tasks.
  const { groups: myGroups } = useMyGroups(editMode ? null : (user?.uid ?? null));
  const taskOrgIds = organizerOrgIds.filter((id) => myGroups.some((g) => g.org.id === id));
  const taskOrg = taskOrgIds.includes(taskOrgId ?? '') ? taskOrgId : (taskOrgIds[0] ?? null);
  const tasksOffered = !editMode && taskOrg !== null;

  useEffect(() => {
    // Only auto-seed the creator when composing a new event. In edit mode the
    // organizer list is loaded from the event and must not gain the current
    // user (a village admin may be editing an event they don't organize).
    // An effect, not the initializer, so a uid that resolves late is seeded too.
    if (!user || editMode) return;
    setDraft((prev) =>
      prev.organizerUserIds.includes(user.uid)
        ? prev
        : { ...prev, organizerUserIds: [user.uid, ...prev.organizerUserIds] },
    );
  }, [user, editMode]);

  // ── Edit mode: load the event and prefill every field ────────────────────
  useEffect(() => {
    if (!editMode || !eventId) return;
    let cancelled = false;
    async function load() {
      try {
        const ev = await withFirestoreErrorLog('event:getEvent', () => getEvent(eventId!));
        if (cancelled) return;
        if (!ev) {
          setLoadError('not-found');
          return;
        }
        setLoadedEvent(loadedFromEvent(ev));
        setEditMunicipalityId(ev.municipalityId);
        setEditVillageSlug(ev.villageSlug);
        setEditVillage({
          id: ev.municipalityId,
          slug: ev.villageSlug,
          name: ev.villageName ?? '',
          province: '',
          coordinates: ev.villageCoordinates ?? null,
          escudoThumbUrl: null,
        });
        setDraft((prev) => draftFromEvent(prev, ev, { mode: 'edit' }));
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [editMode, eventId]);

  // ── Copy mode: next year's edition of a yearly event ─────────────────────
  // The village comes in as the `villageId` param, so the village list below
  // selects it; sign-ups, roster and comments stay with last year's edition.
  useEffect(() => {
    if (editMode || !copyFrom || !user) return;
    let cancelled = false;
    void withFirestoreErrorLog('event:getEvent', () => getEvent(copyFrom))
      .then((ev) => {
        if (cancelled || !ev) return;
        setDraft((prev) => draftFromEvent(prev, ev, { mode: 'copy', uid: user.uid }));
        setVillageManuallyPicked(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCopyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editMode, copyFrom, user]);

  // ── Create mode: load the villages the user can post to ───────────────────
  useEffect(() => {
    if (editMode) return;
    let cancelled = false;
    async function load() {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const memberships = await withFirestoreErrorLog('event:getUserMemberships', () =>
          getUserMemberships(user.uid),
        );
        const munis = await Promise.all(
          memberships.map((m) => getMunicipality(m.municipalityId)),
        );
        if (cancelled) return;
        const options: VillageOption[] = munis
          .filter((m): m is NonNullable<typeof m> => m != null)
          .map((m) => ({
            id: m.id,
            slug: m.slug,
            name: m.name,
            province: m.province,
            coordinates: m.coordinates,
            escudoThumbUrl: escudoThumbDisplayUrl(m),
          }));
        setJoinedVillages(options);
        // Default selection: route param, then active village, then first joined.
        const preferred = villageId ?? profile?.activeMunicipalityId ?? null;
        setSelectedVillageId(
          options.find((o) => o.id === preferred)?.id ?? options[0]?.id ?? null,
        );
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [editMode, user, villageId, profile?.activeMunicipalityId]);

  function seedWeekdays() {
    // Seed the obvious answer: the first day's own weekday.
    if (repeatWeekdays.length === 0 && startDate) set('repeatWeekdays')([isoWeekday(startDate)]);
  }

  function toggleRecurring(on: boolean) {
    set('recurring')(on);
    if (on && recurrence === 'weekly') seedWeekdays();
  }

  function pickRecurrence(next: Recurrence) {
    set('recurrence')(next);
    if (next === 'weekly') seedWeekdays();
  }

  function toggleWeekday(day: number) {
    setDraft((prev) => ({
      ...prev,
      repeatWeekdays: prev.repeatWeekdays.includes(day)
        ? prev.repeatWeekdays.filter((d) => d !== day)
        : [...prev.repeatWeekdays, day],
    }));
  }

  // Survives a failed cover upload so the retry patches the events that were
  // already created instead of creating more. See the create branch.
  const createdEventIdsRef = useRef<string[] | null>(null);
  // Same for the checklist: a retry never writes it twice.
  const tasksCreatedRef = useRef(false);

  const { fire: submit, isPending } = useCallable({
    operation: editMode ? 'event:update' : 'event:create',
    callable: async () => {
      if (!municipalityId || !user || !startDate) return;
      // coords is validated non-null before submit() is reachable
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const ready = { ...draft, startDate, coords: coords! };

      // ── Edit: patch the existing event; only touch the cover if replaced ──
      if (editMode && eventId) {
        await updateEvent(eventId, buildEventUpdate(ready, derived, { villageName: municipalityName }));
        if (cover) {
          const url = await uploadEventImage(municipalityId, eventId, {
            blob: cover.blob,
            filename: 'cover.jpg',
            contentType: cover.contentType,
          });
          await updateEvent(eventId, { imageURL: url });
        }
        return eventId;
      }

      // ── Create ────────────────────────────────────────────────────────────
      // Creating the event and uploading its cover are two round-trips, and the
      // upload is the one that fails on a weak link (a 5 MB image outlives the
      // Storage SDK's own retry budget). The event exists by then, so a retry
      // has to finish *that* event — re-running createEvent would leave the
      // user with a duplicate for every failed attempt. The id survives in a
      // ref for exactly as long as the form does.
      let newIds = createdEventIdsRef.current;
      if (!newIds) {
        const input = buildEventCreateInput(ready, derived, {
          uid: user.uid,
          municipalityId,
          villageName: municipalityName,
          villageCoordinates: municipalityCoordinates,
          hasNewCover: !!cover,
        });
        newIds = derived.seriesRule
          ? await createEventSeries({ ...input, endDate: derived.slotEnd }, derived.seriesRule)
          : [await createEvent(input)];
        createdEventIdsRef.current = newIds;
      }
      const [firstId] = newIds;
      if (!firstId) return;
      // The checklist hangs off the first occurrence, the one the group plans.
      const tasks = taskRows.filter((r) => r.title.trim() !== '');
      if (tasksOffered && tasksEnabled && taskOrg && tasks.length > 0 && !tasksCreatedRef.current) {
        const today = madridDayKey(new Date());
        await createGroupTasks(
          taskOrg,
          tasks.map((r) =>
            repeatsYearly && r.month !== null
              ? yearlyEventTask({ title: r.title.trim(), month: r.month }, { today, eventId: firstId })
              : { title: r.title.trim(), dueOn: r.dueOn ? madridDayKey(r.dueOn) : null, eventId: firstId },
          ),
          user.uid,
        );
        tasksCreatedRef.current = true;
      }
      if (cover) {
        // One upload, under the first occurrence; the rest point at it.
        const url = await uploadEventImage(municipalityId, firstId, {
          blob: cover.blob,
          filename: 'cover.jpg',
          contentType: cover.contentType,
        });
        if (newIds.length === 1) await updateEvent(firstId, { imageURL: url });
        else await setEventsImage(newIds, url);
      }
      return firstId;
    },
    onSuccess: (id) => {
      if (!editMode) noteConsentPromptAction('event-publish');
      if (id) router.replace(eventHref({ id, title, villageSlug, visibilityOrgId }));
    },
    swallow: true,
  });

  // Edit mode is organizer-gated (mirrors the event update rules); a
  // non-organizer who deep-links here is sent back to the public detail.
  const { can, loading: capLoading } = useEntityCapabilities(municipalityId ?? undefined);

  const headerTitle = editMode ? t('event.editEvent') : t('event.createEvent');

  // Framed as delete but soft in practice: cancelling sets status → 'cancelled',
  // which the feeds already filter out (they query status == 'published'). Nav
  // must leave the event — returning to its detail would re-show the (still
  // existing) cancelled doc and read as "delete didn't work". Reaching edit mode
  // already implies organizer rights.
  // Turning sign-ups off wipes the event's roster and notifies everyone on it
  // (the `onEventUpdated` trigger does the deleting). That is not something to
  // discover afterwards, so the count is named before the save goes through.
  const handleComplete = () => {
    if (!signupsWouldBeWiped) {
      void submit();
      return;
    }
    showConfirm(
      t('event.signupDisableTitle'),
      t('event.signupDisableBody', { count: existingSignupCount }),
      () => void submit(),
      { confirmText: t('event.signupDisableConfirm'), cancelText: t('common.cancel') },
    );
  };

  const deleteEvent = () => {
    if (!eventId) return;
    return updateEventStatus(eventId, 'cancelled').then(() => router.replace('/(tabs)'));
  };

  const deleteSeriesFromHere = () => {
    if (!loadedEvent) return;
    return cancelSeriesFrom(loadedEvent).then(() => router.replace('/(tabs)'));
  };

  if (loading || copyLoading) {
    return (
      <Screen padded={false} topInset={false}>
        <ScreenHeader accent title={headerTitle} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (loadError) {
    const notFound = loadError === 'not-found';
    return (
      <Screen padded={false} topInset={false}>
        <ScreenHeader accent title={headerTitle} />
        <ErrorState
          error={notFound ? undefined : loadError}
          title={notFound ? t('event.notFoundTitle') : undefined}
          message={notFound ? t('event.notFoundBody') : undefined}
        />
      </Screen>
    );
  }

  // ── Edit: non-organizer redirect ──────────────────────────────────────────
  if (editMode && !capLoading && !can('edit', 'event', { createdBy, organizerUserIds })) {
    return <Redirect href={eventHref({ id: eventId, title, villageSlug, visibilityOrgId })} />;
  }

  // ── No active village (create only) ───────────────────────────────────────
  if (!municipalityId) {
    return (
      <Screen padded={false} topInset={false}>
        <ScreenHeader accent title={headerTitle} />
        <View className="flex-1 items-center justify-center px-8">
          <Text tone="muted" className="text-center">
            {t('event.eligibility.body')}
          </Text>
        </View>
      </Screen>
    );
  }

  // ── Create / edit form ──────────────────────────────────────────────────
  const steps: StepConfig[] = [
    {
      key: 'basics',
      title: t('event.stepBasics'),
      icon: 'create-outline',
      validate: () => {
        const e: string[] = [];
        if (!title.trim()) e.push('title');
        return e;
      },
      render: () => stepBody(
        <>
          <Input label={t('event.title')} value={title} onChangeText={set('title')} testID="event-title" />
          <VStack gap={1}>
            <FieldLabel>{t('event.imageLabel')}</FieldLabel>
            <EventCoverPicker
              uri={cover?.previewUri ?? existingImageURL}
              label={cover || existingImageURL ? t('event.changeImage') : t('event.addImage')}
              onPress={async () => {
                const n = await pickImageAsBlob();
                if (n) setCover(n);
              }}
              testID="event-cover"
            />
          </VStack>
          <Input
            label={t('event.description')}
            value={description}
            onChangeText={set('description')}
            multiline
            numberOfLines={5}
            testID="event-description"
          />
          {municipalityId && user ? (
            <OrganizerPicker
              municipalityId={municipalityId}
              selectedUserIds={organizerUserIds}
              selectedOrgIds={organizerOrgIds}
              // Only while composing. `confirmUserSheet` force-inserts whatever it
              // is handed, and in edit mode nothing requires the editor to be an
              // organizer — a village admin fixing someone else's event would
              // silently become one, and organizerUserIds is its own clause in
              // the event's update/delete rules. Mirrors news/new.tsx.
              lockedUserId={editMode ? undefined : user.uid}
              onChangeUsers={set('organizerUserIds')}
              onChangeOrgs={set('organizerOrgIds')}
            />
          ) : null}
          {/* Only offered with exactly one organizing org: "private" has to
              name the single group whose membership is the guest list, and a
              two-org event has no such group. */}
          {/* A series shares one visibility (firestore.rules refuses a change
              on one occurrence), so its days offer no switch. */}
          {organizerOrgIds.length === 1 && !loadedEvent?.series ? (
            <ToggleField
              label={t('event.privateToOrg')}
              help={t('event.privateToOrgHint')}
              value={privateToOrg}
              onValueChange={set('privateToOrg')}
              testID="private-to-org"
            />
          ) : null}
        </>,
      ),
    },
    {
      key: 'when',
      title: t('event.stepWhen'),
      icon: 'calendar-outline',
      validate: () => {
        const e: string[] = [];
        if (!startDate) e.push('startDate');
        // endDate is optional, but if set it must not precede startDate.
        if (!isSeries && endDate && startDate && endDate < startDate) e.push('endDate');
        if (weekly && repeatWeekdays.length === 0) e.push('repeatWeekdays');
        if (seriesEndInvalid) e.push('endTime');
        if (seriesUntilInvalid) e.push('repeatUntil');
        if (!coords) e.push('coords');
        if (!municipalityId) e.push('village');
        return e;
      },
      render: () => stepBody(
        <>
          {loadedEvent?.series ? (
            <Text tone="muted" variant="bodySm" testID="series-edit-notice">
              {t('event.seriesEditNotice')}
            </Text>
          ) : null}
          {editMode ? null : (
            <ToggleField
              label={t('event.recurring')}
              help={t('event.recurringHint')}
              value={recurring}
              onValueChange={toggleRecurring}
              testID="event-recurring"
            />
          )}
          {!editMode && recurring ? (
            <VStack gap={1}>
              <ChoiceRow
                label={t('event.frequency')}
                value={recurrence}
                options={RECURRENCES.map((r) => ({
                  key: r,
                  label: t(`event.frequencyOption.${r}`),
                  description: t(`event.frequencyDescription.${r}`),
                }))}
                onChange={pickRecurrence}
                testID="event-recurrence"
              />
              {recurrence !== 'weekly' ? (
                <ChoiceRow
                  label={t('event.dateMode')}
                  value={dateVaries ? 'varying' : 'fixed'}
                  options={DATE_MODES.map((m) => ({
                    key: m,
                    label: t(`event.dateModeOption.${m}`),
                    description: t(`event.dateModeDescription.${m}`),
                  }))}
                  onChange={(mode) => set('dateVaries')(mode === 'varying')}
                  testID="event-date-mode"
                />
              ) : null}
              {varyingDate ? (
                <Text tone="muted" variant="bodySm" testID="event-date-varies-hint">
                  {t('event.dateVariesHint')}
                </Text>
              ) : recurrence === 'yearly' ? (
                <Text tone="muted" variant="bodySm" testID="event-recurrence-yearly-hint">
                  {t('event.yearlyHint')}
                </Text>
              ) : recurrence === 'monthly' && startDate ? (
                <Text tone="muted" variant="bodySm" testID="event-recurrence-monthly-hint">
                  {t('event.monthlyHint', { day: startDate.getDate() })}
                </Text>
              ) : null}
            </VStack>
          ) : null}
          <DateTimeField
            label={isSeries ? t('event.firstDateTime') : varyingDate ? t('event.nextDateTime') : t('event.startDateTime')}
            value={startDate}
            onChange={set('startDate')}
            minimumDate={new Date()}
            datePlaceholder={t('event.selectDate')}
            timePlaceholder={t('event.selectTime')}
            testID="startDate"
          />
          <DateTimeField
            label={isSeries ? t('event.endTime') : t('event.endDateTime')}
            value={endDate}
            onChange={set('endDate')}
            minimumDate={startDate ?? new Date()}
            timeOnly={isSeries}
            datePlaceholder={t('event.selectDate')}
            timePlaceholder={t('event.selectTime')}
            testID="endDate"
          />
          {seriesEndInvalid ? (
            <Text tone="danger" variant="bodySm" testID="end-time-error">
              {t('event.endTimeInvalid')}
            </Text>
          ) : null}
          {weekly ? (
            <VStack gap={1}>
              <FieldLabel>{t('event.repeatDays')}</FieldLabel>
              <HStack gap={1} className="items-center">
                {WEEKDAYS.map((day) => {
                  const active = repeatWeekdays.includes(day);
                  return (
                    <Pressable
                      key={day}
                      testID={`repeat-day-${String(day)}`}
                      accessibilityRole="checkbox"
                      accessibilityLabel={t(`event.weekdayLong.${String(day)}`)}
                      accessibilityState={{ checked: active }}
                      onPress={() => toggleWeekday(day)}
                      className={`flex-1 items-center rounded-lg border py-2 ${
                        active ? 'border-accent bg-surface' : 'border-subtle'
                      }`}
                    >
                      <Text tone={active ? undefined : 'muted'}>{t(`event.weekdayShort.${String(day)}`)}</Text>
                    </Pressable>
                  );
                })}
              </HStack>
              {repeatWeekdays.length === 0 ? (
                <Text tone="danger" variant="bodySm" testID="repeat-days-error">
                  {t('event.repeatDaysRequired')}
                </Text>
              ) : null}
            </VStack>
          ) : null}
          {isSeries ? (
            <VStack gap={1}>
              <DateField
                label={t('event.repeatUntil')}
                value={repeatUntil}
                onChange={set('repeatUntil')}
                minimumDate={startDate ?? new Date()}
                testID="repeat-until"
              />
              {repeatUntil && seriesUntilInvalid ? (
                <Text tone="danger" variant="bodySm" testID="repeat-until-error">
                  {t(seriesFrequency === 'monthly' ? 'event.repeatUntilInvalidMonthly' : 'event.repeatUntilInvalid')}
                </Text>
              ) : null}
            </VStack>
          ) : null}
          <LocationField
            value={coords}
            displayName={locationName}
            onChange={handleLocationChange}
            label={t('event.location')}
            required
            testID="event-location"
          />
          <MyVillagePicker
            label={t('event.village')}
            villages={editMode ? (editVillage ? [editVillage] : []) : joinedVillages}
            value={municipalityId}
            onChange={(id) => {
              setSelectedVillageId(id);
              setVillageManuallyPicked(true);
            }}
            disabled={editMode}
            testID="event-village"
          />
        </>,
      ),
    },
    {
      key: 'details',
      title: t('event.stepDetails'),
      icon: 'options-outline',
      validate: () => {
        const e: string[] = [];
        if (birthYearRangeInvalid) e.push('birthYearRange');
        if (birthYearOutOfBounds) e.push('birthYearBounds');
        return e;
      },
      render: () => stepBody(
        <>
          <ToggleField
            label={t('event.signupEnabled')}
            help={t('event.signupEnabledHint')}
            value={signupEnabled}
            onValueChange={set('signupEnabled')}
            testID="signup-enabled"
          />
          {!signupEnabled ? (
            <Input
              label={t('event.signupInfo')}
              value={signupInfo}
              onChangeText={set('signupInfo')}
              placeholder={t('event.signupInfoPlaceholder')}
              maxLength={200}
              testID="signup-info"
            />
          ) : null}
          {signupEnabled ? (
          <>
          <Input
            label={t('event.maxAttendees')}
            value={maxAttendees}
            onChangeText={set('maxAttendees')}
            keyboardType="numeric"
            testID="event-max-attendees"
          />
          {/* Advisory only: the sign-up sheet warns and still lets the user
              through, so this is a hint to the pueblo, not a gate. Most events
              have no age range at all, so the years stay behind the toggle
              rather than spending two inputs of the step on the rare case. */}
          <VStack gap={1}>
            <ToggleField
              label={t('event.birthYearLimit')}
              help={t('event.birthYearLimitHelp')}
              value={birthYearLimited}
              onValueChange={set('birthYearLimited')}
              testID="birth-year-limit"
            />
            {birthYearLimited ? (
            <HStack gap={2} className="items-start">
              <View className="flex-1">
                <Input
                  label={t('event.birthYearFrom')}
                  value={minBirthYear}
                  onChangeText={set('minBirthYear')}
                  keyboardType="numeric"
                  maxLength={4}
                  placeholder={t('event.birthYearFromExample')}
                  testID="min-birth-year"
                />
              </View>
              <View className="flex-1">
                <Input
                  label={t('event.birthYearTo')}
                  value={maxBirthYear}
                  onChangeText={set('maxBirthYear')}
                  keyboardType="numeric"
                  maxLength={4}
                  placeholder={t('event.birthYearToExample')}
                  testID="max-birth-year"
                />
              </View>
            </HStack>
            ) : null}
            {birthYearRangeInvalid ? (
              <Text tone="danger" variant="bodySm" testID="birth-year-range-error">
                {t('event.birthYearRangeInvalid')}
              </Text>
            ) : null}
            {birthYearOutOfBounds ? (
              <Text tone="danger" variant="bodySm" testID="birth-year-bounds-error">
                {t('event.birthYearBoundsInvalid', {
                  min: String(MIN_EVENT_BIRTH_YEAR),
                  max: String(MAX_EVENT_BIRTH_YEAR),
                })}
              </Text>
            ) : null}
          </VStack>
          <ToggleField
            label={t('event.telephoneRequired')}
            value={telephoneRequired}
            onValueChange={set('telephoneRequired')}
            testID="telephone-required"
          />
          <ToggleField
            label={t('event.requiresPayment')}
            value={requiresPayment}
            onValueChange={set('requiresPayment')}
            testID="requires-payment"
          />
          {/* Group sign-up is a yes/no first and a size second. Folding "1" into
              the size row made the common case (ordinary individual sign-up)
              look like a setting you had to understand before you could skip
              it. Turning it on picks the smallest real group; turning it off
              returns the event to 1. */}
          <ToggleField
            label={t('event.signupGroupSize')}
            help={t('event.signupGroupSizeHelp')}
            value={signupGroupSize > 1}
            onValueChange={(on) => set('signupGroupSize')(on ? GROUP_SIZE_CHOICES[0]! : 1)}
            disabled={groupSizeLocked}
            testID="signup-group-size"
          />
          {signupGroupSize > 1 ? (
            <VStack gap={1}>
              <FieldLabel>{t('event.signupGroupSizeCount')}</FieldLabel>
              <HStack gap={2} className="items-center">
                {GROUP_SIZE_CHOICES.map((size) => {
                  const active = signupGroupSize === size;
                  return (
                    <Pressable
                      key={size}
                      testID={`group-size-${String(size)}`}
                      accessibilityRole="radio"
                      accessibilityLabel={`${t('event.signupGroupSizeCount')}: ${String(size)}`}
                      accessibilityState={{ selected: active, disabled: groupSizeLocked }}
                      disabled={groupSizeLocked}
                      onPress={() => set('signupGroupSize')(size)}
                      className={`flex-1 items-center rounded-lg border py-2 ${
                        active ? 'border-accent bg-surface' : 'border-subtle'
                      } ${groupSizeLocked ? 'opacity-50' : ''}`}
                    >
                      <Text tone={active ? undefined : 'muted'}>{size}</Text>
                    </Pressable>
                  );
                })}
              </HStack>
            </VStack>
          ) : null}
          {/* Not tucked into the tooltip: this one explains why the control
              in front of you is dead, so it has to be visible. */}
          {groupSizeLocked ? (
            <Text variant="bodySm" tone="muted">
              {t('event.signupGroupSizeLocked')}
            </Text>
          ) : null}
          {/* Governs who can see the sign-up list, so it belongs to sign-ups:
              with them off there is no list for it to be about. */}
          <ToggleField
            label={t('event.attendeesPublic')}
            help={t('event.attendeesPublicHint')}
            value={attendeesPublic}
            onValueChange={set('attendeesPublic')}
            testID="attendees-public"
          />
          {/* Questions already answered can't be removed (they key the
              collected answers), so the form can't be switched off under them. */}
          <ToggleField
            label={t('event.formEnabled')}
            help={t('event.formEnabledHint')}
            value={formEnabled}
            onValueChange={set('formEnabled')}
            disabled={formEnabled && lockedFieldCount > 0}
            testID="form-enabled"
          />
          </>
          ) : null}
          {tasksOffered ? (
            <ToggleField
              label={t('event.tasksEnabled')}
              help={t('event.tasksEnabledHint')}
              value={tasksEnabled}
              onValueChange={setTasksEnabled}
              testID="tasks-enabled"
            />
          ) : null}
        </>,
      ),
    },
    // Custom sign-up questions are asked at sign-up time, so the step is
    // meaningless — and its answers unreachable — with in-app sign-ups off,
    // and it only appears once the creator asks for a form.
    ...(signupEnabled && formEnabled ? ([{
      key: 'questions',
      title: t('event.stepQuestions'),
      icon: 'help-circle-outline',
      // Half-finished questions are dropped on submit rather than blocking the
      // step: they are optional extras, and a creator who opened the step and
      // changed their mind shouldn't be trapped in it.
      render: () => stepBody(
        <SignupQuestionsEditor
          value={signupFields}
          onChange={set('signupFields')}
          lockedCount={lockedFieldCount}
        />,
      ),
    }] as StepConfig[]) : []),
    ...(tasksOffered && tasksEnabled ? ([{
      key: 'tasks',
      title: t('event.stepTasks'),
      icon: 'checkbox-outline',
      // Blank rows are dropped on submit, like half-finished questions; only a
      // yearly task without its month blocks, since it could not be dated.
      validate: () => (repeatsYearly && eventTasksMissingMonth(taskRows) ? ['taskMonth'] : []),
      render: () => stepBody(
        <>
          {taskOrgIds.length > 1 ? (
            <SelectField
              label={t('event.tasks.group')}
              value={taskOrg ?? ''}
              options={myGroups
                .filter((g) => taskOrgIds.includes(g.org.id))
                .map((g) => ({ value: g.org.id, label: g.org.name }))}
              onChange={setTaskOrgId}
              testID="event-tasks-group"
            />
          ) : null}
          <EventTasksEditor rows={taskRows} onChange={setTaskRows} yearly={repeatsYearly} />
        </>,
      ),
    }] as StepConfig[]) : []),
  ];

  // bottomInset={false}: the Stepper's own bottom nav bar applies the safe-area inset.
  return (
    <Screen padded={false} bottomInset={false} topInset={false}>
      <ScreenHeader
        accent
        title={headerTitle}
        rightSlot={
          editMode ? (
            <DeleteHeaderButton
              testID="event-delete"
              onAccent
              onConfirm={deleteEvent}
              accessibilityLabel={t('common.delete')}
              confirmTitle={t('event.cancelTitle')}
              confirmMessage={loadedEvent?.series ? t('event.cancelSeriesConfirm') : t('event.cancelConfirm')}
              confirmLabel={loadedEvent?.series ? t('event.cancelSeriesOne') : t('common.delete')}
              cancelLabel={t('common.cancel')}
              deletingLabel={t('common.deleting.event')}
              alternative={
                loadedEvent?.series
                  ? { label: t('event.cancelSeriesFollowing'), onConfirm: deleteSeriesFromHere }
                  : undefined
              }
            />
          ) : undefined
        }
      />
      <View style={{ flex: 1 }}>
        <Stepper
          steps={steps}
          onComplete={handleComplete}
          submitLabel={editMode ? t('common.save') : t('event.createEvent')}
          loading={isPending}
          allStepsReachable={editMode}
          primaryTestID="event-form-primary"
        />
      </View>
    </Screen>
  );
}
