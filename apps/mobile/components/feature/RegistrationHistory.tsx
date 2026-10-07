import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { Text } from '../primitives/Text';
import { Pressable } from '../primitives/Pressable';
import { DetailSectionHeading } from './DetailSectionHeading';
import {
  getRegistrationEvents,
  type RegistrationEventWithId,
} from '@cultuvilla/shared/services/registrationService';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import type { RegistrationEventAction } from '@cultuvilla/shared/models/event/RegistrationEventDataModel';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { formatDate } from '@cultuvilla/shared/utils/format';
import { useT } from '../../lib/i18n';

type Icon = keyof typeof Ionicons.glyphMap;

const ICONS: Record<RegistrationEventAction, Icon> = {
  signed_up: 'person-add-outline',
  walk_in_added: 'walk-outline',
  seat_claimed: 'ticket-outline',
  waitlist_promoted: 'arrow-up-circle-outline',
  cancelled_self: 'exit-outline',
  removed_by_organizer: 'person-remove-outline',
  group_cancelled: 'people-outline',
  seat_released: 'refresh-outline',
  signups_disabled: 'lock-closed-outline',
};

/** The actions that took somebody off the roster — tinted so a scan finds them. */
const DEPARTURES: ReadonlySet<RegistrationEventAction> = new Set([
  'cancelled_self',
  'removed_by_organizer',
  'group_cancelled',
  'signups_disabled',
]);

/**
 * One entry as a sentence. Exported for its own test: the phrasing is the whole
 * feature — an organizer reading this needs "who left" and "who removed them"
 * to be unambiguous, and the two differ only by which action was recorded.
 */
export function describeRegistrationEvent(
  entry: Pick<RegistrationEventWithId, 'action' | 'name' | 'actorUserId'>,
  actorName: string | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  return t(`event.history.${entry.action}`, {
    name: entry.name,
    // An empty actor is the system acting (the waitlist queue, the sign-ups
    // sweep); an unresolved one is a deleted account. Neither may render as a
    // raw uid.
    actor: actorName ?? t('event.history.unknownActor'),
  });
}

/**
 * The event's roster history, collapsed by default, below the roster itself.
 *
 * It exists because cancellation is a hard delete: once someone cancels or an
 * organizer removes them, the roster shows no trace that they were ever there.
 * `firestore.rules` limits the underlying collection to the organizer set,
 * village admins and app admins, so this must only ever be rendered for them —
 * a villager rendering it would just be denied.
 */
export function RegistrationHistory({ eventId }: { eventId: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RegistrationEventWithId[] | null>(null);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await getRegistrationEvents(eventId);
      setEntries(rows);
      // Only the handful of distinct people who acted, not one read per row —
      // an organizer removing twenty no-shows is one lookup.
      const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean))];
      const profiles = await Promise.all(actorIds.map((id) => getPublicProfile(id)));
      setActorNames(
        Object.fromEntries(
          profiles.flatMap((p, i) => (p ? [[actorIds[i], p.displayName]] : [])),
        ),
      );
    } catch {
      setFailed(true);
    }
  }, [eventId]);

  // Deferred until the section is opened: the log is a lookup tool, not
  // something every organizer needs fetched on every event open.
  useEffect(() => {
    if (open && entries === null && !failed) void load();
  }, [open, entries, failed, load]);

  return (
    <VStack gap={2}>
      <DetailSectionHeading
        action={
          <Pressable onPress={() => setOpen((v) => !v)}>
            <Text tone="muted">{t(open ? 'event.history.hide' : 'event.history.show')}</Text>
          </Pressable>
        }
      >
        {t('event.history.title')}
      </DetailSectionHeading>
      {open ? (
        failed ? (
          <Text tone="muted">{t('event.history.error')}</Text>
        ) : entries === null ? null : entries.length === 0 ? (
          <Text tone="muted">{t('event.history.empty')}</Text>
        ) : (
          <VStack gap={3}>
            {entries.map((entry) => {
              const departure = DEPARTURES.has(entry.action);
              return (
                <HStack key={entry.id} gap={2} className="items-start">
                  <Ionicons
                    name={ICONS[entry.action]}
                    size={iconSizes.sm}
                    color={departure ? colors.light.fg.danger : colors.light.fg.muted}
                  />
                  <VStack gap={0} className="flex-1">
                    <Text>
                      {describeRegistrationEvent(
                        entry,
                        actorNames[entry.actorUserId] ?? null,
                        t,
                      )}
                    </Text>
                    <Text tone="muted" variant="caption">
                      {formatDate(entry.at)}
                      {entry.status === 'waitlisted'
                        ? ` · ${t('event.history.wasWaitlisted')}`
                        : ''}
                    </Text>
                  </VStack>
                </HStack>
              );
            })}
          </VStack>
        )
      ) : null}
    </VStack>
  );
}
