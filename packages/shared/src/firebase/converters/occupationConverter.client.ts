import { OccupationDataSchema } from '../../models/occupation/OccupationDataModel';
import { clientConverter } from './sdkAdapters.client';

export const occupationConverterClient = clientConverter(OccupationDataSchema);
