import { PublicProfileDataSchema } from '../../models/user/PublicProfileDataModel';
import { makeConverter } from './makeConverter';
import { clientSdkCtors } from './sdkAdapters.client';

export const publicProfileConverterClient = makeConverter(PublicProfileDataSchema, clientSdkCtors);
