import { ActaDataSchema, LedgerEntryDataSchema } from '../../models/organization/RecordsDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const actaConverterClient = makeConverter(ActaDataSchema, clientSdkCtors);
export const ledgerEntryConverterClient = makeConverter(LedgerEntryDataSchema, clientSdkCtors);
