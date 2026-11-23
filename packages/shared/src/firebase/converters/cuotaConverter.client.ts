import {
  CuotaAssignmentDataSchema,
  CuotaPaymentDataSchema,
  CuotaReminderDataSchema,
  CuotaSettingsDataSchema,
} from '../../models/organization/CuotaDataModel';
import { clientConverter } from './sdkAdapters.client';

export const cuotaSettingsConverterClient = clientConverter(CuotaSettingsDataSchema);
export const cuotaAssignmentConverterClient = clientConverter(CuotaAssignmentDataSchema);
export const cuotaPaymentConverterClient = clientConverter(CuotaPaymentDataSchema);
export const cuotaReminderConverterClient = clientConverter(CuotaReminderDataSchema);
