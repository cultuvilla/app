import { useState } from 'react';
import { ScrollView } from 'react-native';
import {
  newFestivalPosterId,
  createFestivalPoster,
} from '@cultuvilla/shared/services/festivalPosterService';
import {
  uploadFestivalPosterImage,
} from '@cultuvilla/shared/services/imageService';
import { VStack, Input, FieldLabel, DateField } from '../../primitives';
import { MultiImagePickerRow } from '../MultiImagePickerRow';
import { Stepper, type StepConfig } from '../Stepper';
import { pickImageAsBlob } from '../../../lib/images';
import { useT } from '../../../lib/i18n';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { sanitizeYear, datesToPayload } from './festivalPosterForm';
import { OrganizerPicker } from '../OrganizerPicker';

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
 * "Añadir cartel" form — year, optional title, optional start/end dates and the
 * poster image. Any member creates directly and the poster is visible
 * immediately (optimistic); admins hide bad content afterwards from the poster's
 * edit screen. Editing/deleting lives on the poster's own edit screen, not here.
 */
export function FestivalPostersManager({
  villageId,
  onCreated,
}: {
  villageId: string;
  onCreated?: () => void;
}) {
  const { t } = useT();
  const { uid } = useEntityCapabilities(villageId);

  // Mint the id up front so each picked image can upload before the doc write.
  const [posterId] = useState(newFestivalPosterId);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [addingImage, setAddingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contributorUserIds, setContributorUserIds] = useState<string[]>([]);
  const [contributorOrgIds, setContributorOrgIds] = useState<string[]>([]);

  function handleContributorUsers(ids: string[]) {
    setContributorUserIds(ids);
  }

  async function addImage() {
    if (!villageId) return;
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
    const y = parseInt(year, 10);
    if (!villageId || !uid || !Number.isInteger(y) || images.length === 0) return;
    setSaving(true);
    try {
      const payload = {
        municipalityId: villageId,
        proposedBy: uid,
        contributorUserIds: contributorUserIds.includes(uid) ? contributorUserIds : [uid, ...contributorUserIds],
        contributorOrgIds,
        year: y,
        title: title.trim() || null,
        images,
        ...datesToPayload(startsAt, endsAt),
        createdAt: new Date(),
      };
      await createFestivalPoster(payload, posterId);
      setYear(String(new Date().getFullYear()));
      setTitle('');
      setStartsAt(null);
      setEndsAt(null);
      setImages([]);
      setContributorUserIds([]);
      setContributorOrgIds([]);
      onCreated?.();
    } finally {
      setSaving(false);
    }
  }

  const y = parseInt(year, 10);
  const steps: StepConfig[] = [
    {
      key: 'basics',
      title: t('village.festivalPosters.stepBasics'),
      icon: 'create-outline',
      validate: () => (Number.isInteger(y) && images.length > 0 ? [] : ['basics']),
      render: () =>
        stepBody(
          <>
            <VStack gap={1} align="start">
              <FieldLabel>{t('village.festivalPosters.form.image')}</FieldLabel>
              <MultiImagePickerRow
                uris={images}
                onAddPress={addImage}
                onRemove={removeImage}
                adding={addingImage}
                addLabel={t('village.festivalPosters.form.addImage')}
                removeLabel={t('village.festivalPosters.form.removeImage')}
                testID="poster-images"
              />
            </VStack>
            <Input
              testID="poster-year-input"
              value={year}
              onChangeText={(txt) => setYear(sanitizeYear(txt))}
              label={t('village.festivalPosters.form.year')}
              keyboardType="number-pad"
            />
            <Input
              testID="poster-title-input"
              value={title}
              onChangeText={setTitle}
              label={t('village.festivalPosters.form.title')}
              placeholder={t('village.festivalPosters.form.titlePlaceholder')}
            />
          </>,
        ),
    },
    {
      key: 'dates',
      title: t('village.festivalPosters.stepDates'),
      icon: 'calendar-outline',
      render: () =>
        stepBody(
          <>
            <DateField
              testID="poster-start-date"
              label={t('village.festivalPosters.form.startDate')}
              value={startsAt}
              onChange={setStartsAt}
            />
            <DateField
              testID="poster-end-date"
              label={t('village.festivalPosters.form.endDate')}
              value={endsAt}
              onChange={setEndsAt}
            />
          </>,
        ),
    },
    {
      key: 'attribution',
      title: t('village.festivalPosters.stepAttribution'),
      icon: 'people-outline',
      render: () =>
        stepBody(
          uid ? (
            <OrganizerPicker
              municipalityId={villageId}
              selectedUserIds={contributorUserIds.includes(uid) ? contributorUserIds : [uid, ...contributorUserIds]}
              selectedOrgIds={contributorOrgIds}
              lockedUserId={uid}
              onChangeUsers={handleContributorUsers}
              onChangeOrgs={setContributorOrgIds}
              peopleLabel={t('village.contributors.peopleLabel')}
              addPersonLabel={t('village.contributors.addPerson')}
              selectPeopleTitle={t('village.contributors.selectPeople')}
            />
          ) : null,
        ),
    },
  ];

  return (
    <Stepper
      steps={steps}
      onComplete={() => void submit()}
      submitLabel={t('village.festivalPosters.add')}
      loading={saving}
      primaryTestID="poster-submit"
    />
  );
}
