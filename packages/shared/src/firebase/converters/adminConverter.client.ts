import { AdminDataSchema } from '../../models/admin/AdminDataModel';
import { clientConverter } from './sdkAdapters.client';

export const adminConverterClient = clientConverter(AdminDataSchema);
