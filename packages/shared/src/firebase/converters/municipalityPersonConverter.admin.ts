import { MunicipalityPersonDataSchema } from '../../models/municipality/MunicipalityPersonDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const municipalityPersonConverterAdmin = adminConverter(MunicipalityPersonDataSchema);
