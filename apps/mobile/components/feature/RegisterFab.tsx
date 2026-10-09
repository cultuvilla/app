import { personHref } from '../../lib/navigation/routes';
import { useCallback, useRef, useState } from 'react';
import { Animated, Pressable as RNPressable, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { showAlert, showConfirm } from '../../lib/dialogs';
import { AttendeeSheet, type AttendeeOption } from './AttendeeSheet';
import { GroupSignupSheet, type MyGroupSeat } from './GroupSignupSheet';
import {
  computeRegistrationDiff,
  indexRegistrationsByPerson,
  outOfRangeAttendeeNames,
  type AttendeeDiff,
  type AttendeeRegistration,
} from './attendeeDiff';
import {
  cancelRegistration,
  getGroupRegistrations,
  getMySeatTokens,
  getUserRegistrations,
  registerToEvent,
} from '@cultuvilla/shared/services/registrationService';
import { getSeatClaimLink } from '@cultuvilla/shared/services/deepLinkService';
import { useShareDeepLink } from '../../lib/deeplink/useShareDeepLink';
import { getPersonsByCreator } from '@cultuvilla/shared/services/personService';
import type { SignupAnswers, SignupFieldSpec } from '@cultuvilla/shared/models/event/SignupFieldModel';
import { buildNameWithNickname, type PersonData } from '@cultuvilla/shared/models/person';
import type { BirthYearWindow } from '@cultuvilla/shared/models/event/EventDataModel';
import { birthYearRangeLabel } from '../../lib/events/birthYearLabel';
import { useT } from '../../lib/i18n';
import { useMyRegistrations } from '../../lib/registrations/MyRegistrationsContext';
import { usePush } from '../../lib/push/PushProvider';
import { withFirestoreErrorLog } from '../../lib/firestoreErrorLog';
import { rememberProfilePhone } from '../../lib/profilePhone';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';

export interface RegisterFabProps {
  eventId: string;
  /** Firebase Auth uid — every registration the user makes is stamped with it. */
  userId: string;
  /** The caller's own persona id. */
  personId: string;
  /** The caller's own display name. */
  name: string;
  /** The event's title — what a shared seat-claim link names in its message. */
  eventTitle: string;
  /** The event's pueblo slug — a seat-claim link is village-first like every other URL. */
  villageSlug: string;
  /** Non-null for an org-private event — its seat links must not carry the title. */
  visibilityOrgId: string | null;
  /** When true, adding new attendees first requires a shared phone. */
  telephoneRequired: boolean;
  /** The account's saved phone — prefills the sign-up phone, updated after a sign-up. */
  savedPhone?: string | null;
  /** Called once a new phone has been saved to the profile, so it can be re-read. */
  onPhoneSaved?: () => void | Promise<void>;
  /** The event's custom sign-up fields, answered once per new attendee. */
  signupFields?: SignupFieldSpec[];
  /** The event's municipality — threaded into signup observability events. */
  villageId?: string;
  /** `signupGroupSize`: > 1 switches the FAB to the group sign-up sheet. */
  groupSize?: number;
  /** The caller's own birth year, for the advisory birth-year check. */
  ownBirthYear?: number | null;
  /** The event's advertised birth-year window; both ends null = no window. */
  birthYearWindow?: BirthYearWindow;
}

type PersonDoc = PersonData & { id: string };

/**
 * Ordago-style floating sign-up button for the event detail screen. Tapping it
 * opens an {@link AttendeeSheet} where the caller signs up themselves and any
 * personas a cargo (or creates a new dependent). The pill reflects how many of
 * the caller's personas are currently registered, turning amber if any are
 * waitlisted.
 *
 * Styles live on `style` (never `className`) so the pill renders on RN-Web.
 */
export function RegisterFab({
  eventId,
  userId,
  personId,
  name,
  eventTitle,
  villageSlug,
  visibilityOrgId,
  telephoneRequired,
  savedPhone,
  onPhoneSaved,
  signupFields,
  villageId,
  groupSize = 1,
  ownBirthYear = null,
  birthYearWindow = { minBirthYear: null, maxBirthYear: null },
}: RegisterFabProps) {
  const { t } = useT();
  const { offerPush } = usePush();
  const { refresh: refreshRegistrations } = useMyRegistrations();
  const shareDeepLink = useShareDeepLink();
  const [registrations, setRegistrations] = useState<Map<string, AttendeeRegistration>>(new Map());
  const [dependents, setDependents] = useState<PersonDoc[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoSelectIds, setAutoSelectIds] = useState<string[]>([]);
  const [mySeats, setMySeats] = useState<MyGroupSeat[]>([]);
  const knownDepIds = useRef<Set<string>>(new Set());
  const isGroupEvent = groupSize > 1;

  // Load the caller's registrations + personas a cargo. Runs on focus so a
  // dependent created via /person/new shows up on return.
  const load = useCallback(async () => {
    // The two reads are independent — the registered set and the persona list
    // come from different collections. Fetch them separately (allSettled) so a
    // failure in one (e.g. a missing index on registrations) never blanks the
    // other; coupling them in a single Promise.all previously hid every
    // dependent whenever getUserRegistrations threw.
    const [regsResult, depsResult] = await Promise.allSettled([
      withFirestoreErrorLog('event:getUserRegistrations', () => getUserRegistrations(eventId, userId)),
      withFirestoreErrorLog('event:getPersonsByCreator', () =>
        // Own personas: the caller is the creator, so the private ones count too.
        getPersonsByCreator(userId, userId),
      ),
    ]);

    if (regsResult.status === 'fulfilled') {
      // Open seats are deliberately kept out of this map — see
      // indexRegistrationsByPerson.
      setRegistrations(indexRegistrationsByPerson(regsResult.value));

      if (isGroupEvent) {
        // Two reads, unioned by doc id. A claimed seat's `userId` is the
        // guest's, so getUserRegistrations alone would drop it from the
        // owner's group; getGroupRegistrations catches every seat they booked.
        // Both are best-effort — the seat list must survive either failing.
        const [groupSeats, tokens] = await Promise.allSettled([
          withFirestoreErrorLog('event:getGroupRegistrations', () =>
            getGroupRegistrations(eventId, userId),
          ),
          getMySeatTokens(eventId, userId),
        ]);
        const tokenByReg =
          tokens.status === 'fulfilled'
            ? new Map(
                tokens.value.filter((tk) => !tk.consumed).map((tk) => [tk.registrationId, tk.token]),
              )
            : new Map<string, string>();

        const byId = new Map(regsResult.value.map((r) => [r.id, r]));
        if (groupSeats.status === 'fulfilled') {
          for (const r of groupSeats.value) byId.set(r.id, r);
        }
        setMySeats(
          [...byId.values()].map((r) => ({
            regId: r.id,
            name: r.name,
            status: r.status,
            isOpenSeat: r.isOpenSeat,
            ...(tokenByReg.has(r.id) ? { token: tokenByReg.get(r.id) as string } : {}),
          })),
        );
      }
    }

    if (depsResult.status === 'fulfilled') {
      // Drop the caller's own persona (rendered from props) and other account holders.
      const filtered = depsResult.value.filter((d) => d.id !== personId && d.userId !== userId);
      const known = knownDepIds.current;
      const fresh = filtered.filter((d) => !known.has(d.id)).map((d) => d.id);
      if (known.size > 0 && fresh.length > 0) setAutoSelectIds(fresh);
      knownDepIds.current = new Set(filtered.map((d) => d.id));
      setDependents(filtered);
    }
  }, [eventId, userId, personId, isGroupEvent]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // iOS presents a Modal above every screen, so a sheet left open while
  // "Crear una nueva persona" pushes the person form would cover that form.
  // Hide it while this screen is out of focus; it comes back as it was.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const attendees: AttendeeOption[] = [
    { id: personId, name, status: registrations.get(personId)?.status },
    ...dependents.map((d) => ({
      id: d.id,
      name: buildNameWithNickname(d),
      status: registrations.get(d.id)?.status,
    })),
  ];
  const names = new Map(attendees.map((a) => [a.id, a.name]));
  const birthYearById = new Map<string, number | null>([
    [personId, ownBirthYear],
    ...dependents.map((d) => [d.id, d.birthday?.year ?? null] as [string, number | null]),
  ]);

  /**
   * Gate a sign-up behind the advisory birth-year confirm. The window is a
   * hint the organizer publishes, never a rule — so this only ever asks, and
   * proceeds on yes.
   */
  function confirmBirthYears(personIds: string[], proceed: () => void) {
    const flagged = outOfRangeAttendeeNames(birthYearWindow, personIds, birthYearById, names);
    if (flagged.length === 0) {
      proceed();
      return;
    }
    showConfirm(
      t('event.register.birthYearTitle'),
      t('event.register.birthYearBody', {
        names: flagged.join(', '),
        // Non-empty `flagged` implies a window exists, so the label is never null.
        range: birthYearRangeLabel(birthYearWindow, t) ?? '',
      }),
      proceed,
      { confirmText: t('event.register.birthYearConfirm'), cancelText: t('common.cancel') },
    );
  }

  async function applyDiff(
    diff: AttendeeDiff,
    phone?: string,
    answersByPersonId?: Record<string, SignupAnswers>,
  ) {
    setBusy(true);
    let succeeded = false;
    try {
      const next = new Map(registrations);
      if (diff.toAdd.length > 0) {
        const registrants = diff.toAdd.map((a) => {
          const answers = answersByPersonId?.[a.personId];
          return {
            ...a,
            ...(phone ? { phone } : {}),
            ...(answers && Object.keys(answers).length > 0 ? { answers } : {}),
          };
        });
        const { registrations: summaries } = await registerToEvent(eventId, registrants);
        succeeded = true;
        void rememberProfilePhone(userId, savedPhone, phone, onPhoneSaved);
        summaries.forEach((s, i) => {
          const pid = diff.toAdd[i]?.personId;
          if (pid) next.set(pid, { regId: s.id, status: s.status });
        });
        observability.trackEvent(OBSERVABILITY_EVENTS.EVENT_SIGNUP_SUCCESS, { villageId });
      }
      for (const regId of diff.toCancelRegIds) {
        await cancelRegistration(eventId, regId);
      }
      const cancelled = new Set(diff.toCancelRegIds);
      for (const [pid, reg] of next) {
        if (cancelled.has(reg.regId)) next.delete(pid);
      }
      setRegistrations(next);
      setAutoSelectIds([]);
      setSheetOpen(false);
      // The moment push earns its ask: a seat was just booked, and "we'll tell
      // you if it changes" is a concrete, true promise. The policy decides
      // whether the sheet actually shows.
      if (diff.toAdd.length > 0) offerPush('event_signup');
      // Keep the feed's "apuntado" ribbons honest without waiting for the next
      // focus refresh.
      refreshRegistrations();
    } catch (e) {
      if (!succeeded) observability.trackEvent(OBSERVABILITY_EVENTS.EVENT_SIGNUP_ERROR, { villageId });
      showAlert(e instanceof Error ? e.message : 'unknown', t('event.register.error'));
    } finally {
      setBusy(false);
    }
  }

  async function applyGroup(
    selectedIds: string[],
    openSeats: number,
    phone?: string,
    answersByPersonId?: Record<string, SignupAnswers>,
  ) {
    setBusy(true);
    let succeeded = false;
    try {
      const registrants = selectedIds.map((pid) => {
        const answers = answersByPersonId?.[pid];
        return {
          personId: pid,
          name: names.get(pid) ?? '',
          ...(phone ? { phone } : {}),
          ...(answers && Object.keys(answers).length > 0 ? { answers } : {}),
        };
      });
      // One call for the whole group — that is what lets the server seat it
      // atomically instead of racing seat by seat against the capacity.
      const result = await registerToEvent(eventId, registrants, openSeats);
      succeeded = true;
      void rememberProfilePhone(userId, savedPhone, phone, onPhoneSaved);
      observability.trackEvent(OBSERVABILITY_EVENTS.EVENT_SIGNUP_SUCCESS, { villageId });
      setAutoSelectIds([]);
      await load();
      refreshRegistrations();
      // Booking an open seat leaves the sheet on its summary, where every
      // unclaimed seat carries its own send-link row. Firing the OS share sheet
      // unasked hijacked the moment the booking was confirmed and gave no way
      // back to the other seats' links.
      if (result.openSeats.length === 0) {
        setSheetOpen(false);
        offerPush('event_signup');
      }
    } catch (e) {
      if (!succeeded) observability.trackEvent(OBSERVABILITY_EVENTS.EVENT_SIGNUP_ERROR, { villageId });
      showAlert(e instanceof Error ? e.message : 'unknown', t('event.register.error'));
    } finally {
      setBusy(false);
    }
  }

  async function shareSeat(token: string) {
    // `deeplink.share.event.invite` reads "Te he guardado una plaza en «{name}»",
    // so the slot is the event, not whoever is sending it.
    await shareDeepLink(
      getSeatClaimLink({ id: eventId, title: eventTitle, villageSlug, visibilityOrgId }, token),
      eventTitle,
    );
  }

  function handleCancelGroup(regId: string) {
    showConfirm(t('event.group.cancelTitle'), t('event.group.cancelBody'), () => {
      void (async () => {
        setBusy(true);
        try {
          await cancelRegistration(eventId, regId);
          await load();
          refreshRegistrations();
          setSheetOpen(false);
        } catch (e) {
          showAlert(e instanceof Error ? e.message : 'unknown', t('event.register.error'));
        } finally {
          setBusy(false);
        }
      })();
    }, { confirmText: t('event.register.cancelConfirm'), cancelText: t('common.cancel') });
  }

  function handleConfirm(
    selectedIds: string[],
    phone?: string,
    answersByPersonId?: Record<string, SignupAnswers>,
  ) {
    const diff = computeRegistrationDiff(new Set(selectedIds), registrations, names);
    if (diff.toAdd.length === 0 && diff.toCancelRegIds.length === 0) {
      setSheetOpen(false);
      return;
    }
    // Only the personas being ADDED are checked: someone already registered
    // has been through this prompt once, and re-asking on an unrelated edit
    // (adding a sibling, cancelling another seat) would be nagging.
    confirmBirthYears(diff.toAdd.map((a) => a.personId), () => {
      applyConfirmed(diff, phone, answersByPersonId);
    });
  }

  function applyConfirmed(
    diff: AttendeeDiff,
    phone?: string,
    answersByPersonId?: Record<string, SignupAnswers>,
  ) {
    if (diff.toCancelRegIds.length > 0) {
      // One combined confirm covers all removals.
      showConfirm(t('event.register.cancelTitle'), t('event.register.cancelManyBody'), () => void applyDiff(diff, phone, answersByPersonId), {
        confirmText: t('event.register.cancelConfirm'),
        cancelText: t('common.cancel'),
      });
    } else {
      void applyDiff(diff, phone, answersByPersonId);
    }
  }

  const count = registrations.size;
  const confirmedCount = [...registrations.values()].filter((r) => r.status === 'confirmed').length;
  const waitlistedCount = count - confirmedCount;
  // When the caller has a mix of confirmed + waitlisted personas we show two
  // pills side by side, each with its own tally, so the split is legible.
  // Otherwise a single pill: sign-up CTA, all-confirmed, or all-waitlisted.
  // The first pill always carries the `register-fab` testID so the sheet stays
  // openable via a stable handle regardless of the split.
  const pillContent: { label: string; prefix: string; bg: string }[] =
    count === 0
      ? [{ label: t('event.register.cta'), prefix: '+', bg: '#bb5d3a' }]
      : [
          ...(confirmedCount > 0
            ? [{ label: t('event.register.signedUpCount', { count: confirmedCount }), prefix: '✓', bg: '#2f7d4f' }]
            : []),
          ...(waitlistedCount > 0
            ? [{ label: t('event.register.waitlistedCount', { count: waitlistedCount }), prefix: '⏳', bg: '#b07a1e' }]
            : []),
        ];
  const pills = pillContent.map((p, i) => ({ ...p, testID: i === 0 ? 'register-fab' : 'register-fab-waitlist' }));

  return (
    <>
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 24,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 10,
          zIndex: 20,
        }}
      >
        {pills.map((pill) => (
          <RNPressable
            key={pill.testID}
            onPress={() => {
              if (!busy) setSheetOpen(true);
            }}
            disabled={busy}
            testID={pill.testID}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, selected: count > 0 }}
            accessibilityLabel={pill.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 10,
              paddingHorizontal: 22,
              borderRadius: 999,
              backgroundColor: pill.bg,
              opacity: busy ? 0.7 : 1,
              elevation: 6,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 3 },
            }}
          >
            <Text style={{ color: '#f9f0e8', fontSize: 18, lineHeight: 22, marginRight: 8 }}>{pill.prefix}</Text>
            <Text style={{ color: '#f9f0e8', fontSize: 16, fontWeight: '700' }}>{pill.label}</Text>
          </RNPressable>
        ))}
      </Animated.View>

      {isGroupEvent ? (
        <GroupSignupSheet
          visible={sheetOpen}
          hidden={!focused}
          groupSize={groupSize}
          attendees={attendees}
          ownPersonId={personId}
          mySeats={mySeats}
          telephoneRequired={telephoneRequired}
          savedPhone={savedPhone}
          signupFields={signupFields}
          busy={busy}
          autoSelectIds={autoSelectIds}
          onClose={() => setSheetOpen(false)}
          onCreateNew={() => router.push(personHref('new'))}
          onShareSeat={(token) => void shareSeat(token)}
          onCancelGroup={handleCancelGroup}
          onConfirm={(ids, openSeats, phone, answers) => {
            // An open seat is claimed by whoever gets the link, so there is no
            // birth year to check for it — only the personas booked by name.
            confirmBirthYears(ids, () => void applyGroup(ids, openSeats, phone, answers));
          }}
        />
      ) : (
        <AttendeeSheet
          visible={sheetOpen}
          hidden={!focused}
          attendees={attendees}
          telephoneRequired={telephoneRequired}
          savedPhone={savedPhone}
          signupFields={signupFields}
          busy={busy}
          autoSelectIds={autoSelectIds}
          onClose={() => setSheetOpen(false)}
          onCreateNew={() => router.push(personHref('new'))}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
