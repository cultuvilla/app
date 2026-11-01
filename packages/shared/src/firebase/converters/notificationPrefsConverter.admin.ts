import {
  GroupNotificationPrefsDataSchema,
  NotificationPrefsDataSchema,
} from '../../models/notification/NotificationPrefsDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const notificationPrefsConverterAdmin = makeConverter(NotificationPrefsDataSchema, adminSdkCtors);
export const groupNotificationPrefsConverterAdmin = makeConverter(GroupNotificationPrefsDataSchema, adminSdkCtors);
