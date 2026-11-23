import {
  CuotaAssignmentDataSchema,
  CuotaPaymentDataSchema,
  CuotaReminderDataSchema,
  CuotaSettingsDataSchema,
} from '../../models/organization/CuotaDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const cuotaSettingsConverterAdmin = adminConverter(CuotaSettingsDataSchema);
export const cuotaAssignmentConverterAdmin = adminConverter(CuotaAssignmentDataSchema);
export const cuotaPaymentConverterAdmin = adminConverter(CuotaPaymentDataSchema);
export const cuotaReminderConverterAdmin = adminConverter(CuotaReminderDataSchema);
