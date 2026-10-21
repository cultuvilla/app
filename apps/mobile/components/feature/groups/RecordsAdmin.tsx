import { Card, VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { useT } from '../../../lib/i18n';
import { ActasAdmin } from './ActasAdmin';
import { LibroSocios } from './LibroSocios';
import { YearSummaryAdmin } from './YearSummaryAdmin';

/**
 * "Registros" in Gestionar, for groups with a socio roster: the libro de
 * socios, the actas and the year's accounts — what the law asks an asociación
 * to keep, and what the asamblea approves.
 */
export function RecordsAdmin({ orgId, orgName, uid }: { orgId: string; orgName: string; uid: string }) {
  const { t } = useT();
  return (
    <VStack gap={3} testID="records-admin">
      <DetailSectionHeading>{t('groups.records.title')}</DetailSectionHeading>
      <Card>
        <LibroSocios orgId={orgId} orgName={orgName} />
      </Card>
      <Card>
        <ActasAdmin orgId={orgId} orgName={orgName} uid={uid} />
      </Card>
      <Card>
        <YearSummaryAdmin orgId={orgId} orgName={orgName} uid={uid} />
      </Card>
    </VStack>
  );
}
