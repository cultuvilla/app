import { RegistrationDataSchema } from '../../models/event/RegistrationDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const registrationConverterAdmin = adminConverter(RegistrationDataSchema);
