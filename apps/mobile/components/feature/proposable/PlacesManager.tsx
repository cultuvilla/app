import { useState } from 'react';
import { ScrollView } from 'react-native';
import {
  createPlace, newPlaceId,
} from '@cultuvilla/shared/services/municipalityService';
import { uploadPlaceImage } from '@cultuvilla/shared/services/imageService';
import { PLACE_KINDS, type PlaceKind } from '@cultuvilla/shared/models/municipality';
import type { LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';
import { Stepper, type StepConfig } from '../Stepper';
import { pickImageAsBlob } from '../../../lib/images';
import { useT } from '../../../lib/i18n';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { ProposableForm } from './ProposableForm';
import { LocationField } from '../LocationField';
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
 * "Añadir lugar" form. Any member creates directly and the place is visible
 * immediately (optimistic); admins hide bad content afterwards from the place's
 * edit screen. Calls `onCreated` after submit. Editing/deleting lives on the
 * place's own edit screen, not here.
 */
export function PlacesManager({
  villageId,
  onCreated,
}: {
  villageId: string;
  onCreated?: () => void;
}) {
  const { t } = useT();
  const { uid } = useEntityCapabilities(villageId);

  // Mint the id up front so each picked image can upload before the doc write.
  const [placeId] = useState(() => newPlaceId(villageId));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<PlaceKind>('cemetery');
  const [images, setImages] = useState<string[]>([]);
  const [addingImage, setAddingImage] = useState(false);
  const [coordinates, setCoordinates] = useState<LatLng | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [contributorUserIds, setContributorUserIds] = useState<string[]>([]);
  const [contributorOrgIds, setContributorOrgIds] = useState<string[]>([]);

  const kindLabel = (k: PlaceKind) => t(`village.admin.places.kind.${k}`);

  async function addImage() {
    if (!villageId) return;
    const picked = await pickImageAsBlob();
    if (!picked) return;
    setAddingImage(true);
    try {
      const url = await uploadPlaceImage(villageId, placeId, picked);
      setImages((prev) => [...prev, url]);
    } finally {
      setAddingImage(false);
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    if (!villageId || !name.trim() || !uid) return;
    setSaving(true);
    try {
      const input = {
        name: name.trim(), kind, description: description.trim(),
        coordinates, locationLabel: locationLabel.trim() || null,
        municipalityId: villageId, proposedBy: uid, images,
        contributorUserIds: contributorUserIds.includes(uid) ? contributorUserIds : [uid, ...contributorUserIds],
        contributorOrgIds,
      };
      await createPlace(villageId, input, placeId);
      setName('');
      setDescription('');
      setKind('cemetery');
      setImages([]);
      setCoordinates(null);
      setLocationLabel('');
      setContributorUserIds([]);
      setContributorOrgIds([]);
      onCreated?.();
    } finally {
      setSaving(false);
    }
  }

  const steps: StepConfig[] = [
    {
      key: 'basics',
      title: t('village.admin.places.stepBasics'),
      icon: 'create-outline',
      validate: () => (name.trim() ? [] : ['name']),
      render: () =>
        stepBody(
          <ProposableForm
            images={images}
            onAddImage={addImage}
            onRemoveImage={removeImage}
            addingImage={addingImage}
            imageLabels={{
              add: t('village.admin.places.addImage'),
              remove: t('village.admin.places.removeImage'),
            }}
            name={name}
            onChangeName={setName}
            nameLabel={t('village.admin.places.name')}
            nameTestID="place-name-input"
            imagesTestID="place-images"
            descriptionTestID="place-description"
            typeTestIDPrefix="place-type"
            description={description}
            onChangeDescription={setDescription}
            descriptionLabel={t('village.admin.places.description')}
            typeLabel={t('village.admin.places.kindLabel')}
            typeOptions={PLACE_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
            typeValue={kind}
            onChangeType={(v) => setKind(v as PlaceKind)}
            footer={
              <LocationField
                testID="place-location"
                label={t('village.admin.places.location')}
                value={coordinates}
                displayName={locationLabel}
                onChange={(c, address) => {
                  setCoordinates(c);
                  setLocationLabel(address);
                }}
                onClear={() => {
                  setCoordinates(null);
                  setLocationLabel('');
                }}
              />
            }
            submitLabel=""
            onSubmit={() => {}}
            saving={false}
            disabled={false}
            hideSubmit
          />,
        ),
    },
    {
      key: 'attribution',
      title: t('village.admin.places.stepAttribution'),
      icon: 'people-outline',
      render: () =>
        stepBody(
          uid ? (
            <OrganizerPicker
              municipalityId={villageId}
              selectedUserIds={contributorUserIds.includes(uid) ? contributorUserIds : [uid, ...contributorUserIds]}
              selectedOrgIds={contributorOrgIds}
              lockedUserId={uid}
              onChangeUsers={setContributorUserIds}
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
      submitLabel={t('village.admin.places.add')}
      loading={saving}
      primaryTestID="place-submit"
    />
  );
}
