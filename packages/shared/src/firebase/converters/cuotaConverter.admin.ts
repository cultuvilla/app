import {
  CuotaAssignmentDataSchema,
  CuotaPaymentDataSchema,
  CuotaReminderDataSchema,
  CuotaSettingsDataSchema,
} from '../../models/organization/CuotaDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const cuotaSettingsConverterAdmin = makeConverter(CuotaSettingsDataSchema, adminSdkCtors);
export const cuotaAssignmentConverterAdmin = makeConverter(CuotaAssignmentDataSchema, adminSdkCtors);
export const cuotaPaymentConverterAdmin = makeConverter(CuotaPaymentDataSchema, adminSdkCtors);
export const cuotaReminderConverterAdmin = makeConverter(CuotaReminderDataSchema, adminSdkCtors);
