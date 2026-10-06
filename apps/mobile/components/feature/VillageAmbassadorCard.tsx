import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import type { Sex } from '@cultuvilla/shared/models/core/SexModel';
import { Avatar, HStack, Pressable, Text, VStack } from '../primitives';
import { VillageTitleBadge } from './VillageTitleBadge';
import { userHref } from '../../lib/navigation/routes';
import { useT } from '../../lib/i18n';

interface Face {
  name: string;
  photoURL: string | null;
}

/**
 * The pueblo's Embajador, by name and face, on the village home — the title is
 * a public role, and this is where it is worn. Visible to everyone, including
 * the anonymous web reader.
 *
 * The name comes from the public user doc; the photo only when the Embajador's
 * person is public (a private person reads as no photo, not an error).
 */
export function VillageAmbassadorCard({
  organizerId,
  organizerSex,
  viewerUid,
}: {
  organizerId: string;
  organizerSex: Sex | null;
  viewerUid: string | null;
}) {
  const { t } = useT();
  const [face, setFace] = useState<Face | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getPublicProfile(organizerId),
      getPersonByUserId(organizerId, viewerUid).catch(() => null),
    ])
      .then(([user, person]) => {
        if (cancelled || !user?.displayName) return;
        setFace({ name: user.displayName, photoURL: person?.photoURL ?? null });
      })
      .catch(() => {
        // Decoration on the village home: a failed read hides the card.
      });
    return () => {
      cancelled = true;
    };
  }, [organizerId, viewerUid]);

  if (!face) return null;
  const initials = face.name.trim().charAt(0).toUpperCase();
  const sectionKey =
    organizerSex === 'female' ? 'ambassador.sectionTitleFemale' : 'ambassador.sectionTitle';

  return (
    <VStack gap={2} className="px-4 pt-4">
      <Text variant="caption" tone="muted" className="uppercase font-semibold">
        {t(sectionKey)}
      </Text>
      <Pressable
        testID="village-ambassador-card"
        onPress={() => router.push(userHref(organizerId))}
        className="rounded-md border border-subtle bg-surface-elevated p-3"
      >
        <HStack gap={3} className="items-center">
          <Avatar uri={face.photoURL ?? undefined} size={48} initials={initials} ambassador />
          <VStack gap={1} className="flex-1">
            <Text className="font-semibold" numberOfLines={1}>
              {face.name}
            </Text>
            <VillageTitleBadge title="ambassador" sex={organizerSex} />
          </VStack>
        </HStack>
      </Pressable>
    </VStack>
  );
}
