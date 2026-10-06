import { LegalDocScreen } from '../../components/feature/LegalDocScreen';
import { LEGAL_DOCS } from '@cultuvilla/shared/legal';

export default function PrivacyScreen() {
  return <LegalDocScreen doc={LEGAL_DOCS.privacy} />;
}
