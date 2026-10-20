import { SocioDataSchema, SocioPrivateDataSchema } from '../../models/organization/SocioDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const socioConverterClient = makeConverter(SocioDataSchema, clientSdkCtors);
export const socioPrivateConverterClient = makeConverter(SocioPrivateDataSchema, clientSdkCtors);
