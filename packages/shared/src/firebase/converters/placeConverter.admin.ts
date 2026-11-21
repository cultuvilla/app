import { PlaceDataSchema } from '../../models/municipality/MunicipalityDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const placeConverterAdmin = adminConverter(PlaceDataSchema);
