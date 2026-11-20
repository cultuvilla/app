import { PlaceDataSchema } from '../../models/municipality/MunicipalityDataModel';
import { clientConverter } from './sdkAdapters.client';

export const placeConverterClient = clientConverter(PlaceDataSchema);
