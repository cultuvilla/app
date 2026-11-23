import { UserDataSchema } from '../../models/user/UserDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const userConverterAdmin = adminConverter(UserDataSchema);
