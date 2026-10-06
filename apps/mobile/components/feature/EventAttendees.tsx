import { personHref, userHref } from '../../lib/navigation/routes';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { Text } from '../primitives/Text';
import { Pressable } from '../primitives/Pressable';
import { Button } from '../primitives/Button';
import { Avatar } from '../primitives/Avatar';
import { DetailSectionHeading } from './DetailSectionHeading';
import { SectionEditToggle } from './SectionEditToggle';
import { RosterExportButton } from './RosterExportButton';
import {
  getEventRegistrations,
  getRegistrationPrivate,
  cancelRegistration,
  setRegistrationPaid,
} from '@cultuvilla/shared/services/registrationService';
import type { RegistrationData } from '@cultuvilla/shared/models/event/RegistrationDataModel';
import type {
  SignupAnswers,
  SignupAnswerValue,
  SignupFieldSpec,
} from '@cultuvilla/shared/models/event/SignupFieldModel';
import type { PartialDate } from '@cultuvilla/shared/models/person/PersonDataModel';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { formatDate } from '@cultuvilla/shared/utils/format';
import { useT } from '../../lib/i18n';
import { showConfirm } from '../../lib/dialogs';

type Row = RegistrationData & { id: string };

// Answers are stored as primitives (a date as its ISO string), so rendering
// goes through the locale formatter rather than String() for dates and yes/no
// for the checkbox type.
function formatAnswer(value: string | number | boolean, t: (key: string) => string): string {
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no');
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return formatDate(parsed);
  }
  return String(value);
}

/**
 * The event's attendee roster, shown inline on the event detail screen in one
 * of two modes.
 *
 * **Read-only (`canManage: false`)** — what a fellow villager sees when the
 * event's `attendeesVisibility` is `members`: photo, name, and the moment each
 * person signed up (the list is ordered by that moment, so the timestamp
 * doubles as the queue position). Nothing else. Seeing who is going is what
 * drives sign-ups in a pueblo; the running *ops* of the event are not public.
 *
 * **Organizer (`canManage: true`)** — the above plus the ops: mark paid, call
 * (when the event collected a phone), export, and remove. Removing is
 * destructive, so the trash icons stay hidden until the heading's "Editar"
 * toggle is on — and that toggle only appears once someone has signed up.
 * Edit mode is exclusively about removing: while it is on, the paid checkbox
 * and the call icon step aside, so the only tappable control per row is the
 * trash. Tapping "Pagado" when you meant the trash next to it is a wrong
 * write on someone's registration; a one-purpose row makes that impossible.
 *
 * Two things are deliberately organizer-only and must stay that way:
 * `registrationPrivate` (phone, custom answers, birth date) is never even
 * fetched in read-only mode, and a private persona (`isPersonPublic: false`) is counted
 * but rendered anonymously — the person doc is already denied to other
 * villagers, so naming them here would republish exactly what that setting
 * hides. Payment and check-in state are hidden rather than redacted: they live
 * on the world-readable registration doc, so this is a UI courtesy, not a
 * security boundary.
 */
