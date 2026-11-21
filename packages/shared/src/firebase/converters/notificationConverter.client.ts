import { NotificationDataSchema } from '../../models/notification/NotificationDataModel';
import { clientConverter } from './sdkAdapters.client';

export const notificationConverterClient = clientConverter(NotificationDataSchema);
