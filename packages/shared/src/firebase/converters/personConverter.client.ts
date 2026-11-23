import { PersonDataSchema } from '../../models/person/PersonDataModel';
import { clientConverter } from './sdkAdapters.client';

export const personConverterClient = clientConverter(PersonDataSchema);
