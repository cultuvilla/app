import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import { addDays, madridDayRange } from '@cultuvilla/shared/models';
import {
  RESERVA_WEEKDAYS,
  reservaBookableDays,
  reservaDaySlots,
  reservaWeekday,
} from '@cultuvilla/shared/models/organization';
import {
  bookReservaSlot,
  setReservaBlackouts,
  watchCosaSlots,
  type Cosa,
  type CosaRequest,
  type CosaSlot,
} from '@cultuvilla/shared/services/cosatecaService';
import { formatDayKey } from '@cultuvilla/shared/utils';
import { Button, DateRangeField, FieldLabel, HStack, Input, Pressable, Text, Toggle, VStack } from '../../../primitives';
import { DetailSectionHeading } from '../../DetailSectionHeading';
import { useT } from '../../../../lib/i18n';
import { showAlert, showConfirm } from '../../../../lib/dialogs';
import { useWatch } from '../../../../lib/hooks/useWatch';
import type { DayRange } from '../../../../lib/date/dayRange';
import { cosatecaErrorMessage, reservaSlotLabel } from '../../../../lib/orgs/cosateca';
import { reservaSlotStates, type ReservaDraft } from '../../../../lib/orgs/reserva';

/** The weekday's short name, from the day key. */
function dayChipLabel(t: (key: string, values?: Record<string, string | number>) => string, day: string): string {
  return t('groups.cosateca.reserva.dayChip', {
    weekday: t(`groups.cosateca.reserva.weekdaysShort.${reservaWeekday(day)}`),
    date: formatDayKey(day, 'dayMonthShort'),
  });
}

/**
 * Book a reserva: pick a day within its horizon, then a free slot. Taken slots
 * show as taken and never say by whom; the viewer's own show as theirs.
 */
