import { PublicProfileDataSchema } from '../../models/user/PublicProfileDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const publicProfileConverterAdmin = adminConverter(PublicProfileDataSchema);
