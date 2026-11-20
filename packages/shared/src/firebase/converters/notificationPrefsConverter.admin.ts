import {
  GroupNotificationPrefsDataSchema,
  NotificationPrefsDataSchema,
} from '../../models/notification/NotificationPrefsDataModel';
import { NotificationSettingsDataSchema } from '../../models/notification/NotificationSettingsDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const notificationPrefsConverterAdmin = adminConverter(NotificationPrefsDataSchema);
export const groupNotificationPrefsConverterAdmin = adminConverter(GroupNotificationPrefsDataSchema);
export const notificationSettingsConverterAdmin = adminConverter(NotificationSettingsDataSchema);
