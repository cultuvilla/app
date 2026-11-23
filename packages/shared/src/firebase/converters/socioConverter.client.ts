import { SocioDataSchema, SocioPersonaLockDataSchema, SocioPrivateDataSchema } from '../../models/organization/SocioDataModel';
import { clientConverter } from './sdkAdapters.client';

export const socioConverterClient = clientConverter(SocioDataSchema);
export const socioPrivateConverterClient = clientConverter(SocioPrivateDataSchema);
export const socioPersonaLockConverterClient = clientConverter(SocioPersonaLockDataSchema);
