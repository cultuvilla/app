import { useMemo, useState } from 'react';
import { buildNameWithNickname, isDeceased, type PersonData } from '@cultuvilla/shared/models/person';
import { isActiveSocio } from '@cultuvilla/shared/models/organization';
import { watchPersonsByCreator } from '@cultuvilla/shared/services/personService';
import { addPersonaSocio, setSocioBaja, watchMySocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { Button, HStack, Text, VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';

type Person = PersonData & { id: string };

/**
 * A member's personas a cargo (people they created who have no account of
 * their own), each one a tap away from being a socio of the group — or from the
 * baja. Hidden when the member has none.
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

  if (personas.length === 0 || mine.status !== 'ready') return null;

  const run = (personId: string, work: () => Promise<unknown>) => {
    setBusy(personId);
    work()
      .catch(() => showAlert(t('groups.personas.error')))
      .finally(() => setBusy(null));
  };

  return (
    <VStack gap={2} testID="my-personas-socios">
      <DetailSectionHeading>{t('groups.personas.title')}</DetailSectionHeading>
      <Text tone="muted" variant="bodySm">
        {t('groups.personas.hint')}
      </Text>
      {personas.map((p) => {
        const name = buildNameWithNickname(p).trim();
        const row = rowByPerson.get(p.id);
        return (
          <HStack key={p.id} gap={3} align="center" justify="between" className="py-1">
            <VStack gap={0} className="flex-1">
              <Text>{name}</Text>
              {row ? (
                <Text tone="success" variant="bodySm">
                  {t('groups.personas.isSocio')}
                </Text>
              ) : null}
            </VStack>
            {row ? (
              <Button
                variant="ghost"
                testID={`persona-socio-remove-${p.id}`}
                loading={busy === p.id}
                onPress={() =>
                  showConfirm(
                    t('groups.personas.confirmRemoveTitle'),
                    t('groups.personas.confirmRemoveBody', { name }),
                    () => run(p.id, () => setSocioBaja(orgId, row)),
                    { confirmText: t('groups.personas.remove'), cancelText: t('common.cancel') },
                  )
                }
              >
                {t('groups.personas.remove')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                testID={`persona-socio-add-${p.id}`}
                loading={busy === p.id}
                onPress={() => run(p.id, () => addPersonaSocio(orgId, { id: p.id, displayName: name }, uid))}
              >
                {t('groups.personas.add')}
              </Button>
            )}
          </HStack>
        );
      })}
    </VStack>
  );
}
