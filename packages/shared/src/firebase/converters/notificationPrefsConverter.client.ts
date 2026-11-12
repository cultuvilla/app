import {
  GroupNotificationPrefsDataSchema,
  NotificationPrefsDataSchema,
} from '../../models/notification/NotificationPrefsDataModel';
import { NotificationSettingsDataSchema } from '../../models/notification/NotificationSettingsDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const notificationPrefsConverterClient = makeConverter(NotificationPrefsDataSchema, clientSdkCtors);
export const groupNotificationPrefsConverterClient = makeConverter(GroupNotificationPrefsDataSchema, clientSdkCtors);
export const notificationSettingsConverterClient = makeConverter(NotificationSettingsDataSchema, clientSdkCtors);
