import { entityRefHref, villageHref } from '../../../../lib/navigation/routes';
import { parseEntityRef } from '@cultuvilla/shared/utils';
import { useVillageRoute, withVillageRoute } from '../../../../lib/navigation/VillageRouteGate';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useLocalSearchParams, Redirect, router } from 'expo-router';
import { Screen } from '../../../../components/primitives/Screen';
import { Text } from '../../../../components/primitives/Text';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { ProposableForm } from '../../../../components/feature/proposable/ProposableForm';
import { LocationField } from '../../../../components/feature/LocationField';
import { OrganizerPicker } from '../../../../components/feature/OrganizerPicker';
import { DeleteHeaderButton } from '../../../../components/feature/DeleteHeaderButton';
import { useT } from '../../../../lib/i18n';
import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';
import { pickImageAsBlob } from '../../../../lib/images';
import { getPlace, updatePlace, deletePlace } from '@cultuvilla/shared/services/municipalityService';
import { hideContent } from '@cultuvilla/shared/services/moderationService';
import { uploadPlaceImage } from '@cultuvilla/shared/services/imageService';
import { PLACE_KINDS, type PlaceKind } from '@cultuvilla/shared/models/municipality';
import type { VisibilityStatus } from '@cultuvilla/shared/models';
import type { LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';

function PlaceEditScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { lugar: lugarRef } = useLocalSearchParams<{ lugar: string }>();
  const placeId = parseEntityRef(lugarRef ?? '') ?? '';
  const { t } = useT();
  const { canManage, canEdit, canDelete, uid, loading: capLoading } = useEntityCapabilities(villageId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<PlaceKind>('cemetery');
  const [images, setImages] = useState<string[]>([]);
  const [addingImage, setAddingImage] = useState(false);
  const [coordinates, setCoordinates] = useState<LatLng | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contributorUserIds, setContributorUserIds] = useState<string[]>([]);
  const [contributorOrgIds, setContributorOrgIds] = useState<string[]>([]);
  const [proposedBy, setProposedBy] = useState<string | null>(null);
  const [status, setStatus] = useState<VisibilityStatus>('active');

  const kindLabel = (k: PlaceKind) => t(`village.admin.places.kind.${k}` as never);

  useEffect(() => {
    if (!villageId || !placeId) return;
    void (async () => {
      const p = await getPlace(villageId, placeId);
      if (p) {
        setName(p.name);
        setDescription(p.description ?? '');
        setKind(p.kind);
        setCoordinates(p.coordinates);
        setLocationLabel(p.locationLabel ?? '');
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
  }, [villageId, placeId]);

  // The creator check needs the doc, so the guard waits for the fetch — an
  // admin and a creator are both allowed in, everyone else bounces back.
  if (capLoading || !loaded) {
    return (
      <Screen padded={false} topInset={false}>
        <ScreenHeader accent title={t('village.admin.places.editTitle')} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>
      </Screen>
    );
  }
  if (!notFound && !canEdit(proposedBy)) {
    return <Redirect href={entityRefHref('place', villageSlug, lugarRef ?? '')} />;
  }

  // An admin *moderates* (audited soft-hide via the callable); a creator
  // *withdraws* their own still-active proposal outright, which the Firestore
  // rules permit directly.
  function removePlace() {
    if (!villageId || !placeId) return;
    const done = () => router.replace(villageHref(villageSlug));
    return canManage
      ? hideContent({ collection: 'places', docId: placeId, municipalityId: villageId }).then(done)
      : deletePlace(villageId, placeId).then(done);
  }

  // Images persist immediately (unlike the create flow, the doc already
  // exists here), so add/remove writes the doc on each action rather than
  // batching to submit.
  async function addImage() {
    if (!villageId || !placeId) return;
    const picked = await pickImageAsBlob();
    if (!picked) return;
    setAddingImage(true);
    try {
      const url = await uploadPlaceImage(villageId, placeId, picked);
      const next = [...images, url];
      await updatePlace(villageId, placeId, { images: next });
      setImages(next);
    } finally {
      setAddingImage(false);
    }
  }

  async function removeImage(index: number) {
    if (!villageId || !placeId) return;
    const next = images.filter((_, i) => i !== index);
    await updatePlace(villageId, placeId, { images: next });
    setImages(next);
  }

  async function submit() {
    if (!villageId || !placeId || !name.trim()) return;
    setSaving(true);
    try {
      await updatePlace(villageId, placeId, {
        name: name.trim(), kind, description: description.trim() || null,
        coordinates,
        // Clearing the pin clears its name with it — see buildPlaceData.
        locationLabel: coordinates ? locationLabel.trim() || null : null,
        contributorUserIds, contributorOrgIds,
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
        title={t('village.admin.places.editTitle')}
        rightSlot={
          canDelete(proposedBy, status) ? (
            <DeleteHeaderButton
              onAccent
              onConfirm={removePlace}
              accessibilityLabel={t('common.delete')}
              confirmTitle={t('common.deleteConfirmTitle')}
              confirmMessage={t('common.deleteConfirmMessage')}
              confirmLabel={t('common.delete')}
              cancelLabel={t('common.cancel')}
              deletingLabel={t('common.deleting.place')}
              testID="place-delete"
            />
          ) : undefined
        }
      />
      {notFound ? (
        <View className="flex-1 items-center justify-center"><Text>{t('common.notFound')}</Text></View>
      ) : (
        <ScrollView contentContainerClassName="p-4">
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
            nameTestID="place-edit-name-input"
            imagesTestID="place-edit-images"
            descriptionTestID="place-edit-description"
            typeTestIDPrefix="place-edit-type"
            description={description}
            onChangeDescription={setDescription}
            descriptionLabel={t('village.admin.places.description')}
            typeLabel={t('village.admin.places.kindLabel')}
            typeOptions={PLACE_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
            typeValue={kind}
            onChangeType={(v) => setKind(v as PlaceKind)}
            footer={
              <>
                <LocationField
                  testID="place-edit-location"
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
              </>
            }
            submitLabel={t('common.save')}
            submitTestID="place-edit-submit"
            onSubmit={submit}
            saving={saving}
            disabled={!name.trim()}
          />
        </ScrollView>
      )}
    </Screen>
  );
}

export default withVillageRoute(PlaceEditScreen);
