import { AppVersionConfigSchema } from '../../models/config';
import { clientConverter } from './sdkAdapters.client';

export const appVersionConfigConverterClient = clientConverter(AppVersionConfigSchema);
