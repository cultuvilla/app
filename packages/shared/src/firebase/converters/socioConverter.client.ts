import { SocioDataSchema, SocioPersonaLockDataSchema, SocioPrivateDataSchema } from '../../models/organization/SocioDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const socioConverterClient = makeConverter(SocioDataSchema, clientSdkCtors);
export const socioPrivateConverterClient = makeConverter(SocioPrivateDataSchema, clientSdkCtors);
export const socioPersonaLockConverterClient = makeConverter(SocioPersonaLockDataSchema, clientSdkCtors);
