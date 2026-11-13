import {
  CuotaAssignmentDataSchema,
  CuotaPaymentDataSchema,
  CuotaReminderDataSchema,
  CuotaSettingsDataSchema,
} from '../../models/organization/CuotaDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const cuotaSettingsConverterClient = makeConverter(CuotaSettingsDataSchema, clientSdkCtors);
export const cuotaAssignmentConverterClient = makeConverter(CuotaAssignmentDataSchema, clientSdkCtors);
export const cuotaPaymentConverterClient = makeConverter(CuotaPaymentDataSchema, clientSdkCtors);
export const cuotaReminderConverterClient = makeConverter(CuotaReminderDataSchema, clientSdkCtors);
