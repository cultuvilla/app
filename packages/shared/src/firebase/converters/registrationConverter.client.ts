import { RegistrationDataSchema } from '../../models/event/RegistrationDataModel';
import { clientConverter } from './sdkAdapters.client';

export const registrationConverterClient = clientConverter(RegistrationDataSchema);
