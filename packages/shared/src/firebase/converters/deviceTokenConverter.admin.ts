import { DeviceTokenDataSchema } from '../../models/notification/DeviceTokenDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const deviceTokenConverterAdmin = adminConverter(DeviceTokenDataSchema);
