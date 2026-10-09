import { routes } from '../../lib/navigation/routes';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Text } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { DeleteHeaderButton } from '../../components/feature/DeleteHeaderButton';
import { PersonForm } from '../../components/feature/PersonForm';
import type { PersonFormPhoto, PersonFormValues } from '../../components/feature/PersonForm';
import { PersonProfileView } from '../../components/feature/profile/PersonProfileView';
import { MembershipVillageEditor } from '../../components/feature/MembershipVillageEditor';
import { ResidenceLinksEditor } from '../../components/feature/ResidenceLinksEditor';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import {
  createPerson,
  getPerson,
  updatePerson,
  deletePerson,
} from '@cultuvilla/shared/services/personService';
import { uploadUserPhoto } from '@cultuvilla/shared/services/imageService';
import { recordOccupation } from '@cultuvilla/shared/services/occupationService';
import { isCatalogOccupation } from '@cultuvilla/shared/models/occupation';
import type { MunicipalityLink, PartialDate, PersonData } from '@cultuvilla/shared/models/person';

type PersonDoc = PersonData & { id: string };

function toPartialDate(d: Date | null): PartialDate | null {
  if (!d) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function partialDateToDate(d: PartialDate | null): Date | null {
  if (!d || d.year === null) return null;
  return new Date(d.year, (d.month ?? 1) - 1, d.day ?? 1);
}

export default function PersonDetailScreen() {
  // `edit=1` is the ONLY way into the form for an existing persona, and only
  // the profile screen's persona list passes it. Everywhere else a persona is
  // reachable — the village roster, a barrio, an event's attendees — the tap is
  // "who is this?", not "let me edit them", even when it's a persona you manage.
  const { personId, edit } = useLocalSearchParams<{ personId: string; edit?: string }>();
  const editRequested = edit === '1';
  const { user, profile } = useAuth();
  const { t } = useT();
  const isNew = personId === 'new';

  const [person, setPerson] = useState<PersonDoc | null>(null);
  const [loading, setLoading] = useState(!isNew);
  // The persons read rule denies private personas to everyone but their
  // creator, so a rejected read is a real state to render — not an error.
  const [denied, setDenied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether this is the caller editing their own persona. Own personas are
  // account-holders, so residence (village + barrio) is membership-driven and
  // edited via MembershipVillageEditor (immediate per-row writes); the trigger
  // owns their municipalityLinks. Everyone else (new + non-account persons) gets
  // the direct multi-village links editor.
  const isOwnPersona = !isNew && person?.userId != null && person.userId === user?.uid;

  // A dependent persona the caller created (not an account-linked person) can be
  // hard-deleted here — exactly what the persons delete rule allows
  // (createdBy == uid && userId == null). Own account-persona deletion belongs to
  // account deletion, not this screen.
  const canDelete = !isNew && person != null && person.createdBy === user?.uid && person.userId == null;

  // Only the persona's owner may edit: their own account-persona, or a
  // dependent persona they created. Everyone else — village admins included —
  // gets the read-only PersonProfileView. Account-holder vecinos never reach
  // this screen for viewing; they route to the richer /user/[uid] profile.
  const canEdit = isNew || (editRequested && (isOwnPersona || canDelete));

  const removePersona = () => {
    if (!person) return;
    // Replace to the profile (personas live there) rather than router.back():
    // the persona may have been reached by deep link (no history), and its detail
    // no longer exists after deletion — a back would fire the "GO_BACK not
    // handled" navigator warning.
    return deletePerson(person.id).then(() => router.replace(routes.profile));
  };

  // Residence links for the non-account (links-mode) editor. Seeded from the
  // person's existing links, or the caller's active village for a new person.
  const [links, setLinks] = useState<MunicipalityLink[]>(
    profile?.activeMunicipalityId
      ? [{ municipalityId: profile.activeMunicipalityId, barrioId: null }]
      : [],
  );

  useEffect(() => {
    if (isNew || !personId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getPerson(personId)
      .then((p) => {
        if (cancelled) return;
        setPerson(p);
        if (p) setLinks(p.municipalityLinks);
      })
      .catch(() => {
        if (!cancelled) setDenied(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, isNew]);

  async function onSubmit(values: PersonFormValues, photo: PersonFormPhoto | null) {
    if (!user) return;
    if (!values.givenName.trim() || !values.firstSurname.trim()) {
      setError(t('onboarding.completeProfile.requiredFields'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const birthPlaceLink: MunicipalityLink | null = values.birthPlaceMunicipalityId
        ? { municipalityId: values.birthPlaceMunicipalityId, barrioId: null }
        : null;
      // Links-mode persons own municipalityLinks directly (drop unfilled rows).
      // Own personas omit it entirely — the membership trigger is the source of
      // truth and would otherwise be clobbered by a stale form snapshot.
      const cleanedLinks = links.filter((l) => l.municipalityId);

      // Free-text (non-catalog) entries are also tallied for suggestions —
      // fire-and-forget per entry, doesn't block the person save.
      await Promise.all(
        values.occupations.filter((o) => !isCatalogOccupation(o)).map(recordOccupation),
      );

      let pid: string;
      if (isNew) {
        pid = await createPerson({
          givenName: values.givenName.trim(),
          firstSurname: values.firstSurname.trim() || null,
          secondSurname: values.secondSurname.trim() || null,
          nickname: values.nickname.trim() || null,
          sex: values.sex,
          birthday: toPartialDate(values.birthday),
          birthPlace: birthPlaceLink,
          municipalityLinks: cleanedLinks,
          biography: values.biography.trim() || null,
          occupations: values.occupations,
          isPublic: values.isPublic,
          createdBy: user.uid,
        });
      } else {
        if (!person) return;
        pid = person.id;
        await updatePerson(pid, {
          givenName: values.givenName.trim(),
          firstSurname: values.firstSurname.trim() || null,
          secondSurname: values.secondSurname.trim() || null,
          nickname: values.nickname.trim() || null,
          sex: values.sex,
          birthday: toPartialDate(values.birthday),
          birthPlace: birthPlaceLink,
          biography: values.biography.trim() || null,
          occupations: values.occupations,
          isPublic: values.isPublic,
          // Own persona: leave municipalityLinks to the membership trigger.
          ...(isOwnPersona ? {} : { municipalityLinks: cleanedLinks }),
        });
      }

      if (photo) {
        // Always upload to the user-scoped path (rule: auth.uid == userId).
        // The person-scoped path needs a cross-service firestore.get the live
        // project can't resolve, so it 403s when editing an existing person.
        const url = await uploadUserPhoto(user.uid, {
          blob: photo.blob,
          filename: `avatar-${Date.now()}.jpg`,
          contentType: photo.blob.type || 'image/jpeg',
        });
        await updatePerson(pid, { photoURL: url });
      }

      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setSaving(false);
    }
  }

  const initial = person
    ? {
        givenName: person.givenName,
        firstSurname: person.firstSurname ?? '',
        secondSurname: person.secondSurname ?? '',
        nickname: person.nickname ?? '',
        sex: person.sex,
        birthday: partialDateToDate(person.birthday),
        birthPlaceMunicipalityId: person.birthPlace?.municipalityId ?? null,
        biography: person.biography ?? '',
        occupations: person.occupations ?? [],
        isPublic: person.isPublic,
        photoURL: person.photoURL,
      }
    : undefined;

  return (
    // bottomInset={false}: the PersonForm Stepper's bottom nav bar applies the inset.
    <Screen padded={false} bottomInset={false} topInset={false}>
      <ScreenHeader
        accent
        // View mode puts the name at the top of the screen itself, so the bar
        // stays empty rather than stating it twice.
        title={canEdit ? t('profile.personDetailTitle') : ''}
        rightSlot={
          canDelete && canEdit ? (
            <DeleteHeaderButton
              testID="persona-delete"
              onAccent
              onConfirm={removePersona}
              accessibilityLabel={t('common.delete')}
              confirmTitle={t('common.deleteConfirmTitle')}
              confirmMessage={t('common.deleteConfirmMessage')}
              confirmLabel={t('common.delete')}
              cancelLabel={t('common.cancel')}
              deletingLabel={t('common.deleting.person')}
            />
          ) : undefined
        }
      />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : denied ? (
        <View className="flex-1 items-center justify-center p-4">
          <Text variant="h3" className="text-center">
            {t('profile.personPrivate')}
          </Text>
          <Text tone="muted" className="text-center mt-2">
            {t('profile.personPrivateBody')}
          </Text>
        </View>
      ) : !isNew && !person ? (
        <View className="flex-1 items-center justify-center p-4">
          <Text tone="muted">404</Text>
        </View>
      ) : !canEdit && person ? (
        <PersonProfileView person={person} />
      ) : (
        <PersonForm
          initial={initial}
          submitLabel={t('common.save')}
          loading={saving}
          error={error}
          editing={!isNew}
          requireFirstSurname
          selfProfile={isOwnPersona}
          renderResidence={() =>
            isOwnPersona && user ? (
              <MembershipVillageEditor userId={user.uid} />
            ) : (
              <ResidenceLinksEditor value={links} onChange={setLinks} />
            )
          }
          onSubmit={onSubmit}
        />
      )}
    </Screen>
  );
}
