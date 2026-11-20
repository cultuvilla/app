import { UserDataSchema } from '../../models/user/UserDataModel';
import { clientConverter } from './sdkAdapters.client';

export const userConverterClient = clientConverter(UserDataSchema);
