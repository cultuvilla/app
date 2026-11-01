import { SocioDataSchema, SocioNumberingDataSchema, SocioPersonaLockDataSchema, SocioPrivateDataSchema } from '../../models/organization/SocioDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const socioConverterAdmin = makeConverter(SocioDataSchema, adminSdkCtors);
export const socioPrivateConverterAdmin = makeConverter(SocioPrivateDataSchema, adminSdkCtors);
export const socioPersonaLockConverterAdmin = makeConverter(SocioPersonaLockDataSchema, adminSdkCtors);
export const socioNumberingConverterAdmin = makeConverter(SocioNumberingDataSchema, adminSdkCtors);
