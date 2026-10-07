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
import { DeleteHeaderButton } from '../../../../components/feature/DeleteHeaderButton';
import { useT } from '../../../../lib/i18n';
import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';
import { pickImageAsBlob } from '../../../../lib/images';
import { getBarrio, updateBarrio, deleteBarrio } from '@cultuvilla/shared/services/municipalityService';
import { hideContent } from '@cultuvilla/shared/services/moderationService';
import { uploadBarrioImage } from '@cultuvilla/shared/services/imageService';
import type { VisibilityStatus } from '@cultuvilla/shared/models';

function BarrioEditScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { barrio: barrioRef } = useLocalSearchParams<{ barrio: string }>();
  const barrioId = parseEntityRef(barrioRef ?? '') ?? '';
  const { t } = useT();
  const { canManage, canEdit, canDelete, loading: capLoading } = useEntityCapabilities(villageId);
  const [name, setName] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [addingImage, setAddingImage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proposedBy, setProposedBy] = useState<string | null>(null);
  const [status, setStatus] = useState<VisibilityStatus>('active');

  useEffect(() => {
    if (!villageId || !barrioId) return;
    void (async () => {
      const b = await getBarrio(villageId, barrioId);
      if (b) {
        setName(b.name);
        setImages(b.images);
        setProposedBy(b.proposedBy);
        setStatus(b.status);
      } else {
        setNotFound(true);
      }
      setLoaded(true);
    })();
  }, [villageId, barrioId]);

  // The creator check needs the doc, so the guard waits for the fetch — an
  // admin and a creator are both allowed in, everyone else bounces back.
  if (capLoading || !loaded) {
    return (
      <Screen padded={false} topInset={false}>
        <ScreenHeader accent title={t('village.admin.barrios.editTitle')} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>
      </Screen>
    );
  }
  if (!notFound && !canEdit(proposedBy)) {
    return <Redirect href={entityRefHref('barrio', villageSlug, barrioRef ?? '')} />;
  }

  // An admin *moderates* (audited soft-hide via the callable); a creator
  // *withdraws* their own still-active proposal outright, which the Firestore
  // rules permit directly.
  function removeBarrio() {
    if (!villageId || !barrioId) return;
    const done = () => router.replace(villageHref(villageSlug));
    return canManage
      ? hideContent({ collection: 'barrios', docId: barrioId, municipalityId: villageId }).then(done)
      : deleteBarrio(villageId, barrioId).then(done);
  }

  // Images persist immediately (unlike the create flow, the doc already
  // exists here), so add/remove writes the doc on each action rather than
  // batching to submit.
  async function addImage() {
    if (!villageId || !barrioId) return;
    const picked = await pickImageAsBlob();
    if (!picked) return;
    setAddingImage(true);
    try {
      const url = await uploadBarrioImage(villageId, barrioId, picked);
      const next = [...images, url];
      await updateBarrio(villageId, barrioId, { images: next });
      setImages(next);
    } finally {
      setAddingImage(false);
    }
  }

  async function removeImage(index: number) {
    if (!villageId || !barrioId) return;
    const next = images.filter((_, i) => i !== index);
    await updateBarrio(villageId, barrioId, { images: next });
    setImages(next);
  }

  async function submit() {
    if (!villageId || !barrioId || !name.trim()) return;
    setSaving(true);
    try {
      await updateBarrio(villageId, barrioId, { name: name.trim() });
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen padded={false} topInset={false}>
      <ScreenHeader
        accent
        title={t('village.admin.barrios.editTitle')}
        rightSlot={
          canDelete(proposedBy, status) ? (
            <DeleteHeaderButton
              testID="barrio-delete"
              onAccent
              onConfirm={removeBarrio}
              accessibilityLabel={t('common.delete')}
              confirmTitle={t('common.deleteConfirmTitle')}
              confirmMessage={t('common.deleteConfirmMessage')}
              confirmLabel={t('common.delete')}
              cancelLabel={t('common.cancel')}
              deletingLabel={t('common.deleting.barrio')}
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
              add: t('village.admin.barrios.addImage'),
              remove: t('village.admin.barrios.removeImage'),
            }}
            name={name}
            onChangeName={setName}
            nameLabel={t('village.admin.barrios.name')}
            nameTestID="barrio-edit-name-input"
            imagesTestID="barrio-edit-images"
            submitLabel={t('common.save')}
            submitTestID="barrio-edit-submit"
            onSubmit={submit}
            saving={saving}
            disabled={!name.trim()}
          />
        </ScrollView>
      )}
    </Screen>
  );
}

export default withVillageRoute(BarrioEditScreen);
