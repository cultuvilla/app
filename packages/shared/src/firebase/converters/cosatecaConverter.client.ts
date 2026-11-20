import { CosaDataSchema, CosaSlotDataSchema } from '../../models/organization/CosaDataModel';
import { CosaRequestDataSchema } from '../../models/organization/CosaRequestDataModel';
import { clientConverter } from './sdkAdapters.client';

export const cosaConverterClient = clientConverter(CosaDataSchema);
export const cosaRequestConverterClient = clientConverter(CosaRequestDataSchema);
export const cosaSlotConverterClient = clientConverter(CosaSlotDataSchema);
