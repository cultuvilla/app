import { EventDataSchema } from '../../models/event/EventDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const eventConverterAdmin = adminConverter(EventDataSchema);
