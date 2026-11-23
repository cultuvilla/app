import { DeviceTokenDataSchema } from '../../models/notification/DeviceTokenDataModel';
import { clientConverter } from './sdkAdapters.client';

export const deviceTokenConverterClient = clientConverter(DeviceTokenDataSchema);
