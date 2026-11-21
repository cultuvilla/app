import { CosaDataSchema, CosaSlotDataSchema } from '../../models/organization/CosaDataModel';
import { CosaRequestDataSchema } from '../../models/organization/CosaRequestDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const cosaConverterAdmin = adminConverter(CosaDataSchema);
export const cosaRequestConverterAdmin = adminConverter(CosaRequestDataSchema);
export const cosaSlotConverterAdmin = adminConverter(CosaSlotDataSchema);
