import {
  GroupNotificationPrefsDataSchema,
  NotificationPrefsDataSchema,
} from '../../models/notification/NotificationPrefsDataModel';
import { NotificationSettingsDataSchema } from '../../models/notification/NotificationSettingsDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const notificationPrefsConverterAdmin = makeConverter(NotificationPrefsDataSchema, adminSdkCtors);
export const groupNotificationPrefsConverterAdmin = makeConverter(GroupNotificationPrefsDataSchema, adminSdkCtors);
export const notificationSettingsConverterAdmin = makeConverter(NotificationSettingsDataSchema, adminSdkCtors);
