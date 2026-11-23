import { VillageMemberDataSchema } from '../../models/municipality/VillageMemberDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const villageMemberConverterAdmin = adminConverter(VillageMemberDataSchema);
