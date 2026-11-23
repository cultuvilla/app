import { MunicipalityPersonDataSchema } from '../../models/municipality/MunicipalityPersonDataModel';
import { clientConverter } from './sdkAdapters.client';

export const municipalityPersonConverterClient = clientConverter(MunicipalityPersonDataSchema);
