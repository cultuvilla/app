import { SocioDataSchema, SocioNumberingDataSchema, SocioPersonaLockDataSchema, SocioPrivateDataSchema } from '../../models/organization/SocioDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const socioConverterAdmin = adminConverter(SocioDataSchema);
export const socioPrivateConverterAdmin = adminConverter(SocioPrivateDataSchema);
export const socioPersonaLockConverterAdmin = adminConverter(SocioPersonaLockDataSchema);
export const socioNumberingConverterAdmin = adminConverter(SocioNumberingDataSchema);
