import { parseEntityRef } from '@cultuvilla/shared/utils';
import { entityRefHref } from '../../../../lib/navigation/routes';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useLocalSearchParams, Redirect, router } from 'expo-router';
import { Screen } from '../../../../components/primitives/Screen';
import { Text } from '../../../../components/primitives/Text';
import { Toggle } from '../../../../components/primitives/Toggle';
import { VStack } from '../../../../components/primitives/VStack';
import { FieldLabel } from '../../../../components/primitives/FieldLabel';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { ProposableForm } from '../../../../components/feature/proposable/ProposableForm';
import { DeleteHeaderButton } from '../../../../components/feature/DeleteHeaderButton';
import { useT } from '../../../../lib/i18n';
import { useOrgCapabilities } from '../../../../lib/auth/useOrgCapabilities';
import { getOrganization, updateOrganization, deleteOrganization } from '@cultuvilla/shared/services/organizationService';
import { uploadOrganizationImage } from '@cultuvilla/shared/services/imageService';
import { pickImageAsBlob } from '../../../../lib/images';
import { showConfirm } from '../../../../lib/dialogs';
import {
  PROPOSABLE_ORGANIZATION_TYPES,
  type OrganizationType,
} from '@cultuvilla/shared/models/organization/OrganizationDataModel';

export default function OrgEditScreen() {
  const { pueblo: villageSlug, entidad: entidadRef } = useLocalSearchParams<{ pueblo: string; entidad: string }>();
  const orgId = parseEntityRef(entidadRef ?? '') ?? '';
  const { t } = useT();
  const [municipalityId, setMunicipalityId] = useState<string | undefined>(undefined);
  const { canManage, loading: capLoading } = useOrgCapabilities(orgId, municipalityId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<OrganizationType>('peña');
  const [images, setImages] = useState<string[]>([]);
  const [addingImage, setAddingImage] = useState(false);
  const [membersPublic, setMembersPublic] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  const typeLabel = (ty: OrganizationType) => t(`organization.${ty}` as never);
  const canEditType = PROPOSABLE_ORGANIZATION_TYPES.includes(type);

  useEffect(() => {
    if (!orgId) return;
    void (async () => {
      const o = await getOrganization(orgId);
      if (o) {
        setName(o.name);
        setDescription(o.description ?? '');
        setType(o.type);
        setImages(o.images);
        setMunicipalityId(o.municipalityId);
        setMembersPublic(o.membersPublic);
        setRequiresApproval(o.joinPolicy === 'approval');
      } else {
        setNotFound(true);
      }
      setLoaded(true);
    })();
  }, [orgId]);

  if (capLoading || !loaded) {
    return (
      <Screen padded={false} topInset={false}>
        <ScreenHeader accent title={t('organization.editTitle')} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>
      </Screen>
    );
  }
  if (notFound) {
    return (
      <Screen padded={false} topInset={false}>
        <ScreenHeader accent title={t('organization.editTitle')} />
        <View className="flex-1 items-center justify-center"><Text>{t('common.notFound')}</Text></View>
      </Screen>
    );
  }
  if (!canManage) return <Redirect href={entityRefHref('organization', villageSlug, entidadRef ?? '')} />;

  // Images persist immediately (unlike the create flow, the doc already
  // exists here), so add/remove writes the doc on each action rather than
  // batching to submit.
  async function addImage() {
    if (!orgId) return;
    const picked = await pickImageAsBlob();
    if (!picked) return;
    setAddingImage(true);
    try {
      const url = await uploadOrganizationImage(orgId, picked);
      const next = [...images, url];
      await updateOrganization(orgId, { images: next });
      setImages(next);
    } finally {
      setAddingImage(false);
    }
  }

  async function removeImage(index: number) {
    if (!orgId) return;
    const next = images.filter((_, i) => i !== index);
    await updateOrganization(orgId, { images: next });
    setImages(next);
  }

  async function submit() {
    if (!orgId || !name.trim()) return;
    setSaving(true);
    try {
      await updateOrganization(orgId, {
        name: name.trim(),
        description: description.trim() || null,
        type,
        membersPublic,
        joinPolicy: requiresApproval ? 'approval' : 'open',
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
        title={t('organization.editTitle')}
        rightSlot={
          <DeleteHeaderButton
            onAccent
            onConfirm={() => {
              if (orgId) return deleteOrganization(orgId).then(() => router.replace('/(tabs)'));
            }}
            accessibilityLabel={t('common.delete')}
            confirmTitle={t('common.deleteConfirmTitle')}
            confirmMessage={t('common.deleteConfirmMessage')}
            confirmLabel={t('common.delete')}
            cancelLabel={t('common.cancel')}
            deletingLabel={t('common.deleting.organization')}
          />
        }
      />
      <ScrollView contentContainerClassName="p-4">
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
          nameTestID="org-edit-name-input"
          description={description}
          onChangeDescription={setDescription}
          descriptionLabel={t('organization.description')}
          {...(canEditType
            ? {
                typeLabel: t('organization.type'),
                typeOptions: PROPOSABLE_ORGANIZATION_TYPES.map((ty) => ({
                  value: ty,
                  label: typeLabel(ty),
                })),
                typeValue: type,
                onChangeType: (v: string) => setType(v as OrganizationType),
              }
            : {})}
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
                testID="org-edit-members-public-toggle"
              />
              <Toggle
                value={requiresApproval}
                onValueChange={(next) => {
                  // Opening the group up hides its private events until it
                  // requires approval again — say so before it happens.
                  if (next) setRequiresApproval(true);
                  else
                    showConfirm(
                      t('organization.joinPolicy.switchToOpenTitle'),
                      t('organization.joinPolicy.switchToOpenBody'),
                      () => setRequiresApproval(false),
                    );
                }}
                label={t('organization.joinPolicy.label')}
                testID="org-edit-join-policy-toggle"
              />
              <Text tone="muted" variant="caption">
                {requiresApproval
                  ? t('organization.joinPolicy.approvalHint')
                  : t('organization.joinPolicy.openHint')}
              </Text>
            </VStack>
          }
          submitLabel={t('common.save')}
          submitTestID="org-edit-submit"
          onSubmit={submit}
          saving={saving}
          disabled={!name.trim()}
        />
      </ScrollView>
    </Screen>
  );
}
