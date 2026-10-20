import { useEffect, useMemo, useState } from 'react';
import { isActiveSocio } from '@cultuvilla/shared/models/organization';
import {
  saveSocioContactSharing,
  watchMySocios,
  watchSocioPrivate,
  type Socio,
  type SocioPrivate,
} from '@cultuvilla/shared/services/socioService';
import { Button, Card, HStack, Input, Pressable, Text, Toggle, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useAuth } from '../../../lib/auth/useAuth';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';

/**
 * Asks a member, once, which contact data the junta may see, and stores the
 * answer on their own roster row (`socioPrivate`). Appears as soon as the
 * `syncOrgSocioRoster` trigger has given them a row — seconds after joining.
 * `onlyWhenUnanswered` hides it once answered (the org page); the Grupos tab
 * keeps a one-line summary with a way to change it.
 */
export function SocioConsentCard({ orgId, onlyWhenUnanswered = false }: { orgId: string; onlyWhenUnanswered?: boolean }) {
  const { t } = useT();
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const mine = useWatch<Socio[]>(
    'groups:watchMySocios',
    uid ? `${orgId}|${uid}` : null,
    uid ? (next, error) => watchMySocios(orgId, uid, next, error) : null,
  );
  const row = useMemo(
    () => (mine.data ?? []).find((s) => s.kind === 'member' && s.uid === uid && isActiveSocio(s)) ?? null,
    [mine.data, uid],
  );
  const contact = useWatch<SocioPrivate | null>(
    'groups:watchSocioPrivate',
    row ? `${orgId}|${row.id}` : null,
    row ? (next, error) => watchSocioPrivate(orgId, row.id, next, error) : null,
  );
  const answered = contact.data?.consentAnsweredAt != null;
  const [editing, setEditing] = useState(false);

  if (!row || contact.status !== 'ready') return null;
  if (answered && !editing) {
    if (onlyWhenUnanswered) return null;
    const items = [
      contact.data?.phone ? t('groups.consent.phone') : null,
      contact.data?.email ? t('groups.consent.email') : null,
    ].filter((x): x is string => x !== null);
    return (
      <HStack gap={2} align="center" className="flex-wrap">
        <Text tone="muted" variant="bodySm">
          {items.length > 0
            ? t('groups.consent.sharingSummary', { items: items.join(', ') })
            : t('groups.consent.sharingNothing')}
        </Text>
        <Pressable testID="socio-consent-edit" accessibilityRole="button" onPress={() => setEditing(true)}>
          <Text variant="bodySm" className="text-accent">
            {t('groups.consent.edit')}
          </Text>
        </Pressable>
      </HStack>
    );
  }

  return (
    <ConsentForm
      initialPhone={contact.data?.phone ?? profile?.telephone ?? ''}
      initialEmail={contact.data?.email ?? profile?.email ?? user?.email ?? ''}
      // A first answer starts from "share both"; a change starts from the last one.
      initialSharePhone={answered ? contact.data?.phone != null : true}
      initialShareEmail={answered ? contact.data?.email != null : true}
      onSave={async ({ phone, email }) => {
        await saveSocioContactSharing(orgId, row.id, { phone, email });
        setEditing(false);
      }}
    />
  );
}

function ConsentForm({
  initialPhone,
  initialEmail,
  initialSharePhone,
  initialShareEmail,
  onSave,
}: {
  initialPhone: string;
  initialEmail: string;
  initialSharePhone: boolean;
  initialShareEmail: boolean;
  onSave: (contact: { phone: string | null; email: string | null }) => Promise<void>;
}) {
  const { t } = useT();
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [sharePhone, setSharePhone] = useState(initialSharePhone);
  const [shareEmail, setShareEmail] = useState(initialShareEmail);
  const [saving, setSaving] = useState(false);
  useEffect(() => setPhone(initialPhone), [initialPhone]);
  useEffect(() => setEmail(initialEmail), [initialEmail]);

  const save = () => {
    setSaving(true);
    onSave({ phone: sharePhone ? phone : null, email: shareEmail ? email : null })
      .catch(() => showAlert(t('groups.consent.error')))
      .finally(() => setSaving(false));
  };

  return (
    <Card testID="socio-consent-card">
      <VStack gap={3}>
        <Text variant="h3">{t('groups.consent.title')}</Text>
        <Text tone="muted" variant="bodySm">
          {t('groups.consent.body')}
        </Text>
        <Toggle testID="socio-consent-share-phone" value={sharePhone} onValueChange={setSharePhone} label={t('groups.consent.sharePhone')} />
        {sharePhone ? (
          <Input label={t('groups.consent.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="socio-consent-phone" />
        ) : null}
        <Toggle testID="socio-consent-share-email" value={shareEmail} onValueChange={setShareEmail} label={t('groups.consent.shareEmail')} />
        {shareEmail ? (
          <Input
            label={t('groups.consent.email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            testID="socio-consent-email"
          />
        ) : null}
        <Button onPress={save} loading={saving} testID="socio-consent-save">
          {t('groups.consent.save')}
        </Button>
      </VStack>
    </Card>
  );
}
