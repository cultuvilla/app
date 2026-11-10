import { CosaDataSchema, CosaSlotDataSchema } from '../../models/organization/CosaDataModel';
import { CosaRequestDataSchema } from '../../models/organization/CosaRequestDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const cosaConverterClient = makeConverter(CosaDataSchema, clientSdkCtors);
export const cosaRequestConverterClient = makeConverter(CosaRequestDataSchema, clientSdkCtors);
export const cosaSlotConverterClient = makeConverter(CosaSlotDataSchema, clientSdkCtors);
