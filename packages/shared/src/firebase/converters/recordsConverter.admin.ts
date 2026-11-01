import { ActaDataSchema, LedgerEntryDataSchema } from '../../models/organization/RecordsDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const actaConverterAdmin = makeConverter(ActaDataSchema, adminSdkCtors);
export const ledgerEntryConverterAdmin = makeConverter(LedgerEntryDataSchema, adminSdkCtors);
