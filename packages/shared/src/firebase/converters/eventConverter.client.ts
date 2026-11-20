import { EventDataSchema } from '../../models/event/EventDataModel';
import { clientConverter } from './sdkAdapters.client';

export const eventConverterClient = clientConverter(EventDataSchema);
