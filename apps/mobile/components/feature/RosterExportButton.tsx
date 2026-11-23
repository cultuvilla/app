import { useCallback } from 'react';
import { buildRosterExport } from '@cultuvilla/shared/export/rosterExport';
import type { RegistrationData } from '@cultuvilla/shared/models/event/RegistrationDataModel';
import type {
  SignupAnswers,
  SignupFieldSpec,
} from '@cultuvilla/shared/models/event/SignupFieldModel';
import type { PartialDate } from '@cultuvilla/shared/models/person/PersonDataModel';
import { useT } from '../../lib/i18n';
import { ExportButton } from './ExportButton';

type Row = RegistrationData & { id: string };

export interface RosterExportButtonProps {
  eventTitle: string;
  eventDate: Date | null;
  registrations: Row[];
  phones: Record<string, string | null>;
  /** Registration id -> the attendee's birth date; adds a roster column. */
  birthdays?: Record<string, PartialDate | null>;
  telephoneRequired: boolean;
  requiresPayment: boolean;
  /** The event's custom questions; each becomes a trailing column. */
  signupFields?: SignupFieldSpec[];
  /** Registration id -> that attendee's answers. */
  answers?: Record<string, SignupAnswers>;
}

/** Roster download control on the event's attendee section. */
export function RosterExportButton(props: RosterExportButtonProps) {
  const { t } = useT();
  const {
    eventTitle,
    eventDate,
    registrations,
    phones,
    birthdays,
    telephoneRequired,
    requiresPayment,
    signupFields,
    answers,
  } = props;

  const buildModel = useCallback(
    () =>
      buildRosterExport({
        eventTitle,
        eventDate,
        registrations,
        phones,
        birthdays,
        telephoneRequired,
        requiresPayment,
        signupFields,
        answers,
      }),
    [eventTitle, eventDate, registrations, phones, birthdays, telephoneRequired, requiresPayment, signupFields, answers],
  );

  if (registrations.length === 0) return null;

  return (
    <ExportButton
      buildModel={buildModel}
      title={t('event.export.title')}
      body={t('event.export.body', { count: registrations.length })}
      accessibilityLabel={t('event.export.action')}
      testID="export-roster"
      xlsxTestID="export-roster-xlsx"
      csvTestID="export-roster-csv"
      scope="rosterExport"
    />
  );
}
