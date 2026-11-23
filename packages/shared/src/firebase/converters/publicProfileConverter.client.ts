import { PublicProfileDataSchema } from '../../models/user/PublicProfileDataModel';
import { clientConverter } from './sdkAdapters.client';

export const publicProfileConverterClient = clientConverter(PublicProfileDataSchema);
