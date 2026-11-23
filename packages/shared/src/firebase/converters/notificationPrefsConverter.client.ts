import {
  GroupNotificationPrefsDataSchema,
  NotificationPrefsDataSchema,
} from '../../models/notification/NotificationPrefsDataModel';
import { NotificationSettingsDataSchema } from '../../models/notification/NotificationSettingsDataModel';
import { clientConverter } from './sdkAdapters.client';

export const notificationPrefsConverterClient = clientConverter(NotificationPrefsDataSchema);
export const groupNotificationPrefsConverterClient = clientConverter(GroupNotificationPrefsDataSchema);
export const notificationSettingsConverterClient = clientConverter(NotificationSettingsDataSchema);
