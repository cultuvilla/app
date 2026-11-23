import { RegistrationEventDataSchema } from '../../models/event/RegistrationEventDataModel';
import { clientConverter } from './sdkAdapters.client';

export const registrationEventConverterClient = clientConverter(RegistrationEventDataSchema);
