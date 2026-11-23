import { PushQueueDataSchema } from '../../models/notification/PushQueueDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const pushQueueConverterAdmin = adminConverter(PushQueueDataSchema);
