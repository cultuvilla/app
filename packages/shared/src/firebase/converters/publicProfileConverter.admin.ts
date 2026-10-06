import { PublicProfileDataSchema } from '../../models/user/PublicProfileDataModel';
import { makeConverter } from './makeConverter';
import { adminSdkCtors } from './sdkAdapters.admin';

export const publicProfileConverterAdmin = makeConverter(PublicProfileDataSchema, adminSdkCtors);
