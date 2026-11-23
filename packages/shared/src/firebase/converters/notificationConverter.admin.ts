import { NotificationDataSchema } from '../../models/notification/NotificationDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const notificationConverterAdmin = adminConverter(NotificationDataSchema);
