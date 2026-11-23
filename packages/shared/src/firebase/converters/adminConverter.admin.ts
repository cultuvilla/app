import { AdminDataSchema } from '../../models/admin/AdminDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const adminConverterAdmin = adminConverter(AdminDataSchema);
