import { MunicipalityDataSchema } from '../../models/municipality/MunicipalityDataModel';
import { clientConverter } from './sdkAdapters.client';

export const municipalityConverterClient = clientConverter(MunicipalityDataSchema);
