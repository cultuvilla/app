import { ModerationEventDataSchema } from '../../models/moderation/ModerationEventDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const moderationEventConverterAdmin = adminConverter(ModerationEventDataSchema);
