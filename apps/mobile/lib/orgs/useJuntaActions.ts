import { useCallback } from 'react';
import type { OrgAdminTitle } from '@cultuvilla/shared/models/organization';
import { setOrgMemberRole } from '@cultuvilla/shared/services/orgMemberService';
import { setSocioAdminTitle } from '@cultuvilla/shared/services/socioService';
import { showAlert, showConfirm } from '../dialogs';
import { useT } from '../i18n';

/**
 * What the junta does to its own make-up, shared by the libro (a socio's sheet)
 * and the Junta directiva block: make someone an admin or stop them being one,
 * through the audited callable, and give an admin a cargo.
 */
export function useJuntaActions(orgId: string) {
  const { t } = useT();

  const changeRole = useCallback(
    (uid: string, name: string, promoting: boolean) =>
      showConfirm(
        t(promoting ? 'organization.membersList.confirmPromoteTitle' : 'organization.membersList.confirmDemoteTitle'),
        t(promoting ? 'organization.membersList.confirmPromoteBody' : 'organization.membersList.confirmDemoteBody', { name }),
        () => {
          setOrgMemberRole(orgId, uid, promoting ? 'admin' : 'member').catch(() =>
            showAlert(t('organization.membersList.roleChangeError')),
          );
        },
        { confirmText: t(promoting ? 'organization.membersList.promote' : 'organization.membersList.demote'), cancelText: t('common.cancel') },
      ),
    [orgId, t],
  );

  const setTitle = useCallback(
    (socioId: string, title: OrgAdminTitle | null) => {
      setSocioAdminTitle(orgId, socioId, title).catch(() => showAlert(t('groups.socios.error')));
    },
    [orgId, t],
  );

  /**
   * Into the junta in one step. The cargo waits for the role: the rules let a
   * cargo sit only on an admin's row.
   */
  const addToJunta = useCallback(
    async (uid: string, socioId: string, title: OrgAdminTitle | null) => {
      try {
        await setOrgMemberRole(orgId, uid, 'admin');
      } catch {
        showAlert(t('organization.membersList.roleChangeError'));
        return;
      }
      if (title) setTitle(socioId, title);
    },
    [orgId, setTitle, t],
  );

  return { changeRole, setTitle, addToJunta };
}
