import { ActaDataSchema, LedgerEntryDataSchema } from '../../models/organization/RecordsDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const actaConverterAdmin = adminConverter(ActaDataSchema);
export const ledgerEntryConverterAdmin = adminConverter(LedgerEntryDataSchema);
