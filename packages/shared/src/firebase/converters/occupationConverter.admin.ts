import { OccupationDataSchema } from '../../models/occupation/OccupationDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const occupationConverterAdmin = adminConverter(OccupationDataSchema);
