import { ContentReportsInbox } from '../../components/feature/ContentReportsInbox';
import { useActiveVillageId } from '../../lib/village/useActiveVillageId';

export default function AdminReportsScreen() {
  return <ContentReportsInbox municipalityId={useActiveVillageId()} />;
}
