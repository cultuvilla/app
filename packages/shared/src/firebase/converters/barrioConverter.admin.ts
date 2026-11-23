import { BarrioDataSchema } from '../../models/municipality/MunicipalityDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const barrioConverterAdmin = adminConverter(BarrioDataSchema);
