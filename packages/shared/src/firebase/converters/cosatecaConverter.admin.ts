import { CosaDataSchema, CosaSlotDataSchema } from '../../models/organization/CosaDataModel';
import { CosaRequestDataSchema } from '../../models/organization/CosaRequestDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const cosaConverterAdmin = makeConverter(CosaDataSchema, adminSdkCtors);
export const cosaRequestConverterAdmin = makeConverter(CosaRequestDataSchema, adminSdkCtors);
export const cosaSlotConverterAdmin = makeConverter(CosaSlotDataSchema, adminSdkCtors);
