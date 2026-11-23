import { BlockedUserDataSchema } from '../../models/user/BlockedUserDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const blockedUserConverterAdmin = adminConverter(BlockedUserDataSchema);
