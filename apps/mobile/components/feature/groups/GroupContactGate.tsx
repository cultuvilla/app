import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView } from 'react-native';
import {
  hasSocioRoster,
  isActiveSocio,
  requiresSocioContact,
  socioContactMissing,
  type SocioContactRequirement,
} from '@cultuvilla/shared/models/organization';
import { removeOrgMember } from '@cultuvilla/shared/services/orgMemberService';
import {
  saveSocioContactSharing,
  watchMySocios,
  watchSocioPrivate,
  type Socio,
  type SocioPrivate,
} from '@cultuvilla/shared/services/socioService';
import { patchUserProfile } from '@cultuvilla/shared/services/userService';
import { BottomSheet, Button, Input, Text, VStack } from '../../primitives';
import { PhoneField } from '../PhoneField';
import { useAuth } from '../../../lib/auth/useAuth';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';
import { useOrganizerPhone } from '../../../lib/useOrganizerPhone';

function noticeKey(org: SocioContactRequirement): string {
  if (org.socioPhoneRequired && org.socioEmailRequired) return 'groups.contactGate.noticeBoth';
  return org.socioPhoneRequired ? 'groups.contactGate.noticePhone' : 'groups.contactGate.noticeEmail';
}

/**
 * Says what the group requires and takes the yes. The values are the account's
 * and are not shown again: only one the account does not have yet is asked for,
 * once, and it stays on the account for the next form that wants it.
 */
function SocioContactAccept({
  orgName,
  requirement,
  confirmLabel,
  onAccepted,
}: {
  orgName: string;
  requirement: SocioContactRequirement;
  confirmLabel: string;
  onAccepted: (contact: { phone: string | null; email: string | null }) => Promise<void>;
}) {
  const { t } = useT();
  const { user, profile, refreshProfile } = useAuth();
  const knownPhone = profile?.telephone?.trim() || null;
  const knownEmail = profile?.email.trim() || user?.email?.trim() || null;
  const asksPhone = requirement.socioPhoneRequired && !knownPhone;
  const asksEmail = requirement.socioEmailRequired && !knownEmail;
  const phone = useOrganizerPhone();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    const phoneOk = !asksPhone || phone.validateForSubmit();
    const emailOk = !asksEmail || email.includes('@');
    setEmailError(emailOk ? undefined : t('groups.contactGate.emailInvalid'));
    if (!user || !phoneOk || !emailOk) return;
    setSaving(true);
    try {
      const typed = { ...(asksPhone ? { telephone: phone.e164 } : {}), ...(asksEmail ? { email: email.trim() } : {}) };
      if (asksPhone || asksEmail) {
        await patchUserProfile(user.uid, typed);
        await refreshProfile();
      }
      await onAccepted({
        phone: asksPhone ? phone.e164 : knownPhone,
        email: asksEmail ? email.trim() : knownEmail,
      });
    } catch {
      showAlert(t('groups.contactGate.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack gap={3} testID="socio-contact-accept">
      <Text>{t(noticeKey(requirement), { name: orgName })}</Text>
      <Text tone="muted" variant="bodySm">
        {t('groups.contactGate.privacy')}
      </Text>
      {asksPhone ? <PhoneField {...phone.fieldProps} testID="socio-contact-phone" /> : null}
      {asksEmail ? (
        <Input
          label={t('groups.consent.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={emailError}
          testID="socio-contact-email"
        />
      ) : null}
      <Button fullWidth loading={saving} testID="socio-contact-accept-button" onPress={() => void accept()}>
        {confirmLabel}
      </Button>
    </VStack>
  );
}

/** The yes on the way into a group that requires contact data. */
export function SocioContactSheet({
  visible,
  orgName,
  requirement,
  onAccepted,
  onClose,
}: {
  visible: boolean;
  orgName: string;
  requirement: SocioContactRequirement;
  onAccepted: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={orgName}
      closeLabel={t('common.close')}
      testID="socio-contact-sheet"
    >
      <SocioContactAccept
        orgName={orgName}
        requirement={requirement}
        confirmLabel={t('groups.contactGate.acceptAndJoin')}
        onAccepted={async () => {
          await onAccepted();
          onClose();
        }}
      />
    </BottomSheet>
  );
}

/**
 * Stands in front of a group's screens while a socio owes it the contact data
 * it requires: they accept, or they leave. Its admins are never held here, or
 * the one who turned it on would be locked out of turning it off. Until the
 * socio's row is known the group shows as usual, so nothing flashes.
 */
export function GroupContactGate({
  group,
  uid,
  onSwitch = null,
  children,
}: {
  group: MyGroup | null;
  uid: string | null;
  onSwitch?: (() => void) | null;
  children: ReactNode;
}) {
  const { t } = useT();
  const org = group?.org ?? null;
  const applies = !!uid && !!org && group?.role !== 'admin' && hasSocioRoster(org.type) && requiresSocioContact(org);
  const orgId = org?.id ?? '';
  const mine = useWatch<Socio[]>(
    'groups:watchMySocios',
    applies && uid ? `${orgId}|${uid}` : null,
    applies && uid ? (next, error) => watchMySocios(orgId, uid, next, error) : null,
  );
  const row = useMemo(
    () => (applies ? (mine.data ?? []).find((s) => s.kind === 'member' && s.uid === uid && isActiveSocio(s)) ?? null : null),
    [applies, mine.data, uid],
  );
  const contact = useWatch<SocioPrivate | null>(
    'groups:watchSocioPrivate',
    applies && row ? `${orgId}|${row.id}` : null,
    applies && row ? (next, error) => watchSocioPrivate(orgId, row.id, next, error) : null,
  );

  if (!applies || !org || !uid || !row || contact.status !== 'ready' || !socioContactMissing(org, contact.data)) {
    return <>{children}</>;
  }

  const leave = () =>
    showConfirm(
      t('groups.contactGate.confirmLeaveTitle'),
      t('groups.contactGate.confirmLeaveBody', { name: org.name }),
      () => {
        removeOrgMember(org.id, uid).catch(() => showAlert(t('groups.contactGate.error')));
      },
      { confirmText: t('groups.contactGate.leave'), cancelText: t('common.cancel') },
    );

  return (
    <ScrollView contentContainerClassName="px-4 pt-6 pb-16" keyboardShouldPersistTaps="handled" testID="group-contact-gate">
      <VStack gap={4}>
        <Text variant="h2" className="font-bold">
          {t('groups.contactGate.title', { name: org.name })}
        </Text>
        <SocioContactAccept
          orgName={org.name}
          requirement={org}
          confirmLabel={t('groups.contactGate.accept')}
          onAccepted={(account) =>
            saveSocioContactSharing(org.id, row.id, {
              phone: org.socioPhoneRequired ? account.phone : (contact.data?.phone ?? null),
              email: org.socioEmailRequired ? account.email : (contact.data?.email ?? null),
            })
          }
        />
        {onSwitch ? (
          <Button fullWidth variant="secondary" testID="group-contact-gate-switch" onPress={onSwitch}>
            {t('groups.contactGate.switch')}
          </Button>
        ) : null}
        <Button fullWidth variant="ghost" testID="group-contact-gate-leave" onPress={leave}>
          {t('groups.contactGate.leave')}
        </Button>
      </VStack>
    </ScrollView>
  );
}