export function EventAttendees({
  eventId,
  eventTitle,
  eventDate,
  telephoneRequired,
  requiresPayment,
  signupFields = [],
  groupSize = 1,
  canManage,
}: {
  eventId: string;
  eventTitle: string;
  eventDate: Date | null;
  telephoneRequired: boolean;
  requiresPayment: boolean;
  /** The event's custom sign-up fields; answers are listed under each row. */
  signupFields?: SignupFieldSpec[];
  /** `signupGroupSize`: > 1 means rows can be unclaimed open seats. */
  groupSize?: number;
  /** Organizer set / village admin / app admin: unlocks the ops affordances. */
  canManage: boolean;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [phones, setPhones] = useState<Record<string, string | null>>({});
  const [answers, setAnswers] = useState<Record<string, SignupAnswers>>({});
  // Export-only: the roster itself never shows a birth date, but the organizer
  // exporting it gets a column. Same gated doc as the phone and the answers.
  const [birthdays, setBirthdays] = useState<Record<string, PartialDate | null>>({});
  const [callTarget, setCallTarget] = useState<{ name: string; phone: string } | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const regs = await getEventRegistrations(eventId);
    setRows(regs);
    // Photo, linked account and privacy are denormalized onto the registration
    // at sign-up. They used to be a `getPerson` per row, which one organizer
    // paid for; this list is now read by the whole pueblo, so that fan-out
    // would be paid by every viewer on every open.
    // One gated doc per registration carries the phone, the custom answers and
    // the attendee's birth date, so a single fan-out covers all three. Gated on
    // `canManage` alone: every sign-up denormalizes a birth date there, so
    // "does this event collect anything?" stopped being the right question —
    // and a non-organizer is denied the docs by rules, so asking would only log
    // noise. The fan-out is paid by the handful of people who run the event,
    // never by the pueblo reading the roster.
    if (canManage) {
      const entries = await Promise.all(
        regs.map(async (r) => [r.id, await getRegistrationPrivate(eventId, r.id)] as const),
      );
      setPhones(Object.fromEntries(entries.map(([id, p]) => [id, p?.phone ?? null])));
      setAnswers(Object.fromEntries(entries.map(([id, p]) => [id, p?.answers ?? {}])));
      setBirthdays(Object.fromEntries(entries.map(([id, p]) => [id, p?.birthday ?? null])));
    }
  }, [eventId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePaid = useCallback(
    async (regId: string, next: boolean) => {
      await setRegistrationPaid(eventId, regId, next);
      await load();
    },
    [eventId, load],
  );

  // getEventRegistrations already orders by `registeredAt`, so the split keeps
  // each section in sign-up order. Waitlist promotion is automatic (a Cloud
  // Function fires when a confirmed reg is removed) — no manual promote action.
  const confirmed = (rows ?? []).filter((r) => r.status === 'confirmed');
  const waitlisted = (rows ?? []).filter((r) => r.status === 'waitlisted');
  // Nothing to edit with an empty roster, so the toggle only appears once
  // someone has signed up.
  const hasAttendees = confirmed.length + waitlisted.length > 0;

  // A private persona is shown anonymously to everyone but an organizer, so
  // neither its name nor its photo is rendered — and the row is never tappable,
  // since the person doc behind it is denied to this reader anyway.
  const isAnonymous = (r: Row) => !canManage && !r.isPersonPublic;

  // Account holders get the richer /user profile; dependent personas open
  // their read-only person card. A walk-in (no person, no account) and an
  // anonymized row simply aren't tappable.
  const profileHref = (r: Row) => {
    // An open seat has no person behind it yet; there is nowhere to go.
    if (r.isOpenSeat) return null;
    if (isAnonymous(r)) return null;
    if (r.personUserId) return userHref(r.personUserId);
    return r.personId ? personHref(r.personId) : null;
  };

  const renderRow = (r: Row) => {
    const href = profileHref(r);
    const anonymous = isAnonymous(r);
    const displayName = r.isOpenSeat
      ? t('event.group.openSeat')
      : anonymous
        ? t('event.attendeePrivate')
        : r.name;
    // registeredAt is a required field on every stored registration; the guard
    // is for partially-mocked rows in tests, not for real data.
    const signedUpAt = r.registeredAt ? formatDate(r.registeredAt, 'datetime') : null;
    const identity = (
      <>
        <Avatar
          uri={anonymous || r.isOpenSeat ? null : r.photoURL}
          size={36}
          initials={anonymous || r.isOpenSeat ? '·' : displayName.slice(0, 1).toUpperCase()}
        />
        <VStack gap={0} className="flex-1">
          <Text numberOfLines={1} tone={anonymous ? 'muted' : undefined}>
            {displayName}
          </Text>
          {signedUpAt ? (
            <Text
              testID={`attendee-signed-up-${r.id}`}
              variant="bodySm"
              tone="muted"
              numberOfLines={1}
              accessibilityLabel={t('event.signedUpAt', { date: signedUpAt })}
            >
              {signedUpAt}
            </Text>
          ) : null}
        </VStack>
      </>
    );
    // Only the fields this attendee actually answered; an optional field left
    // blank has no entry and simply doesn't render.
    const given = (canManage ? signupFields : [])
      .map((f) => ({ field: f, value: answers[r.id]?.[f.id] }))
      .filter((a): a is { field: SignupFieldSpec; value: SignupAnswerValue } => a.value !== undefined);

    const row = (
    <HStack gap={3} align="center" className="py-2">
      {href ? (
        <Pressable
          testID={`attendee-profile-${r.id}`}
          onPress={() => router.push(href as never)}
          accessibilityRole="button"
          accessibilityLabel={displayName}
          className="flex-1 flex-row items-center gap-3"
        >
          {identity}
        </Pressable>
      ) : (
        identity
      )}
      {canManage && !editing && requiresPayment ? (
        <Pressable
          testID={`paid-attendee-${r.id}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: r.paidAt != null }}
          accessibilityLabel={t('event.paid')}
          onPress={() => void togglePaid(r.id, r.paidAt == null)}
        >
          <Ionicons
            name={r.paidAt != null ? 'checkbox' : 'square-outline'}
            size={iconSizes.md}
            color={r.paidAt != null ? colors.light.fg.accent : colors.light.fg.muted}
          />
        </Pressable>
      ) : null}
      {canManage && !editing && telephoneRequired && phones[r.id] ? (
        <Pressable
          testID={`call-attendee-${r.id}`}
          accessibilityLabel={t('event.call')}
          onPress={() => setCallTarget({ name: r.name, phone: phones[r.id] ?? '' })}
        >
          <Ionicons name="call-outline" size={iconSizes.md} color={colors.light.fg.accent} />
        </Pressable>
      ) : null}
      {canManage && editing ? (
        <Pressable
          testID={`remove-attendee-${r.id}`}
          accessibilityLabel={t('common.delete')}
          hitSlop={8}
          onPress={() =>
            showConfirm(
              t('event.removeAttendeeTitle'),
              t('event.removeAttendeeBody', { name: displayName }),
              () => void cancelRegistration(eventId, r.id).then(load),
              { confirmText: t('event.removeAttendeeConfirm'), cancelText: t('common.cancel') },
            )
          }
        >
          <Ionicons name="trash-outline" size={iconSizes.md} color={colors.light.fg.danger} />
        </Pressable>
      ) : null}
    </HStack>
    );

    if (given.length === 0) return <VStack key={r.id}>{row}</VStack>;
    return (
      <VStack key={r.id}>
        {row}
        <VStack gap={0} className="pl-12 pb-2">
          {given.map(({ field, value }) => (
            <Text key={field.id} variant="caption" tone="muted" testID={`answer-${r.id}-${field.id}`}>
              {field.label}: {formatAnswer(value, t)}
            </Text>
          ))}
        </VStack>
      </VStack>
    );
  };

  return (
    <VStack gap={2}>
      <DetailSectionHeading
        action={
          canManage && hasAttendees ? (
            <HStack gap={4} align="center">
              <RosterExportButton
                eventTitle={eventTitle}
                eventDate={eventDate}
                registrations={rows ?? []}
                phones={phones}
                birthdays={birthdays}
                telephoneRequired={telephoneRequired}
                requiresPayment={requiresPayment}
                signupFields={signupFields}
                answers={answers}
              />
              <SectionEditToggle
                testID="attendees-edit-toggle"
                editing={editing}
                onToggle={() => setEditing((e) => !e)}
              />
            </HStack>
          ) : undefined
        }
      >
        {confirmed.length > 0 ? `${t('event.attendees')} (${confirmed.length})` : t('event.attendees')}
      </DetailSectionHeading>
      {groupSize > 1 ? (
        <Text tone="muted" variant="bodySm" testID="attendees-group-note">
          {t('event.group.rosterNote', { count: groupSize })}
        </Text>
      ) : null}
      {rows && confirmed.length === 0 ? (
        <Text tone="muted" variant="bodySm">
          {t('event.attendeesEmpty')}
        </Text>
      ) : (
        confirmed.map(renderRow)
      )}

      {waitlisted.length > 0 ? (
        <VStack gap={2} className="mt-4">
          <DetailSectionHeading>{`${t('event.waitlist')} (${waitlisted.length})`}</DetailSectionHeading>
          {waitlisted.map(renderRow)}
        </VStack>
      ) : null}

      <Modal
        visible={callTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCallTarget(null)}
      >
        <Pressable
          accessible={false}
          onPress={() => setCallTarget(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          className="items-center justify-center px-8"
        >
          {/* Inner press-catcher: taps inside the card must not dismiss. */}
          <Pressable accessible={false} onPress={() => {}} className="w-full rounded-lg bg-surface-elevated p-5 border border-subtle">
            {callTarget ? (
              <VStack gap={3}>
                <Text variant="h3">{callTarget.name}</Text>
                <Text variant="h2" style={{ color: colors.light.fg.accent }}>
                  {callTarget.phone}
                </Text>
                <HStack gap={3} className="justify-end items-center">
                  <Button variant="ghost" onPress={() => setCallTarget(null)}>
                    {t('common.close')}
                  </Button>
                  <Button
                    variant="primary"
                    onPress={() => {
                      const phone = callTarget.phone;
                      setCallTarget(null);
                      void Linking.openURL(`tel:${phone}`).catch(() => {});
                    }}
                  >
                    {t('event.call')}
                  </Button>
                </HStack>
              </VStack>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </VStack>
  );
}
