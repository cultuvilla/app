import { SeatTokenDataSchema } from '../../models/event/SeatTokenModel';
import { clientConverter } from './sdkAdapters.client';

export const seatTokenConverterClient = clientConverter(SeatTokenDataSchema);
