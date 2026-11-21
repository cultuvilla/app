import { ActaDataSchema, LedgerEntryDataSchema } from '../../models/organization/RecordsDataModel';
import { clientConverter } from './sdkAdapters.client';

export const actaConverterClient = clientConverter(ActaDataSchema);
export const ledgerEntryConverterClient = clientConverter(LedgerEntryDataSchema);
