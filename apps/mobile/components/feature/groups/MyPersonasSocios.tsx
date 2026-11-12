import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { buildNameWithNickname, isDeceased, type PersonData } from '@cultuvilla/shared/models/person';
import { isActiveSocio } from '@cultuvilla/shared/models/organization';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { watchPersonsByCreator } from '@cultuvilla/shared/services/personService';
import { addPersonaSocio, setSocioBaja, watchMySocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { HStack, Pressable, Text } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { personHref } from '../../../lib/navigation/routes';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';

type Person = PersonData & { id: string };

/**
 * A member's personas a cargo (people they created who have no account of
 * their own) as chips on their ficha: a socio's chip carries its number and
 * offers the baja; any other offers "＋ Hacer socio". The last chip adds a persona.
 */
export function MyPersonasSocios({ orgId, uid }: { orgId: string; uid: string }) {
  const { t } = useT();
  const persons = useWatch<Person[]>(
    'groups:watchPersonsByCreator',
    uid,
    (next, error) => watchPersonsByCreator(uid, uid, next, error),
  );
  const mine = useWatch<Socio[]>('groups:watchMySocios', `${orgId}|${uid}`, (next, error) =>
    watchMySocios(orgId, uid, next, error),
  );
  const [busy, setBusy] = useState<string | null>(null);

  const personas = useMemo(
    () => (persons.data ?? []).filter((p) => p.userId === null && !isDeceased(p)),
    [persons.data],
  );
  const rowByPerson = useMemo(
    () =>
      new Map(
        (mine.data ?? [])
          .filter((s) => s.kind === 'persona' && isActiveSocio(s) && s.personId)
          .map((s) => [s.personId, s]),
      ),
    [mine.data],
  );

  if (persons.status !== 'ready' || mine.status !== 'ready') return null;

  const run = (personId: string, work: () => Promise<unknown>) => {
    setBusy(personId);
    work()
      .catch(() => showAlert(t('groups.personas.error')))
      .finally(() => setBusy(null));
  };

  return (
    <View testID="my-personas-socios" className="flex-row flex-wrap gap-2">
      {personas.map((p) => {
        const name = buildNameWithNickname(p).trim();
        const short = p.givenName.trim() || name;
        const row = rowByPerson.get(p.id);
        if (row) {
          return (
            <Chip
              key={p.id}
              testID={`persona-socio-remove-${p.id}`}
              busy={busy === p.id}
              label={
                row.socioNumber !== null
                  ? t('groups.personas.chipSocio', { name: short, number: String(row.socioNumber) })
                  : short
              }
              icon="checkmark-circle"
              onPress={() =>
                showConfirm(
                  t('groups.personas.confirmRemoveTitle'),
                  t('groups.personas.confirmRemoveBody', { name }),
                  () => run(p.id, () => setSocioBaja(orgId, row)),
                  { confirmText: t('groups.personas.remove'), cancelText: t('common.cancel') },
                )
              }
            />
          );
        }
        return (
          <Chip
            key={p.id}
            testID={`persona-socio-add-${p.id}`}
            busy={busy === p.id}
            accent
            label={t('groups.personas.chipAdd', { name: short })}
            onPress={() => run(p.id, () => addPersonaSocio(orgId, { id: p.id, displayName: name }, uid))}
          />
        );
      })}
      <Chip testID="persona-socio-new" icon="add" accent label={t('groups.personas.new')} onPress={() => router.push(personHref('new'))} />
    </View>
  );
}

function Chip({
  label,
  icon,
  accent = false,
  busy = false,
  onPress,
  testID,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: boolean;
  busy?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={onPress}
      className={`rounded-full px-3 py-1 border ${accent ? 'border-accent' : 'border-subtle bg-surface'} ${busy ? 'opacity-50' : ''}`}
    >
      <HStack gap={1} align="center">
        {icon ? (
          <Ionicons name={icon} size={iconSizes.sm} color={accent ? colors.light.fg.accent : colors.light.fg.success} />
        ) : null}
        <Text variant="bodySm" className={accent ? 'text-accent font-medium' : 'font-medium'}>
          {label}
        </Text>
      </HStack>
    </Pressable>
  );
}
