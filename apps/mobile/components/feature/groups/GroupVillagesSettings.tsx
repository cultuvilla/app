import { useState } from 'react';
import type { OrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import { otherVillageIds } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import type { OrgPresenceRequestData } from '@cultuvilla/shared/models/organization/OrgPresenceRequestDataModel';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import {
  cancelOrgPresenceRequest,
  removeOrgPresence,
  requestOrgPresence,
  watchOrgPresenceRequests,
} from '@cultuvilla/shared/services/orgPresenceService';
import { Button, HStack, Text, VStack, VillagePicker } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { useWatch } from '../../../lib/hooks/useWatch';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { useVillageRefs } from '../../../lib/orgs/useVillageRefs';

export type GroupVillagesOrg = Pick<OrganizationData, 'name' | 'municipalityId' | 'municipalityIds'> & { id: string };

/**
 * The pueblos a group is in, for its admins: its home, the others it is listed
 * in (each may be left), the requests still waiting on a pueblo's Equipo (each
 * may be withdrawn), and «Añadir pueblo», which asks a new one.
 * See docs/decisions/multi-village-groups.md.
 */
export function GroupVillagesSettings({ org, uid }: { org: GroupVillagesOrg; uid: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const requests = useWatch<OrgPresenceRequestData[]>(
    'orgs:watchOrgPresenceRequests',
    org.id,
    (next, error) => watchOrgPresenceRequests(org.id, next, error),
  );
  const present = otherVillageIds(org);
  const pending = (requests.data ?? []).map((r) => r.municipalityId).filter((id) => !present.includes(id));
  const refs = useVillageRefs([org.municipalityId, ...present, ...pending]);
  const nameOf = (id: string) => refs.find((v) => v.id === id)?.name ?? '…';

  const run = (key: string, action: () => Promise<void>) => {
    setBusy(key);
    action()
      .catch(() => showAlert(t('organization.villages.error')))
      .finally(() => setBusy(null));
  };

  const ask = async (municipalityId: string | null) => {
    if (!municipalityId) return;
    if (municipalityId === org.municipalityId || present.includes(municipalityId) || pending.includes(municipalityId)) {
      showAlert(t('organization.villages.alreadyThere'));
      return;
    }
    const village = await getMunicipality(municipalityId).catch(() => null);
    if (!village?.communityActive) {
      showAlert(t('organization.villages.notActive', { village: village?.name ?? '' }));
      return;
    }
    run(`ask-${municipalityId}`, () =>
      requestOrgPresence({
        orgId: org.id,
        orgName: org.name,
        homeMunicipalityId: org.municipalityId,
        municipalityId,
        requestedBy: uid,
      }),
    );
  };

  const leave = (municipalityId: string) =>
    showConfirm(
      t('organization.villages.leaveTitle', { village: nameOf(municipalityId) }),
      t('organization.villages.leaveBody', { org: org.name, village: nameOf(municipalityId) }),
      () => run(`leave-${municipalityId}`, () => removeOrgPresence(org.id, municipalityId)),
      { confirmText: t('organization.villages.leave'), cancelText: t('common.cancel') },
    );

  return (
    <VStack gap={3} testID="group-settings-villages-list">
      <Text tone="muted" variant="bodySm">
        {t('organization.villages.settingsHint', { village: nameOf(org.municipalityId) })}
      </Text>
      {present.map((id) => (
        <HStack key={id} gap={2} className="items-center justify-between" testID={`group-village-${id}`}>
          <Text className="flex-1">{nameOf(id)}</Text>
          <Button
            variant="ghost"
            onPress={() => leave(id)}
            loading={busy === `leave-${id}`}
            testID={`group-village-leave-${id}`}
          >
            {t('organization.villages.leave')}
          </Button>
        </HStack>
      ))}
      {pending.map((id) => (
        <HStack key={id} gap={2} className="items-center justify-between" testID={`group-village-pending-${id}`}>
          <VStack gap={0} className="flex-1">
            <Text>{nameOf(id)}</Text>
            <Text tone="muted" variant="caption">
              {t('organization.villages.pending')}
            </Text>
          </VStack>
          <Button
            variant="ghost"
            onPress={() => run(`cancel-${id}`, () => cancelOrgPresenceRequest(org.id, id))}
            loading={busy === `cancel-${id}`}
            testID={`group-village-cancel-${id}`}
          >
            {t('organization.villages.cancel')}
          </Button>
        </HStack>
      ))}
      <VillagePicker
        label={t('organization.villages.add')}
        value={null}
        onChange={(id) => void ask(id)}
        testID="group-village-add"
        trigger={(open) => (
          <Button variant="secondary" onPress={open} loading={busy?.startsWith('ask-') ?? false} testID="group-village-add">
            {t('organization.villages.add')}
          </Button>
        )}
      />
    </VStack>
  );
}
