import { RegistrationEventDataSchema } from '../../models/event/RegistrationEventDataModel';
import { adminConverter } from './sdkAdapters.admin';

export const registrationEventConverterAdmin = adminConverter(RegistrationEventDataSchema);
