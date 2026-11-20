import { VillageMemberDataSchema } from '../../models/municipality/VillageMemberDataModel';
import { clientConverter } from './sdkAdapters.client';

export const villageMemberConverterClient = clientConverter(VillageMemberDataSchema);