export function ReservaBooking({
  cosa,
  canBook,
  myBookings,
  onBooked,
}: {
  cosa: Cosa;
  /** False for its owner, or while it is paused: the grid still shows. */
  canBook: boolean;
  myBookings: CosaRequest[];
  onBooked: (requestId: string) => void;
}) {
  const { t } = useT();
  const config = cosa.reserva;
  const today = madridDayKey(new Date());
  const days = useMemo(() => (config ? reservaBookableDays(config, today) : []), [config, today]);
  const [day, setDay] = useState(today);
  const [booking, setBooking] = useState(false);

  const range = useMemo(() => madridDayRange(day, day), [day]);
  const taken = useWatch<CosaSlot[]>(
    'cosateca:watchCosaSlots',
    `${cosa.id}|${day}`,
    (next, error) => watchCosaSlots(cosa.id, range.start, new Date(range.end.getTime() + 1), next, error),
  );
  const now = new Date();
  const slots = useMemo(
    () => (config ? reservaSlotStates(reservaDaySlots(config, day), taken.data ?? [], myBookings) : []),
    [config, day, taken.data, myBookings],
  );

  if (!config) return null;

  const book = (startAt: Date, time: string) => {
    showConfirm(
      t('groups.cosateca.reserva.confirmTitle'),
      t('groups.cosateca.reserva.confirmBody', { title: cosa.title, day: formatDayKey(day, 'long'), time }),
      () => {
        setBooking(true);
        bookReservaSlot(cosa.id, startAt)
          .then(({ requestId }) => onBooked(requestId))
          .catch((err: unknown) => showAlert(cosatecaErrorMessage(t, err)))
          .finally(() => setBooking(false));
      },
      { confirmText: t('groups.cosateca.reserva.book'), cancelText: t('common.cancel') },
    );
  };

  return (
    <VStack gap={3}>
      <DetailSectionHeading>{t('groups.cosateca.reserva.pick')}</DetailSectionHeading>
      {config.requiresApproval ? (
        <Text variant="bodySm" tone="muted">
          {t('groups.cosateca.reserva.needsApproval')}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {days.map((d) => {
          const chosen = d === day;
          return (
            <Pressable
              key={d}
              testID={`reserva-day-${d}`}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              onPress={() => setDay(d)}
              className={`px-3 py-1.5 rounded-full border ${chosen ? 'bg-accent border-accent' : 'bg-surface border-subtle'}`}
            >
              <Text variant="bodySm" tone={chosen ? 'onAccent' : 'primary'} className={chosen ? 'font-bold' : ''}>
                {dayChipLabel(t, d)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {slots.length === 0 ? (
        <Text tone="muted" testID="reserva-no-slots">
          {t('groups.cosateca.reserva.noSlots')}
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {slots.map(({ slot, state }) => {
            const past = slot.startAt.getTime() <= now.getTime();
            const open = state === 'free' && !past && canBook && !booking;
            return (
              <Pressable
                key={slot.key}
                testID={`reserva-slot-${slot.time}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: !open }}
                accessibilityLabel={`${slot.time} ${t(`groups.cosateca.reserva.state.${past && state === 'free' ? 'past' : state}`)}`}
                disabled={!open}
                onPress={() => book(slot.startAt, slot.time)}
                className={`px-3 py-2 rounded-md border ${
                  state === 'mine' ? 'bg-accent border-accent' : open ? 'bg-surface border-accent' : 'bg-accent-subtle/30 border-subtle'
                }`}
              >
                <Text variant="bodySm" tone={state === 'mine' ? 'onAccent' : open ? 'primary' : 'muted'} className="font-medium">
                  {slot.time}
                </Text>
                <Text variant="caption" tone={state === 'mine' ? 'onAccent' : 'muted'}>
                  {t(`groups.cosateca.reserva.state.${past && state === 'free' ? 'past' : state}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </VStack>
  );
}

/**
 * Its manager closes days (a fiesta, a flooded court) and opens them again.
 * Closing one cancels its bookings and tells their bookers — the callable does
 * both, so the manager is told how many went.
 */
export function ReservaBlackouts({ cosa }: { cosa: Cosa }) {
  const { t } = useT();
  const [range, setRange] = useState<DayRange | null>(null);
  const [saving, setSaving] = useState(false);
  const today = madridDayKey(new Date());
  const days = (cosa.reserva?.blackouts ?? []).filter((d) => d >= today);

  const save = (next: string[]) => {
    setSaving(true);
    setReservaBlackouts(cosa.id, next)
      .then(({ cancelled }) => {
        setRange(null);
        if (cancelled > 0) showAlert(t('groups.cosateca.reserva.cancelledN', { count: cancelled }));
      })
      .catch((err: unknown) => showAlert(cosatecaErrorMessage(t, err)))
      .finally(() => setSaving(false));
  };

  const close = () => {
    if (!range) return;
    const added: string[] = [];
    for (let d = range.startDay; d <= range.endDay; d = addDays(d, 1)) added.push(d);
    showConfirm(
      t('groups.cosateca.reserva.closeTitle'),
      t('groups.cosateca.reserva.blackoutsHint'),
      () => save([...new Set([...days, ...added])].sort()),
      { confirmText: t('groups.cosateca.reserva.close'), cancelText: t('common.cancel') },
    );
  };

  return (
    <VStack gap={2}>
      <DetailSectionHeading>{t('groups.cosateca.reserva.blackouts')}</DetailSectionHeading>
      {days.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          {t('groups.cosateca.reserva.noBlackouts')}
        </Text>
      ) : (
        days.map((d) => (
          <HStack key={d} gap={2} className="items-center justify-between">
            <Text>{formatDayKey(d, 'long')}</Text>
            <Button variant="ghost" loading={saving} onPress={() => save(days.filter((x) => x !== d))} testID={`reserva-reopen-${d}`}>
              {t('groups.cosateca.reserva.reopen')}
            </Button>
          </HStack>
        ))
      )}
      <DateRangeField
        label={t('groups.cosateca.reserva.closeDays')}
        value={range}
        onChange={setRange}
        minDay={today}
        placeholder={t('groups.cosateca.reserva.closeDaysPlaceholder')}
        testID="reserva-blackout-range"
      />
      {range ? (
        <Button variant="secondary" loading={saving} onPress={close} testID="reserva-close-days">
          {t('groups.cosateca.reserva.close')}
        </Button>
      ) : null}
    </VStack>
  );
}

/** My upcoming bookings of this cosa, each opening its booking. */
export function MyReservas({ bookings, onOpen }: { bookings: CosaRequest[]; onOpen: (requestId: string) => void }) {
  const { t } = useT();
  if (bookings.length === 0) return null;
  return (
    <VStack gap={2}>
      <DetailSectionHeading>{t('groups.cosateca.reserva.myBookings')}</DetailSectionHeading>
      {bookings.map((b) => (
        <Pressable
          key={b.id}
          testID={`reserva-mine-${b.id}`}
          accessibilityRole="button"
          onPress={() => onOpen(b.id)}
          className="bg-surface border border-subtle rounded-xl p-3"
        >
          <HStack gap={2} className="items-center justify-between">
            <Text className="font-medium">{reservaSlotLabel(b)}</Text>
            <Text variant="caption" tone="muted">
              {t(`groups.cosateca.status.${b.status}`)}
            </Text>
          </HStack>
        </Pressable>
      ))}
    </VStack>
  );
}

/** A reserva's config in the offer form: hours per weekday, slot length, limits and approval. */
export function ReservaConfigFields({
  draft,
  onChange,
  error,
}: {
  draft: ReservaDraft;
  onChange: (next: ReservaDraft) => void;
  error?: string;
}) {
  const { t } = useT();
  const setDay = (d: (typeof RESERVA_WEEKDAYS)[number], patch: Partial<ReservaDraft['hours'][typeof d]>) =>
    onChange({ ...draft, hours: { ...draft.hours, [d]: { ...draft.hours[d], ...patch } } });
  return (
    <VStack gap={3}>
      <FieldLabel>{t('groups.cosateca.reserva.hours')}</FieldLabel>
      {RESERVA_WEEKDAYS.map((d) => {
        const h = draft.hours[d];
        return (
          <VStack key={d} gap={1}>
            <HStack gap={2} className="items-center justify-between">
              <Text className="font-medium">{t(`groups.cosateca.reserva.weekdays.${d}`)}</Text>
              <Toggle
                value={h.open}
                onValueChange={(open) => setDay(d, { open })}
                label={t(h.open ? 'groups.cosateca.reserva.open' : 'groups.cosateca.reserva.closed')}
                testID={`reserva-open-${d}`}
              />
            </HStack>
            {h.open ? (
              <HStack gap={2}>
                <View className="flex-1">
                  <Input
                    label={t('groups.cosateca.reserva.opensAt')}
                    value={h.opensAt}
                    onChangeText={(opensAt) => setDay(d, { opensAt })}
                    testID={`reserva-opens-${d}`}
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label={t('groups.cosateca.reserva.closesAt')}
                    value={h.closesAt}
                    onChangeText={(closesAt) => setDay(d, { closesAt })}
                    testID={`reserva-closes-${d}`}
                  />
                </View>
              </HStack>
            ) : null}
          </VStack>
        );
      })}
      <Input
        label={t('groups.cosateca.reserva.slotMinutes')}
        value={draft.slotMinutes}
        onChangeText={(slotMinutes) => onChange({ ...draft, slotMinutes })}
        keyboardType="number-pad"
        testID="reserva-slot-minutes"
      />
      <Input
        label={t('groups.cosateca.reserva.maxActive')}
        value={draft.maxActiveReservations}
        onChangeText={(maxActiveReservations) => onChange({ ...draft, maxActiveReservations })}
        keyboardType="number-pad"
        testID="reserva-max-active"
      />
      <Input
        label={t('groups.cosateca.reserva.horizon')}
        value={draft.bookingHorizonDays}
        onChangeText={(bookingHorizonDays) => onChange({ ...draft, bookingHorizonDays })}
        keyboardType="number-pad"
        testID="reserva-horizon"
      />
      <Toggle
        value={draft.requiresApproval}
        onValueChange={(requiresApproval) => onChange({ ...draft, requiresApproval })}
        label={t('groups.cosateca.reserva.requiresApproval')}
        testID="reserva-requires-approval"
      />
      {error ? (
        <Text variant="bodySm" tone="danger" testID="reserva-config-error">
          {error}
        </Text>
      ) : null}
    </VStack>
  );
}
