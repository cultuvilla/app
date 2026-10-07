import { useState } from 'react';
import {
  createBarrio, newBarrioId,
} from '@cultuvilla/shared/services/municipalityService';
import { uploadBarrioImage } from '@cultuvilla/shared/services/imageService';
import { VStack } from '../../primitives';
import { pickImageAsBlob } from '../../../lib/images';
import { useT } from '../../../lib/i18n';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { ProposableForm } from './ProposableForm';

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
  const { uid } = useEntityCapabilities(villageId);

  // Mint the id up front so each picked image can upload before the doc write.
  const [barrioId] = useState(() => newBarrioId(villageId));
  const [name, setName] = useState('');
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
      }, barrioId);
      setName('');
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
