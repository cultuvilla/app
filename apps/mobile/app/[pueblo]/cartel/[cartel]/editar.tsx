import { entityRefHref, villageHref } from '../../../../lib/navigation/routes';
import { parseEntityRef } from '@cultuvilla/shared/utils';
import { useVillageRoute, withVillageRoute } from '../../../../lib/navigation/VillageRouteGate';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useLocalSearchParams, Redirect, router } from 'expo-router';
import { Screen } from '../../../../components/primitives/Screen';
import { Text } from '../../../../components/primitives/Text';
import { VStack } from '../../../../components/primitives/VStack';
import { Input } from '../../../../components/primitives/Input';
import { Button } from '../../../../components/primitives/Button';
import { FieldLabel } from '../../../../components/primitives/FieldLabel';
import { DateField } from '../../../../components/primitives/DateField';
import { MultiImagePickerRow } from '../../../../components/feature/MultiImagePickerRow';
import { OrganizerPicker } from '../../../../components/feature/OrganizerPicker';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { DeleteHeaderButton } from '../../../../components/feature/DeleteHeaderButton';
import { sanitizeYear, datesToPayload } from '../../../../components/feature/proposable/festivalPosterForm';
import { useT } from '../../../../lib/i18n';
import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';
import { pickImageAsBlob } from '../../../../lib/images';
import {
  getFestivalPoster,
  updateFestivalPoster,
  deleteFestivalPoster,
} from '@cultuvilla/shared/services/festivalPosterService';
import { hideContent } from '@cultuvilla/shared/services/moderationService';
import {
  uploadFestivalPosterImage,
} from '@cultuvilla/shared/services/imageService';
import type { VisibilityStatus } from '@cultuvilla/shared/models';

function FestivalPosterEditScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { cartel: cartelRef } = useLocalSearchParams<{ cartel: string }>();
  const posterId = parseEntityRef(cartelRef ?? '') ?? '';
  const { t } = useT();
  const { canManage, canEdit, canDelete, uid, loading: capLoading } = useEntityCapabilities(villageId);

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [addingImage, setAddingImage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contributorUserIds, setContributorUserIds] = useState<string[]>([]);
  const [contributorOrgIds, setContributorOrgIds] = useState<string[]>([]);
  const [proposedBy, setProposedBy] = useState<string | null>(null);
  const [status, setStatus] = useState<VisibilityStatus>('active');

  useEffect(() => {
    if (!posterId) return;
    void (async () => {
      const p = await getFestivalPoster(posterId);
      if (p) {
        setYear(String(p.year));
        setTitle(p.title ?? '');
        setStartsAt(p.startsAt);
        setEndsAt(p.endsAt);
        setImages(p.images);
        setContributorUserIds(p.contributorUserIds);
        setContributorOrgIds(p.contributorOrgIds);
        setProposedBy(p.proposedBy);
        setStatus(p.status);
      } else {
        setNotFound(true);
      }
      setLoaded(true);
    })();
  }, [posterId]);

  // The creator check needs the doc, so the guard waits for the fetch — an
  // admin and a creator are both allowed in, everyone else bounces back.
  if (capLoading || !loaded) {
    return (
      <Screen padded={false} topInset={false}>
        <ScreenHeader accent title={t('village.festivalPosters.editTitle')} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>
      </Screen>
    );
  }
  if (!notFound && !canEdit(proposedBy)) {
    return <Redirect href={entityRefHref('festivalPoster', villageSlug, cartelRef ?? '')} />;
  }

  // An admin *moderates* (audited soft-hide via the callable); a creator
  // *withdraws* their own still-active proposal outright, which the Firestore
  // rules permit directly.
  function removePoster() {
    if (!posterId || !villageId) return;
    const done = () => router.replace(villageHref(villageSlug));
    return canManage
      ? hideContent({ collection: 'festivalPosters', docId: posterId }).then(done)
      : deleteFestivalPoster(posterId).then(done);
  }

  const yearNum = parseInt(year, 10);

  async function addImage() {
    if (!villageId || !posterId) return;
    const picked = await pickImageAsBlob();
    if (!picked) return;
    setAddingImage(true);
    try {
      const url = await uploadFestivalPosterImage(villageId, posterId, picked);
      setImages((prev) => [...prev, url]);
    } finally {
      setAddingImage(false);
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    if (!posterId || !villageId || !Number.isInteger(yearNum) || images.length === 0) return;
    setSaving(true);
    try {
      await updateFestivalPoster(posterId, {
        year: yearNum,
        title: title.trim() || null,
        images,
        contributorUserIds,
        contributorOrgIds,
        ...datesToPayload(startsAt, endsAt),
      });
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen padded={false} topInset={false}>
      <ScreenHeader
        accent
        title={t('village.festivalPosters.editTitle')}
        rightSlot={
          canDelete(proposedBy, status) ? (
            <DeleteHeaderButton
              testID="poster-delete"
              onAccent
              onConfirm={removePoster}
              accessibilityLabel={t('common.delete')}
              confirmTitle={t('common.deleteConfirmTitle')}
              confirmMessage={t('common.deleteConfirmMessage')}
              confirmLabel={t('common.delete')}
              cancelLabel={t('common.cancel')}
              deletingLabel={t('common.deleting.festivalPoster')}
            />
          ) : undefined
        }
      />
      {notFound ? (
        <View className="flex-1 items-center justify-center"><Text>{t('common.notFound')}</Text></View>
      ) : (
        <ScrollView contentContainerClassName="p-4">
          <VStack gap={3} align="start">
            <VStack gap={1} align="start">
              <FieldLabel>{t('village.festivalPosters.form.image')}</FieldLabel>
              <MultiImagePickerRow
                uris={images}
                onAddPress={addImage}
                onRemove={removeImage}
                adding={addingImage}
                addLabel={t('village.festivalPosters.form.addImage')}
                removeLabel={t('village.festivalPosters.form.removeImage')}
                testID="poster-edit-images"
              />
            </VStack>
            <Input
              testID="poster-edit-year-input"
              value={year}
              onChangeText={(txt) => setYear(sanitizeYear(txt))}
              label={t('village.festivalPosters.form.year')}
              keyboardType="number-pad"
            />
            <Input
              testID="poster-edit-title-input"
              value={title}
              onChangeText={setTitle}
              label={t('village.festivalPosters.form.title')}
              placeholder={t('village.festivalPosters.form.titlePlaceholder')}
            />
            <DateField
              label={t('village.festivalPosters.form.startDate')}
              value={startsAt}
              onChange={setStartsAt}
              testID="poster-edit-start-date"
            />
            {uid ? (
              <OrganizerPicker
                municipalityId={villageId}
                selectedUserIds={contributorUserIds}
                selectedOrgIds={contributorOrgIds}
                onChangeUsers={setContributorUserIds}
                onChangeOrgs={setContributorOrgIds}
                peopleLabel={t('village.contributors.peopleLabel')}
                addPersonLabel={t('village.contributors.addPerson')}
                selectPeopleTitle={t('village.contributors.selectPeople')}
              />
            ) : null}
            <DateField
              label={t('village.festivalPosters.form.endDate')}
              value={endsAt}
              onChange={setEndsAt}
              testID="poster-edit-end-date"
            />
            <Button
              testID="poster-edit-submit"
              onPress={submit}
              loading={saving}
              disabled={!Number.isInteger(yearNum) || images.length === 0}
              fullWidth
            >
              {t('common.save')}
            </Button>
          </VStack>
        </ScrollView>
      )}
    </Screen>
  );
}

export default withVillageRoute(FestivalPosterEditScreen);
