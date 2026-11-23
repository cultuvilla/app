import { Image, ScrollView, View } from 'react-native';
import { HStack, ScreenTitle, Text, VStack } from '../../primitives';
import { ProfileSectionHeader } from './ProfileSectionHeader';
import { PersonFacts, type PersonFact } from './PersonFacts';
import { useT } from '../../../lib/i18n';
import { usePersonPlaces } from '../../../lib/usePersonPlaces';
import { buildDisplayName } from '@cultuvilla/shared/models/person';
import { isCatalogOccupation, occupationI18nKey } from '@cultuvilla/shared/models/occupation';
import type { PersonData } from '@cultuvilla/shared/models/person';
import { RemoteImage } from '../../primitives/RemoteImage';
import { useScrollEnabledWhileZooming } from '../../primitives/ImageZoomOverlay';
import { ZoomableImage } from '../../primitives/ZoomableImage';

export interface PersonProfileViewProps {
  person: PersonData & { id: string };
}

/**
 * Square, matching what is actually stored: persona photos are picked through
 * the 1:1 cropper (`pickImageAsBlob({ square: true })`), so any other ratio
 * here re-crops an already-cropped face — a 3:4 box took a quarter off the
 * height, centred, cutting the top of the head and the chin.
 */
const PHOTO_ASPECT_RATIO = 1;

/**
 * Read-only display of a single person (a dependent persona with no user
 * account). Reached from the village tab — the roster, a barrio, an event's
 * attendee list — including by the persona's own creator, so it deliberately
 * renders no edit affordances. Account-holder vecinos route to the richer
 * `/usuario/[uid]` profile instead.
 *
 * Laid out like an encyclopedia entry: the name owns the top of the screen (the
 * navigation bar deliberately carries no title, so the name isn't stated
 * twice), then a portrait photo on the left with the facts beside it, then the
 * biography.
 */
export function PersonProfileView({ person }: PersonProfileViewProps) {
  const { t } = useT();
  const scrollEnabled = useScrollEnabledWhileZooming();
  const { birthPlace, villages, barrios } = usePersonPlaces(person);
  const occupations = person.occupations ?? [];
  const displayName = buildDisplayName(person);

  const facts: PersonFact[] = [];
  if (birthPlace) facts.push({ label: t('profile.personInfo.birthPlace'), value: birthPlace });
  if (villages.length > 0) {
    facts.push({ label: t('profile.personInfo.village'), value: villages.join(', ') });
  }
  if (barrios.length > 0) {
    facts.push({ label: t('profile.personInfo.barrio'), value: barrios.join(', ') });
  }
  if (occupations.length > 0) {
    facts.push({
      label: t('profile.personInfo.occupations'),
      value: occupations
        .map((o) => (isCatalogOccupation(o) ? t(occupationI18nKey(o)) : o))
        .join(', '),
    });
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }} scrollEnabled={scrollEnabled}>
      <View className="px-4 pt-4">
        <ScreenTitle>{displayName}</ScreenTitle>
      </View>

      <HStack gap={4} align="start" className="px-4 pt-4">
        <ZoomableImage
          uri={person.photoURL ?? null}
          accessibilityLabel={displayName}
          testID="person-photo-zoom"
        >
          <View
            testID="person-photo"
            className="w-36 rounded-md overflow-hidden bg-subtle items-center justify-center"
            style={{ aspectRatio: PHOTO_ASPECT_RATIO }}
          >
            {person.photoURL ? (
              <RemoteImage
                uri={person.photoURL}
                variant="card"
                contentFit="cover"
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <Text variant="h1" tone="muted">
                {(displayName || '?').charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
        </ZoomableImage>

        <PersonFacts facts={facts} />
      </HStack>

      {person.biography ? (
        <>
          <ProfileSectionHeader title={t('profile.biography')} />
          <View className="px-4">
            <Text>{person.biography}</Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
