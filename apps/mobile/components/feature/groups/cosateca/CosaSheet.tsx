import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import {
  COSA_CATEGORIES,
  effectiveCosaAudience,
  MAX_COSA_CONDITIONS,
  MAX_COSA_DESCRIPTION,
  MAX_COSA_TITLE,
  type CosaCategory,
  type CosaKind,
  type OrganizationData,
} from '@cultuvilla/shared/models/organization';
import { createCosa, deleteCosa, updateCosa, type Cosa } from '@cultuvilla/shared/services/cosatecaService';
import { uploadCosaImage, type UploadableImage } from '@cultuvilla/shared/services/imageService';
import { Button, FieldLabel, ImagePickerField, Input, Text, VStack } from '../../../primitives';
import { FormModal } from '../../../layout/FormModal';
import { SegmentedToggle } from '../../SegmentedToggle';
import { CategoryChips } from './CosaRows';
import { useT } from '../../../../lib/i18n';
import { showAlert, showConfirm } from '../../../../lib/dialogs';
import { pickImageAsBlob } from '../../../../lib/images';

type Owner = 'mine' | 'group';
const KINDS: readonly CosaKind[] = ['prestamo', 'servicio', 'regalo'];

/**
 * Offer something to a group's cosateca, or edit it. An integrante offers their
 * own; an admin may also offer it in the group's name. A photo is uploaded
 * under the cosa's own id, so a new cosa is created first and then given it.
 */
export function CosaSheet({
  visible,
  org,
  uid,
  myName,
  isAdmin,
  cosa,
  canDelete = false,
  onClose,
}: {
  visible: boolean;
  org: Pick<OrganizationData, 'name' | 'municipalityId' | 'cosateca'> & { id: string };
  uid: string;
  /** The viewer's public name, which a cosa they own carries. */
  myName: string;
  isAdmin: boolean;
  /** null = a new cosa. */
  cosa: Cosa | null;
  canDelete?: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const [kind, setKind] = useState<CosaKind>('prestamo');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [conditions, setConditions] = useState('');
  const [category, setCategory] = useState<CosaCategory>('otros');
  const [owner, setOwner] = useState<Owner>('mine');
  const [photo, setPhoto] = useState<UploadableImage | null>(null);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setKind(cosa?.kind ?? 'prestamo');
    setTitle(cosa?.title ?? '');
    setDescription(cosa?.description ?? '');
    setConditions(cosa?.conditions ?? '');
    setCategory(cosa?.category ?? 'otros');
    setOwner('mine');
    setPhoto(null);
    setTitleError(undefined);
  }, [visible, cosa]);

  const fields = (imageURL: string | null) => ({
    kind,
    title: title.trim(),
    description: description.trim() || null,
    category,
    imageURL,
    conditions: conditions.trim() || null,
  });

  const save = async () => {
    if (!title.trim()) {
      setTitleError(t('groups.cosateca.form.nameRequired'));
      return;
    }
    setTitleError(undefined);
    setSaving(true);
    try {
      if (cosa) {
        const imageURL = photo ? await uploadCosaImage(cosa.id, uid, photo) : cosa.imageURL;
        await updateCosa(cosa.id, { ...fields(imageURL), status: cosa.status });
      } else {
        const forGroup = isAdmin && owner === 'group';
        const id = await createCosa({
          ...fields(null),
          municipalityId: org.municipalityId,
          orgId: org.id,
          audience: effectiveCosaAudience(org.cosateca),
          ownerUid: forGroup ? null : uid,
          ownerName: forGroup ? org.name : myName,
          createdBy: uid,
        });
        if (photo) await updateCosa(id, { ...fields(await uploadCosaImage(id, uid, photo)), status: 'available' });
      }
      onClose();
    } catch {
      showAlert(t('groups.cosateca.errors.save'));
    } finally {
      setSaving(false);
    }
  };

  // The rules check a cosa's owner name against the public profile: without it a
  // personal cosa can only be refused.
  const needsMyName = cosa === null && !(isAdmin && owner === 'group');
  const remove = () => {
    if (!cosa) return;
    showConfirm(
      t('groups.cosateca.form.delete'),
      t('groups.cosateca.form.deleteConfirm'),
      () => {
        deleteCosa(cosa.id)
          .then(onClose)
          .catch(() => showAlert(t('groups.cosateca.errors.save')));
      },
      { confirmText: t('common.delete'), cancelText: t('common.cancel') },
    );
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={t(cosa ? 'groups.cosateca.form.titleEdit' : 'groups.cosateca.form.titleNew')}
      testID="cosa-sheet"
      footer={
        <VStack gap={2} className="px-5 pt-3">
          <Button onPress={() => void save()} loading={saving} disabled={needsMyName && !myName} fullWidth testID="cosa-save">
            {t('groups.cosateca.form.save')}
          </Button>
          {cosa && canDelete ? (
            <Button variant="ghost" onPress={remove} fullWidth testID="cosa-delete">
              {t('groups.cosateca.form.delete')}
            </Button>
          ) : null}
        </VStack>
      }
    >
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <VStack gap={3} className="px-4 pt-4 pb-6">
          <FieldLabel>{t('groups.cosateca.form.kind')}</FieldLabel>
          <SegmentedToggle
            testID="cosa-kind"
            value={kind}
            options={KINDS.map((k) => ({ value: k, label: t(`groups.cosateca.kinds.${k}`) }))}
            onChange={setKind}
          />
          <Text variant="bodySm" tone="muted">
            {t(`groups.cosateca.kindHints.${kind}`)}
          </Text>
          <Input
            label={t('groups.cosateca.form.name')}
            value={title}
            onChangeText={setTitle}
            maxLength={MAX_COSA_TITLE}
            error={titleError}
            testID="cosa-title"
          />
          <FieldLabel>{t('groups.cosateca.form.category')}</FieldLabel>
          <CategoryChips
            testID="cosa-category"
            categories={COSA_CATEGORIES}
            value={category}
            withAll={false}
            onChange={(next) => {
              if (next) setCategory(next);
            }}
          />
          <Input
            label={t('groups.cosateca.form.description')}
            value={description}
            onChangeText={setDescription}
            maxLength={MAX_COSA_DESCRIPTION}
            autoGrow
            testID="cosa-description"
          />
          <Input
            label={t('groups.cosateca.form.conditions')}
            value={conditions}
            onChangeText={setConditions}
            maxLength={MAX_COSA_CONDITIONS}
            testID="cosa-conditions"
          />
          <Text variant="bodySm" tone="muted">
            {t('groups.cosateca.form.conditionsHint')}
          </Text>
          <FieldLabel>{t('groups.cosateca.form.photo')}</FieldLabel>
          <ImagePickerField
            uri={photo?.previewUri ?? cosa?.imageURL ?? null}
            onPress={() => {
              void pickImageAsBlob().then((next) => {
                if (next) setPhoto(next);
              });
            }}
            label={t('groups.cosateca.form.photo')}
            testID="cosa-photo"
          />
          {isAdmin && !cosa ? (
            <>
              <FieldLabel>{t('groups.cosateca.form.owner')}</FieldLabel>
              <SegmentedToggle
                testID="cosa-owner"
                value={owner}
                options={[
                  { value: 'mine', label: t('groups.cosateca.form.ownerMine') },
                  { value: 'group', label: t('groups.cosateca.form.ownerGroup') },
                ]}
                onChange={setOwner}
              />
            </>
          ) : null}
        </VStack>
      </ScrollView>
    </FormModal>
  );
}
