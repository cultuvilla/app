import { MunicipalityDataSchema } from '../../models/municipality/MunicipalityDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const municipalityConverterAdmin = adminConverter(MunicipalityDataSchema);
