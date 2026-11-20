import { BlockedUserDataSchema } from '../../models/user/BlockedUserDataModel';
import { clientConverter } from './sdkAdapters.client';

export const blockedUserConverterClient = clientConverter(BlockedUserDataSchema);
