import { SeatTokenDataSchema } from '../../models/event/SeatTokenModel';
import { adminConverter } from './sdkAdapters.admin';

export const seatTokenConverterAdmin = adminConverter(SeatTokenDataSchema);
