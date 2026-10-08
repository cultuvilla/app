import { useState } from 'react';
import {
  requestOrganization, newOrganizationId, approveOrganization,
} from '@cultuvilla/shared/services/organizationService';
import { uploadOrganizationImage } from '@cultuvilla/shared/services/imageService';
import {
  PROPOSABLE_ORGANIZATION_TYPES,
  type OrganizationType,
} from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import { VStack, FieldLabel } from '../../primitives';
import { Toggle } from '../../primitives/Toggle';
import { pickImageAsBlob } from '../../../lib/images';
import { useT } from '../../../lib/i18n';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { ProposableForm } from './ProposableForm';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';

/**
 * "Añadir agrupación" form. A villager proposes a peña/asociación/otros
 * (pending); an organizer proposes-then-auto-approves. Calls `onCreated` after
 * submit. Editing/deleting an org lives on the org's own edit screen, not here.
 */
export function OrganizationsManager({
  villageId,
  initialType = 'peña',
  onCreated,
}: {
  villageId: string;
  /** Preselects the type picker when opened from the add-content sheet. */
  initialType?: OrganizationType;
  onCreated?: () => void;
}) {
  const { t } = useT();
  const { canManage, uid } = useEntityCapabilities(villageId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<OrganizationType>(initialType);
  // Mint the id first so images can be uploaded to the org's storage path
  // before the doc write — proposers can't update the doc afterwards (org
  // update is admin-only).
  const [orgId] = useState(newOrganizationId);
  const [images, setImages] = useState<string[]>([]);
  const [addingImage, setAddingImage] = useState(false);
  const [membersPublic, setMembersPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  async function addImage() {
    const picked = await pickImageAsBlob();
    if (!picked) return;
    setAddingImage(true);
    try {
      const url = await uploadOrganizationImage(orgId, picked);
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
    let succeeded = false;
    try {
      await requestOrganization({
        id: orgId,
        name: name.trim(),
        description: description.trim() || null,
        images,
        type,
        municipalityId: villageId,
        requestedBy: uid,
        status: 'pending',
        membersPublic,
      });
      // Organizer commit: the create path is always pending; auto-approve so the
      // round-trip is invisible (single rules surface + full audit trail).
      if (canManage) await approveOrganization(orgId);
      succeeded = true;
      observability.trackEvent(OBSERVABILITY_EVENTS.ORG_CREATE_SUCCESS, { municipalityId: villageId });
      setName('');
      setDescription('');
      setType('peña');
      setImages([]);
      setMembersPublic(true);
      onCreated?.();
    } catch (e) {
      if (!succeeded) observability.trackEvent(OBSERVABILITY_EVENTS.ORG_CREATE_ERROR, { municipalityId: villageId });
      throw e;
    } finally {
      setSaving(false);
    }
  }

  const typeLabel = (ty: OrganizationType) => t(`organization.${ty}`);

  return (
    <VStack gap={3} className="p-4">
      <ProposableForm
        images={images}
        onAddImage={addImage}
        onRemoveImage={removeImage}
        addingImage={addingImage}
        imageLabels={{
          add: t('organization.addImage'),
          remove: t('organization.removeImage'),
        }}
        name={name}
        onChangeName={setName}
        nameLabel={t('organization.name')}
        nameTestID="org-name-input"
        imagesTestID="org-images"
        descriptionTestID="org-description"
        typeTestIDPrefix="org-type"
        description={description}
        onChangeDescription={setDescription}
        descriptionLabel={t('organization.description')}
        typeLabel={t('organization.type')}
        typeOptions={PROPOSABLE_ORGANIZATION_TYPES.map((ty) => ({ value: ty, label: typeLabel(ty) }))}
        typeValue={type}
        onChangeType={(v) => setType(v as OrganizationType)}
        footer={
          <VStack gap={1}>
            <FieldLabel>{t('organization.privacy')}</FieldLabel>
            <Toggle
              value={membersPublic}
              onValueChange={setMembersPublic}
              label={
                membersPublic
                  ? t('organization.membersPublicLabel')
                  : t('organization.membersPrivateHint')
              }
              testID="org-members-public-toggle"
            />
          </VStack>
        }
        submitLabel={canManage ? t('village.admin.organizations.add') : t('organization.submitRequest')}
        submitTestID="org-submit"
        onSubmit={submit}
        saving={saving}
        disabled={!name.trim()}
      />
    </VStack>
  );
}
