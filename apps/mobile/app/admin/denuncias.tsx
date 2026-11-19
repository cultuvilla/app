import { ContentReportsInbox } from '../../components/feature/ContentReportsInbox';

// App admins moderate every pueblo, whichever village they have open.
export default function AdminReportsScreen() {
  return <ContentReportsInbox allVillages />;
}
