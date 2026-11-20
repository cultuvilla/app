import { useState } from 'react';
import {
  createBarrio, newBarrioId,
} from '@cultuvilla/shared/services/municipalityService';
import { uploadBarrioImage } from '@cultuvilla/shared/services/imageService';
import { BarrioKindSchema, type BarrioKind } from '@cultuvilla/shared/models/municipality';
import { VStack } from '../../primitives';
import { pickImageAsBlob } from '../../../lib/images';
import { useT } from '../../../lib/i18n';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { ProposableForm } from './ProposableForm';
import { useCallableErrorHandler } from '../../../lib/callableError';

/**
 * "Añadir barrio" form. Any member creates directly and the barrio is visible
 * immediately (optimistic); admins hide bad content afterwards from the barrio's
 * edit screen. Calls `onCreated` after submit. Editing/deleting lives on the
 * barrio's own edit screen, not here.
 */
export function BarriosManager({
  villageId,
  onCreated,
}: {
  villageId: string;
  onCreated?: () => void;
}) {
  const { t } = useT();
  const showCallableError = useCallableErrorHandler();
  const { uid, canManage } = useEntityCapabilities(villageId);

  // Mint the id up front so each picked image can upload before the doc write.
  const [barrioId] = useState(() => newBarrioId(villageId));
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BarrioKind>('barrio');
  const [images, setImages] = useState<string[]>([]);
  const [addingImage, setAddingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  async function addImage() {
    if (!villageId) return;
    const picked = await pickImageAsBlob();
    if (!picked) return;
    setAddingImage(true);
    try {
      const url = await uploadBarrioImage(villageId, barrioId, picked);
      setImages((prev) => [...prev, url]);
    } catch (e) {
      showCallableError(e, { operation: 'barrio:uploadImage' });
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
      await createBarrio(villageId, {
        name: name.trim(), municipalityId: villageId, proposedBy: uid, images,
        // Only admins choose a kind: the rules let a member create nothing but
        // a 'barrio' (the settlement kinds are seeded from OSM), and admins
        // curate what the seed missed (settlement plan D5).
        ...(canManage ? { kind } : {}),
      }, barrioId);
      setName('');
      setKind('barrio');
      setImages([]);
      onCreated?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <VStack gap={3} className="p-4">
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
        nameTestID="barrio-name-input"
        {...(canManage
          ? {
              typeLabel: t('village.admin.barrios.kindLabel'),
              typeOptions: BarrioKindSchema.options.map((k) => ({
                value: k,
                label: t(`village.admin.barrios.kind.${k}`),
              })),
              typeValue: kind,
              onChangeType: (v: string) => setKind(v as BarrioKind),
              typeTestIDPrefix: 'barrio-kind',
            }
          : {})}
        imagesTestID="barrio-images"
        submitLabel={t('village.admin.barrios.add')}
        submitTestID="barrio-submit"
        onSubmit={submit}
        saving={saving}
        disabled={!name.trim()}
      />
    </VStack>
  );
}
