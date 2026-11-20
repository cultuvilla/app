import { BarrioDataSchema } from '../../models/municipality/MunicipalityDataModel';
import { clientConverter } from './sdkAdapters.client';

export const barrioConverterClient = clientConverter(BarrioDataSchema);
